from ultralytics import YOLO
import cv2
import pika
import json
import time
import datetime
import os
import argparse
import threading
import urllib.request
import urllib.error
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

from vehicle_link import CountSmoother, VehicleLinker, find_holder

# =====================================================================
# SentinelAI multi-camera detection service
# =====================================================================
# This service behaves like a real deployment: instead of hardcoding one
# video, it asks camera-service which cameras are ACTIVE and, for each one,
# opens that camera's `streamUrl` and runs detection on it in its own thread.
# Every event a camera worker publishes is tagged with that camera's `id` and
# `zoneId`, so the backend creates incidents for exactly the right camera/zone.
#
# For a demo, a camera's `streamUrl` is simply a path to a video file (e.g.
# `/videos/lobby.mp4`). OpenCV's VideoCapture opens files and RTSP URLs
# identically, so the same field works for a real camera later (rtsp://...).
# Each worker LOOPS its video so the "feed" never ends — detection keeps
# happening as long as the service runs, which is what makes it live for a
# demo audience.
#
# Configuration comes from environment variables (works locally and in
# docker-compose); CLI flags override for quick single-camera testing.
#
#   CAMERA_SERVICE_URL    base URL of camera-service (default http://localhost:8082)
#   INTERNAL_SERVICE_KEY  shared internal key for the internal cameras endpoint
#   RABBITMQ_URL          amqp url (default amqp://guest:guest@localhost:5672/)
#   EXCHANGE_NAME         events exchange (default sentinelai.events)
#   CAMERA_POLL_SECONDS   how often to re-check camera-service for changes (default 15)
#   MAX_CAMERAS           safety cap on concurrent camera workers (default 3)
#
# Single-camera override (skips camera-service discovery entirely):
#   python fused_pipeline.py --video test_video.mp4 \
#       --camera-id <uuid> --zone-id <uuid>

_parser = argparse.ArgumentParser(description="SentinelAI multi-camera detection service")
_parser.add_argument("--video", default=None,
                     help="Single-camera override: path/URL of the video to treat as a camera feed")
_parser.add_argument("--camera-id", default=None,
                     help="Single-camera override: UUID of the camera (must exist in camera-service)")
_parser.add_argument("--zone-id", default=None,
                     help="Single-camera override: UUID of the zone the camera monitors")
_parser.add_argument("--show", action="store_true",
                     help="Show annotated windows (only usable with a single camera on a desktop)")
_args = _parser.parse_args()


def _env(name, default):
    val = os.environ.get(name)
    return val if val not in (None, "") else default


CAMERA_SERVICE_URL = _env("CAMERA_SERVICE_URL", "http://localhost:8082").rstrip("/")
INTERNAL_SERVICE_KEY = _env("INTERNAL_SERVICE_KEY",
                            "a_long_random_string_only_your_services_know_for_this_internship")
