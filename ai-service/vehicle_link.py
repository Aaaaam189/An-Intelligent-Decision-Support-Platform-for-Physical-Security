"""Linking helpers for the detection pipeline (pure Python, no ML, no I/O).

Two cheap, explainable associations that turn separate detections into a story:

  * person <-> vehicle : a NEW person track whose first box touches a
    STATIONARY vehicle is reported as "appeared next to vehicle #N" (most likely
    stepped out of it).
  * weapon <-> person  : which tracked person a weapon box belongs to.

Everything works on plain [x1, y1, x2, y2] boxes and integer track ids, so it can
be unit-tested without a camera or a model (see test_vehicle_link.py).

These are heuristics, not identity recognition: a person walking past a parked
car looks the same as one leaving it, so the backend words the result as
"likely exited". The thresholds are env-tunable.
"""
import os
from collections import deque
from statistics import median


def _env(name, default):
    value = os.environ.get(name)
    return default if value is None or value == "" else value


# A vehicle is "stationary" when its centre moved less than this fraction of its
# own width over the last STATIONARY_WINDOW detection ticks...
STATIONARY_MOVE_FRACTION = float(_env("VEHICLE_STATIONARY_MOVE_FRACTION", "0.15"))
STATIONARY_WINDOW = int(_env("VEHICLE_STATIONARY_WINDOW", "30"))
# ...and we have seen it for at least this many ticks (a car that just entered
# the frame is still moving).
STATIONARY_MIN_SAMPLES = int(_env("VEHICLE_STATIONARY_MIN_SAMPLES", "8"))
# How far around the vehicle box a person's first box may start and still count
# as "next to it", as a fraction of the vehicle box size.
LINK_MARGIN_FRACTION = float(_env("VEHICLE_LINK_MARGIN_FRACTION", "0.20"))
# A vehicle unseen for this many ticks is forgotten.
VEHICLE_FORGET_TICKS = int(_env("VEHICLE_FORGET_TICKS", "120"))
# CountSmoother (below) takes the MEDIAN of the number of objects visible in the
# last COUNT_SMOOTHING_TICKS detection ticks.
COUNT_SMOOTHING_TICKS = int(_env("COUNT_SMOOTHING_TICKS", "15"))
# The vehicle must have been seen at most this many ticks ago to be linkable
# (tolerates a couple of missed detections).
VEHICLE_VISIBLE_TOLERANCE_TICKS = 3


def box_center(box):
    return ((box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0)


def expand_box(box, fraction):
    width = box[2] - box[0]
    height = box[3] - box[1]
    dx, dy = width * fraction, height * fraction
    return [box[0] - dx, box[1] - dy, box[2] + dx, box[3] + dy]


def boxes_overlap(a, b):
    """True when the two boxes share a region of positive area."""
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def person_next_to_vehicle(person_box, vehicle_box, margin_fraction=LINK_MARGIN_FRACTION):
    """True when the person's box touches the (slightly enlarged) vehicle box."""
    return boxes_overlap(person_box, expand_box(vehicle_box, margin_fraction))


def is_stationary(centers, width,
                  move_fraction=STATIONARY_MOVE_FRACTION,
                  min_samples=STATIONARY_MIN_SAMPLES):
    """centers: sequence of (cx, cy) samples, oldest first."""
    if len(centers) < min_samples:
        return False
    xs = [c[0] for c in centers]
    ys = [c[1] for c in centers]
    movement = max(max(xs) - min(xs), max(ys) - min(ys))
    return movement <= move_fraction * max(width, 1.0)


def find_holder(weapon_box, persons, iou_threshold=0.02):
    """Return the track id of the person a weapon box belongs to, or None.

    persons: iterable of (track_id, box). The weapon belongs to the person whose
    box contains its centre; failing that, the one it overlaps the most.
    """
    best_id, best_score = None, 0.0
    cx, cy = box_center(weapon_box)
    for track_id, box in persons:
        if box[0] <= cx <= box[2] and box[1] <= cy <= box[3]:
            return track_id
        score = _iou(weapon_box, box)
        if score > iou_threshold and score > best_score:
            best_id, best_score = track_id, score
    return best_id


def _iou(a, b):
    xa, ya = max(a[0], b[0]), max(a[1], b[1])
    xb, yb = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, xb - xa) * max(0, yb - ya)
    if inter == 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / float(area_a + area_b - inter)


class VehicleLinker:
    """Remembers where each tracked vehicle has been and links newly appearing
    people to stationary vehicles they start next to. One instance per camera
    worker (it is only used from that worker's detection thread)."""

    def __init__(self):
        self._history = {}    # vehicle track id -> deque of (cx, cy)
        self._boxes = {}      # vehicle track id -> latest box
        self._last_seen = {}  # vehicle track id -> tick

    def update_vehicles(self, tick, vehicles):
        """vehicles: iterable of (vehicle_track_id, box) seen this tick."""
        for track_id, box in vehicles:
            history = self._history.setdefault(track_id, deque(maxlen=STATIONARY_WINDOW))
            history.append(box_center(box))
            self._boxes[track_id] = list(box)
            self._last_seen[track_id] = tick

        stale = [t for t, seen in self._last_seen.items() if tick - seen > VEHICLE_FORGET_TICKS]
        for track_id in stale:
            self._history.pop(track_id, None)
            self._boxes.pop(track_id, None)
            self._last_seen.pop(track_id, None)

    def is_stationary(self, track_id):
        history = self._history.get(track_id)
        box = self._boxes.get(track_id)
        if not history or box is None:
            return False
        return is_stationary(list(history), box[2] - box[0])

    def link_new_persons(self, tick, new_persons):
        """new_persons: iterable of (person_track_id, box) that appeared this tick.

        Returns a list of (person_track_id, vehicle_track_id) links, choosing for
        each person the closest qualifying vehicle."""
        links = []
        for person_id, person_box in new_persons:
            pcx, pcy = box_center(person_box)
            best_vehicle, best_distance = None, None
            for vehicle_id, vehicle_box in self._boxes.items():
                if tick - self._last_seen.get(vehicle_id, -10 ** 9) > VEHICLE_VISIBLE_TOLERANCE_TICKS:
                    continue
                if not self.is_stationary(vehicle_id):
                    continue
                if not person_next_to_vehicle(person_box, vehicle_box):
                    continue
                vcx, vcy = box_center(vehicle_box)
                distance = (pcx - vcx) ** 2 + (pcy - vcy) ** 2
                if best_distance is None or distance < best_distance:
                    best_vehicle, best_distance = vehicle_id, distance
            if best_vehicle is not None:
                links.append((person_id, best_vehicle))
        return links


class CountSmoother:
    """How many objects are in view RIGHT NOW, robust to single-frame noise.

    Only used to decide ONE versus SEVERAL (the pipeline reports presence levels,
    never exact head counts: tracker ids are not people, a new id appears after
    every occlusion). The median over the last few ticks removes a missed
    detection or a one-frame false positive.
    """

    def __init__(self, window=COUNT_SMOOTHING_TICKS):
        self._samples = deque(maxlen=max(1, window))

    def add(self, visible_now):
        self._samples.append(int(visible_now))

    def value(self):
        if not self._samples:
            return 0
        return int(round(median(self._samples)))

    def reset(self):
        self._samples.clear()