RABBITMQ_URL = _env("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
EXCHANGE_NAME = _env("EXCHANGE_NAME", "sentinelai.events")
CAMERA_POLL_SECONDS = int(_env("CAMERA_POLL_SECONDS", "15"))
MAX_CAMERAS = int(_env("MAX_CAMERAS", "3"))

# Port for the built-in MJPEG server that streams each worker's annotated
# frames (bounding boxes drawn) to the frontend. The frontend points a camera's
# live view at http://<host>:<MJPEG_PORT>/stream/<cameraId>.
MJPEG_PORT = int(_env("MJPEG_PORT", "8091"))

# Registry of live workers keyed by camera id, so the MJPEG server can find the
# right worker's latest annotated frame. Guarded by a lock because workers are
# added/removed from the orchestrator thread while the HTTP server reads it.
WORKERS_REGISTRY = {}
WORKERS_REGISTRY_LOCK = threading.Lock()

# =====================================================================
# Detection models (shared, read-only weights)
# =====================================================================
# The trained weights are shared across camera workers, but each worker keeps
# its OWN tracker state (see per-camera model instances below). Loading the
# weights once and reusing the file is fine; ultralytics tracking state lives
# on the call, and we isolate it per camera by giving each worker its own YOLO
# objects. On a constrained machine, reusing the same YOLO objects across
# threads would entangle tracker state between cameras, so we accept the extra
# memory of per-camera models (with MAX_CAMERAS capping the count).

WEAPON_WEIGHTS = "runs/detect/weapon_detector_v4/weights/best.pt"
PERSON_VEHICLE_WEIGHTS = "yolov8m.pt"

VEHICLE_CLASSES = [2, 3, 5, 7]
COCO_PERSON_CLASS = 0

# --- Vehicle detection toggle ---
# Enabled by default. The wall-clock frame-dropping loop keeps playback smooth
# regardless of detection cost, so we can afford full accuracy here.
ENABLE_VEHICLE_DETECTION = _env("ENABLE_VEHICLE_DETECTION", "1") == "1"
VEHICLE_IMGSZ = int(_env("VEHICLE_IMGSZ", "640"))
VEHICLE_EVERY_N_FRAMES = int(_env("VEHICLE_EVERY_N_FRAMES", "2"))

# --- Detection tuning ---
PERSON_CONF_THRESHOLD = float(_env("PERSON_CONF_THRESHOLD", "0.35"))
VEHICLE_CONF = float(_env("VEHICLE_CONF", "0.3"))
# Tracker configs. A detection only gets an id (and can be counted) if its score
# reaches the tracker's new_track_thresh, which is 0.4 in botsort_custom.yaml, so
# lowering the conf values above has no effect unless you also point these at
# botsort_lowthresh.yaml (new_track_thresh 0.25).
PERSON_TRACKER = _env("PERSON_TRACKER", "botsort_custom.yaml")
VEHICLE_TRACKER = _env("VEHICLE_TRACKER", "botsort_custom.yaml")
# Detection input size. 640 (default YOLO) gives the best accuracy, including
# small/distant people. Lower it via env only if you need more speed and accept
# missing small objects. The wall-clock frame-dropping loop keeps playback
# smooth regardless, so 640 is a safe default.
PERSON_IMGSZ = int(_env("PERSON_IMGSZ", "640"))
# --- Weapon detection tuning (all env-tunable so you can relax/diagnose) ---
# WEAPON_CONF_THRESHOLD  minimum confidence to count a weapon (default 0.4)
# MIN_WEAPON_AREA        minimum box area in px^2 to reject tiny specks (default 400)
# CONFIRM_AFTER_N_FRAMES how many qualifying frames the SAME weapon track must
#                        persist before we alert (default 5). Lower it if the
#                        tracker churns IDs and the count never reaches it.
# WEAPON_REQUIRE_ASSOCIATION  require the weapon to overlap/be inside a detected
#                        person box (default "1"). Set to "0" to alert on a
#                        weapon even when no person is detected near it — useful
#                        when the person model misses the holder or the two
#                        models disagree on boxes.
# ASSOCIATION_IOU_THRESHOLD  IoU (or center-inside) needed for association.
# WEAPON_CONF_TRACK      confidence passed to the weapon tracker itself (the
#                        model won't even emit boxes below this). Default 0.25.
# WEAPON_DEBUG           when "1", print every raw weapon detection each frame
#                        with the reason it did/didn't qualify. Default "0".
WEAPON_CONF_THRESHOLD = float(_env("WEAPON_CONF_THRESHOLD", "0.4"))
MIN_WEAPON_AREA = float(_env("MIN_WEAPON_AREA", "400"))
CONFIRM_AFTER_N_FRAMES = int(_env("CONFIRM_AFTER_N_FRAMES", "3"))
ASSOCIATION_IOU_THRESHOLD = float(_env("ASSOCIATION_IOU_THRESHOLD", "0.02"))
WEAPON_REQUIRE_ASSOCIATION = _env("WEAPON_REQUIRE_ASSOCIATION", "1") == "1"
WEAPON_CONF_TRACK = float(_env("WEAPON_CONF_TRACK", "0.25"))
WEAPON_DEBUG = _env("WEAPON_DEBUG", "0") == "1"
WEAPON_EVERY_N_FRAMES = int(_env("WEAPON_EVERY_N_FRAMES", "2"))

# Run the person model on the frames the loop actually processes. Since the
# wall-clock loop already drops frames under load to keep playback real-time,
# we detect on (nearly) every *processed* frame for best accuracy. Raise this
# only if you want to spend detection budget elsewhere. 1 = every processed
# frame.
PERSON_EVERY_N_FRAMES = int(_env("PERSON_EVERY_N_FRAMES", "1"))

TRACK_TIMEOUT_FRAMES = 45
PUBLISH_CHECK_INTERVAL = 15

# Cap per-worker processing rate so several looping videos can share one CPU
# without starving each other. 0 disables throttling.
TARGET_FPS = float(_env("TARGET_FPS", "12"))

# Evidence images (annotated frames) saved for incident timelines. They are
# served back at /snapshots/<file name> by the MJPEG server below.
SNAPSHOT_DIR = _env("SNAPSHOT_DIR", "alert_snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# While people/vehicles stay in view, re-send an update this often (seconds).
# The backend uses these heartbeats to tell an ongoing situation from one that
# is over; keep it well below the incident-service INCIDENT_GRACE_SECONDS.
HEARTBEAT_SECONDS = float(_env("HEARTBEAT_SECONDS", "10"))


def now_iso():
    return datetime.datetime.now().astimezone().isoformat()


# =====================================================================
# Geometry helpers (pure, thread-safe)
# =====================================================================
def compute_iou(box_a, box_b):
    xa, ya = max(box_a[0], box_b[0]), max(box_a[1], box_b[1])
    xb, yb = min(box_a[2], box_b[2]), min(box_a[3], box_b[3])
    inter = max(0, xb - xa) * max(0, yb - ya)
    if inter == 0:
        return 0.0
    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    return inter / float(area_a + area_b - inter)


def center_inside(inner, outer):
    cx, cy = (inner[0] + inner[2]) / 2, (inner[1] + inner[3]) / 2
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


def is_associated(weapon_box, body_boxes):
    for bbox in body_boxes:
        if compute_iou(weapon_box, bbox) > ASSOCIATION_IOU_THRESHOLD or center_inside(weapon_box, bbox):
            return True
    return False


def box_area(box):
    return (box[2] - box[0]) * (box[3] - box[1])


# =====================================================================
# Camera discovery
# =====================================================================
def fetch_active_cameras():
    """Ask camera-service for the list of active cameras via the internal
    endpoint. Returns a list of dicts with at least id, zoneId, streamUrl,
    name. On any failure returns an empty list (caller decides fallback)."""
    url = f"{CAMERA_SERVICE_URL}/internal/cameras/active"
    req = urllib.request.Request(url, headers={
        "X-Internal-Service-Key": INTERNAL_SERVICE_KEY,
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                print(f"[discovery] camera-service returned status {resp.status}")
                return []
            data = json.loads(resp.read().decode("utf-8"))
            return data if isinstance(data, list) else []
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        print(f"[discovery] failed to fetch cameras from {url}: {e}")
        return []


# =====================================================================
# Per-camera detection worker
# =====================================================================
class CameraWorker(threading.Thread):
    """Runs detection on a single camera feed in its own thread, with its own
    model/tracker state, its own RabbitMQ channel, and its own presence state.
    Loops the video source so the feed never ends."""

    def __init__(self, camera_id, zone_id, stream_url, name="camera", show=False):
        super().__init__(daemon=True)
        self.camera_id = camera_id
        self.zone_id = zone_id
        self.stream_url = stream_url
        self.cam_name = name
        self.show = show
        # NOTE: do NOT name this `_stop` — that shadows threading.Thread._stop()
        # (an internal method), which breaks Thread.join() on shutdown.
        self._stop_event = threading.Event()

        # Latest annotated frame, encoded as JPEG bytes, for the MJPEG server.
        # Updated every processed frame; read by any number of HTTP clients.
        self._latest_jpeg = None
        self._latest_jpeg_lock = threading.Lock()

        # Per-camera models so tracker state is isolated between cameras.
        self.person_model = YOLO(PERSON_VEHICLE_WEIGHTS)
        self.vehicle_model = YOLO(PERSON_VEHICLE_WEIGHTS)
        self.weapon_model = YOLO(WEAPON_WEIGHTS)

        # Per-camera RabbitMQ connection (pika channels are NOT thread-safe,
        # so each worker owns its own connection + channel).
        self.mq_conn = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        self.channel = self.mq_conn.channel()
        self.channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type="topic", durable=True)

    def stop(self):
        self._stop_event.set()

    def publish(self, routing_key, payload):
        try:
            self.channel.basic_publish(
                exchange=EXCHANGE_NAME, routing_key=routing_key,
                body=json.dumps(payload),
                properties=pika.BasicProperties(content_type="application/json"),
            )
            print(f"[{self.cam_name}] published -> {routing_key}: {payload}")
        except Exception as e:  # keep one camera's MQ hiccup from killing it
            print(f"[{self.cam_name}] publish failed: {e}")

    def _store_annotated(self, frame):
        """Encode the given (annotated) frame as JPEG and store it as this
        worker's latest frame for the MJPEG server."""
        try:
            ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if ok:
                with self._latest_jpeg_lock:
                    self._latest_jpeg = buf.tobytes()
        except Exception:
            pass  # a bad encode must never take the worker down

    def get_latest_jpeg(self):
        with self._latest_jpeg_lock:
            return self._latest_jpeg

    def _save_snapshot(self, prefix):
        """Save the latest annotated frame as evidence and return its FILE NAME
        (not a path), or None when there is no frame yet or the write fails.
        A failed write must never take the detection loop down."""
        snap = self.get_latest_jpeg()
        if snap is None:
            return None
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in prefix)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        millis = int((time.time() % 1) * 1000)
        name = f"{safe}_{str(self.camera_id)[:8]}_{stamp}-{millis:03d}.jpg"
        try:
            with open(os.path.join(SNAPSHOT_DIR, name), "wb") as f:
                f.write(snap)
        except OSError as e:
            print(f"[{self.cam_name}] could not save snapshot: {e}")
            return None
        return name

    def _presence_payload(self, event_type, count, heartbeat,
                          snapshot_prefix=None, link=None):
        """Build a person/vehicle presence event.

        `count` is a presence LEVEL, not a head count: 1 = one, 2 = several.

        heartbeat=False marks a real change (presence started, a person appeared
        next to a vehicle); heartbeat=True marks the periodic "still there"
        update. link is (person_track_id, vehicle_track_id) when a person
        appeared next to a stationary vehicle."""
        payload = {
            "cameraId": self.camera_id, "zoneId": self.zone_id,
            "type": event_type, "currentCount": count,
            "timestamp": now_iso(), "heartbeat": heartbeat,
        }
        if snapshot_prefix:
            name = self._save_snapshot(snapshot_prefix)
            if name:
                payload["snapshotPath"] = name
        if link is not None:
            person_id, vehicle_id = link
            payload["trackId"] = f"person-{person_id}"
            payload["linkedTrackId"] = f"vehicle-{vehicle_id}"
        return payload

    def run(self):
        # ---- DISPLAY / READER THREAD ----
        # Reads frames in order and paces them to the source video's real FPS so
        # playback is SMOOTH. It draws the *latest* detections (produced by a
        # separate detector thread) onto each frame. Because this thread does no
        # YOLO work, it can hit the video's native frame rate easily, so motion
        # is fluid. Detections refresh at whatever rate the CPU allows, updated
        # underneath it — decoupled from playback.
        cap = cv2.VideoCapture(self.stream_url)
        if not cap.isOpened():
            print(f"[{self.cam_name}] ERROR: could not open stream {self.stream_url}")
            self._cleanup(cap)
            return

        print(f"[{self.cam_name}] streaming {self.stream_url} "
              f"(camera={self.camera_id} zone={self.zone_id})")

        # Register so the MJPEG server can serve this camera's annotated frames.
        with WORKERS_REGISTRY_LOCK:
            WORKERS_REGISTRY[self.camera_id] = self

        # Shared latest-detection state, written by the detector thread and read
        # here for drawing. Guarded by a lock.
        self._det_lock = threading.Lock()
        self._det_persons = []          # list of (track_id, [x1,y1,x2,y2])
        self._det_weapon_plot = None    # ultralytics weapon Results (for .plot)
        self._det_vehicle_plot = None   # ultralytics vehicle Results (for .plot)
        # Latest raw frame handed to the detector, guarded by its own lock.
        self._frame_lock = threading.Lock()
        self._latest_frame = None

        src_fps = cap.get(cv2.CAP_PROP_FPS)
        if not src_fps or src_fps <= 1 or src_fps > 120:
            src_fps = 25.0
        target_dt = 1.0 / src_fps

        # Start the detector thread (does all YOLO + tracking + alerting).
        detector = threading.Thread(target=self._detect_loop, daemon=True)
        detector.start()

        playback_start = time.time()
        frames_shown = 0

        while not self._stop_event.is_set():
            _loop_start = time.time()

            ret, frame = cap.read()
            if not ret:
                # End of stream: loop the "feed". Try a cheap in-place seek
                # first (works for local files and streamable MP4). Some
                # sources — notably .avi served over a plain HTTP server that
                # doesn't support range requests — can't seek; for those, fully
                # reopen the capture, which re-requests the file from the start.
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                playback_start = time.time()
                frames_shown = 0
                ret, frame = cap.read()
                if not ret:
                    try:
                        cap.release()
                    except Exception:
                        pass
                    cap = cv2.VideoCapture(self.stream_url)
                    ret, frame = cap.read()
                    if not ret:
                        print(f"[{self.cam_name}] stream ended and could not "
                              f"rewind or reopen; stopping")
                        break
                    print(f"[{self.cam_name}] reopened stream to loop the feed")

            frame = cv2.resize(frame, (960, 540))

            # Hand the raw frame to the detector (it always works on the latest).
            with self._frame_lock:
                self._latest_frame = frame

            # Draw the latest detections onto this frame.
            annotated = frame
            with self._det_lock:
                persons = list(self._det_persons)
                weapon_plot = self._det_weapon_plot
                vehicle_plot = self._det_vehicle_plot
            if weapon_plot is not None:
                annotated = weapon_plot.plot(img=annotated)
            if vehicle_plot is not None:
                annotated = vehicle_plot.plot(img=annotated)
            for tid, b in persons:
                cv2.rectangle(annotated, (int(b[0]), int(b[1])), (int(b[2]), int(b[3])), (0, 255, 0), 2)
                cv2.putText(annotated, f"person id:{tid}", (int(b[0]), int(b[1]) - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

            self._store_annotated(annotated)

            if self.show:
                cv2.imshow(f"SentinelAI - {self.cam_name}", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

            # Pace to the video's real frame rate (smooth playback).
            frames_shown += 1
            expected = frames_shown * target_dt
            actual = time.time() - playback_start
            ahead = expected - actual
            if ahead > 0:
                time.sleep(ahead)
            elif ahead < -1.0:
                # We've drifted badly behind (rare); resync the clock so we
                # don't sprint through frames to "catch up".
                playback_start = time.time()
                frames_shown = 0

        self._cleanup(cap)

    def _detect_loop(self):
        # ---- DETECTOR THREAD ----
        # Runs YOLO + tracking + alerting on the latest available frame, as fast
        # as the CPU allows. Writes results into shared state for the display
        # thread to draw. Tracking (persist=True) is sequential *within this one
        # thread*, so tracker state stays consistent.
        vehicle_last_seen = {}
        person_last_seen = {}
        weapon_seen_counts = defaultdict(int)
        weapon_already_alerted = set()
        weapon_last_publish = {}    # weapon track id -> time of its last event
        last_person_state = None
        last_vehicle_state = None
        det_tick = 0

        # Situation tracking (see vehicle_link.py and the presence block below).
        linker = VehicleLinker()
        pending_links = []          # (person_track_id, vehicle_track_id) not yet reported
        last_person_publish = 0.0
        last_vehicle_publish = 0.0
        person_peak = 0             # highest person count reported in this presence episode
        vehicle_peak = 0
        # Only used to tell ONE object from SEVERAL: "objects visible now",
        # smoothed over a few ticks. Exact head counts are not reported because
        # tracker ids are not people (a new id appears after every occlusion).
        person_counter = CountSmoother()
        vehicle_counter = CountSmoother()

        while not self._stop_event.is_set():
            with self._frame_lock:
                frame = None if self._latest_frame is None else self._latest_frame.copy()
            if frame is None:
                time.sleep(0.01)
                continue

            det_tick += 1

            # --- Vehicle ---
            vehicle_results = None
            vehicles_now = []
            if ENABLE_VEHICLE_DETECTION:
                vehicle_results = self.vehicle_model.track(
                    frame, classes=VEHICLE_CLASSES, persist=True, conf=VEHICLE_CONF, iou=0.4,
                    imgsz=VEHICLE_IMGSZ, tracker=VEHICLE_TRACKER, verbose=False,
                )
                vehicles_now = []
                if vehicle_results[0].boxes.id is not None:
                    for box in vehicle_results[0].boxes:
                        vtid = int(box.id[0])
                        vehicle_last_seen[vtid] = det_tick
                        vehicles_now.append((vtid, box.xyxy[0].tolist()))
                linker.update_vehicles(det_tick, vehicles_now)
                vehicle_counter.add(len(vehicles_now))
            # --- Person ---
            person_results = self.person_model.track(
                frame, persist=True, classes=[COCO_PERSON_CLASS],
                conf=PERSON_CONF_THRESHOLD, iou=0.5, imgsz=PERSON_IMGSZ,
                tracker=PERSON_TRACKER, verbose=False,
            )
            body_boxes = []
            persons_to_draw = []
            new_persons = []        # tracks never seen before this tick
            if person_results[0].boxes.id is not None:
                for box in person_results[0].boxes:
                    tid = int(box.id[0])
                    pbox = box.xyxy[0].tolist()
                    if tid not in person_last_seen:
                        new_persons.append((tid, pbox))
                    person_last_seen[tid] = det_tick
                    body_boxes.append(pbox)
                    persons_to_draw.append((tid, pbox))
            person_count = len(persons_to_draw)
            person_counter.add(person_count)

            # A person who first appears next to a STATIONARY vehicle most likely
            # stepped out of it. Remember the link; it is reported with the next
            # presence check.
            if ENABLE_VEHICLE_DETECTION and new_persons:
                for person_id, vehicle_id in linker.link_new_persons(det_tick, new_persons):
                    pending_links.append((person_id, vehicle_id))

            # --- Weapon ---
            weapon_results = self.weapon_model.track(
                frame, persist=True, conf=WEAPON_CONF_TRACK, iou=0.4,
                tracker="bytetrack_custom.yaml", verbose=False,
            )

            # Publish latest detections for the display thread to draw.
            with self._det_lock:
                self._det_persons = persons_to_draw
                self._det_weapon_plot = weapon_results[0]
                self._det_vehicle_plot = (
                    vehicle_results[0] if (ENABLE_VEHICLE_DETECTION and vehicle_results is not None) else None
                )

            # --- Weapon association + alerting ---
            # The weapon model may emit boxes even when tracking assigns no id
            # (e.g. a brand-new detection this frame). We still want to SEE those
            # in debug output, so iterate boxes directly and fall back to a
            # synthetic id when the tracker hasn't assigned one yet.
            wboxes = weapon_results[0].boxes
            if wboxes is not None and len(wboxes) > 0:
                for i, box in enumerate(wboxes):
                    track_id = int(box.id[0]) if box.id is not None else -(i + 1)
                    confidence = float(box.conf[0])
                    class_id = int(box.cls[0])
                    class_name = self.weapon_model.names[class_id]
                    weapon_box = box.xyxy[0].tolist()

                    confident_enough = confidence > WEAPON_CONF_THRESHOLD
                    associated = is_associated(weapon_box, body_boxes)
                    big_enough = box_area(weapon_box) > MIN_WEAPON_AREA
                    # Association is only enforced when required. When disabled,
                    # a weapon alerts even if no person box is nearby.
                    assoc_ok = associated or not WEAPON_REQUIRE_ASSOCIATION

                    if WEAPON_DEBUG:
                        print(f"[{self.cam_name}][weapon] {class_name} "
                              f"id={track_id} conf={confidence:.2f} "
                              f"area={box_area(weapon_box):.0f} "
                              f"assoc={associated} seen={weapon_seen_counts.get(track_id, 0)} "
                              f"(conf_ok={confident_enough} assoc_ok={assoc_ok} "
                              f"area_ok={big_enough})")

                    if track_id in weapon_already_alerted:
                        # Still in view: repeat the alert as a heartbeat. If the
                        # first event was lost (backend still starting, rule
                        # changed, network blip) the situation still gets raised
                        # and escalated, and the heartbeat keeps it alive. Also
                        # covers weapons without a tracker id (-1, -2, ...), which
                        # would otherwise alert once and never again.
                        now_w = time.time()
                        if (confident_enough and assoc_ok and big_enough
                                and now_w - weapon_last_publish.get(track_id, 0.0) >= HEARTBEAT_SECONDS):
                            weapon_last_publish[track_id] = now_w
                            beat = {
                                "cameraId": self.camera_id, "zoneId": self.zone_id,
                                "type": "WEAPON_DETECTED", "weaponClass": class_name,
                                "confidence": confidence, "timestamp": now_iso(),
                                "trackId": f"weapon-{track_id}", "heartbeat": True,
                            }
                            holder_id = find_holder(weapon_box, persons_to_draw, ASSOCIATION_IOU_THRESHOLD)
                            if holder_id is not None:
                                beat["linkedTrackId"] = f"person-{holder_id}"
                            self.publish("detection.weapon", beat)
                        continue

                    if confident_enough and assoc_ok and big_enough:
                        weapon_seen_counts[track_id] += 1

                    qualifies = weapon_seen_counts[track_id] >= CONFIRM_AFTER_N_FRAMES

                    if confident_enough and assoc_ok and big_enough and qualifies:
                        weapon_already_alerted.add(track_id)
                        weapon_last_publish[track_id] = time.time()
                        snapshot_name = self._save_snapshot(f"weapon_{class_name}_{track_id}")
                        holder_id = find_holder(weapon_box, persons_to_draw, ASSOCIATION_IOU_THRESHOLD)
                        weapon_payload = {
                            "cameraId": self.camera_id, "zoneId": self.zone_id,
                            "type": "WEAPON_DETECTED", "weaponClass": class_name,
                            "confidence": confidence, "timestamp": now_iso(),
                            "trackId": f"weapon-{track_id}", "heartbeat": False,
                        }
                        if snapshot_name:
                            weapon_payload["snapshotPath"] = snapshot_name
                        if holder_id is not None:
                            weapon_payload["linkedTrackId"] = f"person-{holder_id}"
                        self.publish("detection.weapon", weapon_payload)

            # --- Presence check + heartbeats ---
            # A message is sent when presence starts, when it goes from one object to several, when
            # a person appears next to a stationary vehicle, and then every
            # HEARTBEAT_SECONDS while presence continues. The heartbeats let the
            # backend tell "still happening" from "over" (incident-service ends a
            # situation only after a quiet grace period).
            if det_tick % PUBLISH_CHECK_INTERVAL == 0:
                now_t = time.time()

                active_persons = [tid for tid, seen in person_last_seen.items()
                                  if det_tick - seen <= TRACK_TIMEOUT_FRAMES]
                person_present = len(active_persons) > 0 or person_count > 0
                # Presence uses the timeout-tolerant track list (someone briefly
                # hidden is still "present"). What is reported is a LEVEL, not a
                # head count: 0 none, 1 one, 2 several.
                person_now = ((2 if person_counter.value() >= 2 else 1)
                              if person_present else 0)

                if person_present != last_person_state:
                    if person_present:
                        link = pending_links.pop(0) if pending_links else None
                        self.publish("detection.person", self._presence_payload(
                            "PERSON_DETECTED", person_now, False, "person", link))
                        last_person_publish = now_t
                        person_peak = person_now
                    else:
                        self.publish("detection.person", {
                            "cameraId": self.camera_id, "zoneId": self.zone_id,
                            "type": "NO_PERSON", "currentCount": person_now,
                            "timestamp": now_iso(), "heartbeat": False,
                        })
                        person_peak = 0
                    last_person_state = person_present
                elif person_present:
                    # More people stepping out of a vehicle: one event each.
                    while pending_links:
                        link = pending_links.pop(0)
                        self.publish("detection.person", self._presence_payload(
                            "PERSON_DETECTED", person_now, False, "person_link", link))
                        last_person_publish = now_t
                    increased = person_now > person_peak
                    if increased or now_t - last_person_publish >= HEARTBEAT_SECONDS:
                        self.publish("detection.person", self._presence_payload(
                            "PERSON_DETECTED", person_now, True,
                            "person_several" if increased else None))
                        last_person_publish = now_t
                        person_peak = max(person_peak, person_now)
                else:
                    pending_links.clear()  # the linked people already left

                if ENABLE_VEHICLE_DETECTION:
                    active_vehicles = [tid for tid, seen in vehicle_last_seen.items()
                                       if det_tick - seen <= TRACK_TIMEOUT_FRAMES]
                    vehicle_state = len(active_vehicles) > 0
                    vehicle_now = ((2 if vehicle_counter.value() >= 2 else 1)
                                   if vehicle_state else 0)
                    if vehicle_state != last_vehicle_state:
                        if vehicle_state:
                            self.publish("detection.vehicle", self._presence_payload(
                                "VEHICLE_DETECTED", vehicle_now, False, "vehicle"))
                            last_vehicle_publish = now_t
                            vehicle_peak = vehicle_now
                        else:
                            self.publish("detection.vehicle", {
                                "cameraId": self.camera_id, "zoneId": self.zone_id,
                                "type": "NO_VEHICLE", "currentCount": vehicle_now,
                                "timestamp": now_iso(), "heartbeat": False,
                            })
                            vehicle_peak = 0
                        last_vehicle_state = vehicle_state
                    elif vehicle_state:
                        increased = vehicle_now > vehicle_peak
                        if increased or now_t - last_vehicle_publish >= HEARTBEAT_SECONDS:
                            self.publish("detection.vehicle", self._presence_payload(
                                "VEHICLE_DETECTED", vehicle_now, True,
                                "vehicle_several" if increased else None))
                            last_vehicle_publish = now_t
                            vehicle_peak = max(vehicle_peak, vehicle_now)

    def _cleanup(self, cap):
        # Deregister from the MJPEG server registry.
        with WORKERS_REGISTRY_LOCK:
            if WORKERS_REGISTRY.get(self.camera_id) is self:
                del WORKERS_REGISTRY[self.camera_id]
        try:
            cap.release()
        except Exception:
            pass
        if self.show:
            try:
                cv2.destroyWindow(f"SentinelAI - {self.cam_name}")
            except Exception:
                pass
        try:
            self.mq_conn.close()
        except Exception:
            pass
        print(f"[{self.cam_name}] worker stopped")


# =====================================================================
# Orchestrator
# =====================================================================
def build_camera_list():
    """Return the list of cameras to run. Single-camera CLI override wins;
    otherwise discover active cameras from camera-service."""
    if _args.camera_id and _args.video:
        return [{
            "id": _args.camera_id,
            "zoneId": _args.zone_id or "",
            "streamUrl": _args.video,
            "name": "cli-camera",
        }]

    cams = fetch_active_cameras()
    if not cams:
        print("[orchestrator] no active cameras returned by camera-service. "
              "Register cameras (with a streamUrl) and set them active, or use "
              "--video/--camera-id for a single-camera test.")
    return cams


# =====================================================================
# MJPEG streaming server (annotated frames -> browser)
# =====================================================================
# Serves each camera worker's latest annotated frame as an MJPEG stream at
# GET /stream/<cameraId>. The frontend camera view points an <img>/<video> at
# this URL to show live bounding boxes on the footage. A plain image request
# without a camera id returns 404. CORS is open so the browser can embed it.
class _MJPEGHandler(BaseHTTPRequestHandler):
    # Silence the default per-request logging (keeps the detection console clean).
    def log_message(self, *args, **kwargs):
        pass

    def _set_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")

    def _serve_snapshot(self, raw_name):
        """Serve an evidence image saved by a camera worker. Only bare .jpg file
        names inside SNAPSHOT_DIR are ever served (no path traversal)."""
        name = os.path.basename(unquote(raw_name))
        full = os.path.join(SNAPSHOT_DIR, name)
        data = None
        if name.lower().endswith(".jpg") and os.path.isfile(full):
            try:
                with open(full, "rb") as f:
                    data = f.read()
            except OSError:
                data = None
        if data is None:
            self.send_response(404)
            self._set_cors()
            self.end_headers()
            return
        self.send_response(200)
        self._set_cors()
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/snapshots/"):
            self._serve_snapshot(path[len("/snapshots/"):])
            return
        if not path.startswith("/stream/"):
            self.send_response(404)
            self._set_cors()
            self.end_headers()
            return

        camera_id = path[len("/stream/"):]
        with WORKERS_REGISTRY_LOCK:
            worker = WORKERS_REGISTRY.get(camera_id)

        if worker is None:
            self.send_response(404)
            self._set_cors()
            self.end_headers()
            return

        self.send_response(200)
        self._set_cors()
        self.send_header(
            "Content-Type", "multipart/x-mixed-replace; boundary=frame"
        )
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.end_headers()

        # Push frames until the client disconnects or the worker stops.
        try:
            while True:
                with WORKERS_REGISTRY_LOCK:
                    worker = WORKERS_REGISTRY.get(camera_id)
                if worker is None:
                    break
                jpeg = worker.get_latest_jpeg()
                if jpeg is not None:
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(
                        f"Content-Length: {len(jpeg)}\r\n\r\n".encode("ascii")
                    )
                    self.wfile.write(jpeg)
                    self.wfile.write(b"\r\n")
                # ~15 fps ceiling for the stream; independent of detection rate.
                time.sleep(1.0 / 15.0)
        except (BrokenPipeError, ConnectionResetError):
            pass  # client closed the tab; normal
        except Exception as e:
            print(f"[mjpeg] stream error for {camera_id}: {e}")


def start_mjpeg_server():
    """Start the MJPEG server in a background daemon thread."""
    try:
        server = ThreadingHTTPServer(("0.0.0.0", MJPEG_PORT), _MJPEGHandler)
    except OSError as e:
        print(f"[mjpeg] could not bind port {MJPEG_PORT}: {e}")
        return None
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"[mjpeg] annotated streams available at "
          f"http://localhost:{MJPEG_PORT}/stream/<cameraId> "
          f"(evidence images at /snapshots/<file>)")
    return server


def main():
    print(f"[config] camera-service={CAMERA_SERVICE_URL} exchange={EXCHANGE_NAME} "
          f"rabbit={RABBITMQ_URL} max_cameras={MAX_CAMERAS} target_fps={TARGET_FPS}")

    start_mjpeg_server()

    cameras = build_camera_list()
    if len(cameras) > MAX_CAMERAS:
        print(f"[orchestrator] capping {len(cameras)} cameras to MAX_CAMERAS={MAX_CAMERAS}")
        cameras = cameras[:MAX_CAMERAS]

    workers = {}
    for cam in cameras:
        cam_id = cam.get("id")
        if not cam_id or cam_id in workers:
            continue
        worker = CameraWorker(
            camera_id=cam_id,
            zone_id=cam.get("zoneId", ""),
            stream_url=cam.get("streamUrl", ""),
            name=cam.get("name") or cam_id[:8],
            show=_args.show and len(cameras) == 1,
        )
        workers[cam_id] = worker
        worker.start()

    if not workers:
        print("[orchestrator] no camera workers started; exiting.")
        return

    print(f"[orchestrator] started {len(workers)} camera worker(s). Ctrl+C to stop.")

    # Periodically re-check camera-service so newly-registered (or newly
    # activated) cameras start streaming, and deactivated ones stop — without
    # restarting the service. Skipped entirely in single-camera CLI mode.
    try:
        while True:
            time.sleep(CAMERA_POLL_SECONDS)
            if _args.camera_id and _args.video:
                continue  # static single-camera mode
            current = {c.get("id"): c for c in fetch_active_cameras() if c.get("id")}

            # Start workers for newly active cameras (respecting the cap).
            for cam_id, cam in current.items():
                if cam_id in workers:
                    continue
                if len(workers) >= MAX_CAMERAS:
                    break
                worker = CameraWorker(
                    camera_id=cam_id,
                    zone_id=cam.get("zoneId", ""),
                    stream_url=cam.get("streamUrl", ""),
                    name=cam.get("name") or cam_id[:8],
                    show=False,
                )
                workers[cam_id] = worker
                worker.start()
                print(f"[orchestrator] started new camera worker: {worker.cam_name}")

            # Stop workers for cameras that are no longer active.
            for cam_id in list(workers.keys()):
                if cam_id not in current:
                    print(f"[orchestrator] camera {cam_id} no longer active; stopping worker")
                    workers[cam_id].stop()
                    del workers[cam_id]
    except KeyboardInterrupt:
        print("\n[orchestrator] shutting down...")
        for worker in workers.values():
            worker.stop()
        for worker in workers.values():
            worker.join(timeout=5)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()