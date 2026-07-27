import { useParams, useNavigate } from "react-router-dom";
import { useRef, useState, useEffect, useCallback, type CSSProperties } from "react";
import Hls from "hls.js";
import { useCamera } from "../../hooks/useCameras";
import { formatDate } from "../../utils/formatters";
import Spinner from "../../components/ui/Spinner";

export default function CameraFullscreenPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { camera, isLoading, error: cameraError } = useCamera(id ?? "");

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [streamError, setStreamError] = useState(false);

  const handleBack = () => {
    navigate(`/cameras/${id}`);
  };

  // HLS setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !camera?.streamUrl) return;

    const streamUrl = camera.streamUrl;

    // Check native HLS support (Safari, iOS)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener("error", () => setStreamError(true));
    } else if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setStreamError(true);
        }
      });
    } else {
      // No HLS support at all
      setStreamError(true);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [camera?.streamUrl]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVideoError = () => setStreamError(true);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("error", handleVideoError);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("error", handleVideoError);
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = Number(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Loading state
  if (isLoading) {
    return (
      <div style={containerStyle}>
        <Spinner size={48} color="#FFFFFF" />
      </div>
    );
  }

  // Camera fetch error
  if (cameraError || !camera) {
    return (
      <div style={containerStyle}>
        <button
          onClick={handleBack}
          style={backButtonStyle}
          aria-label="Go back"
        >
          ←
        </button>
        <div style={errorOverlayStyle}>
          Stream unavailable
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Video element */}
      <video
        ref={videoRef}
        style={videoStyle}
        playsInline
      />

      {/* Back button - top left */}
      <button
        onClick={handleBack}
        style={backButtonStyle}
        aria-label="Go back"
      >
        ←
      </button>

      {/* Stream error overlay */}
      {streamError && (
        <div style={errorOverlayStyle}>
          Stream unavailable
        </div>
      )}

      {/* Added at date overlay - bottom left */}
      <div style={dateOverlayStyle}>
        Added at: {formatDate(camera.createdAt)}
      </div>

      {/* Playback controls */}
      <div style={controlsContainerStyle}>
        <button
          onClick={togglePlayPause}
          style={playPauseButtonStyle}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          style={seekBarStyle}
          aria-label="Seek"
        />
      </div>
    </div>
  );
}

// Styles
const containerStyle: CSSProperties = {
  width: "100vw",
  height: "100vh",
  backgroundColor: "#000000",
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const videoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
};

const backButtonStyle: CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  width: 40,
  height: 40,
  borderRadius: "50%",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  color: "#FFFFFF",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "20px",
  zIndex: 10,
};

const dateOverlayStyle: CSSProperties = {
  position: "absolute",
  bottom: 60,
  left: 16,
  color: "#FFFFFF",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  padding: "4px 10px",
  borderRadius: "4px",
  fontSize: "14px",
  zIndex: 10,
};

const controlsContainerStyle: CSSProperties = {
  position: "absolute",
  bottom: 16,
  left: 16,
  right: 16,
  display: "flex",
  alignItems: "center",
  gap: "12px",
  zIndex: 10,
};

const playPauseButtonStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  color: "#FFFFFF",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "16px",
  flexShrink: 0,
};

const seekBarStyle: CSSProperties = {
  flex: 1,
  height: "6px",
  cursor: "pointer",
  accentColor: "#35d185",
};

const errorOverlayStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  color: "#FFFFFF",
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  padding: "16px 24px",
  borderRadius: "8px",
  fontSize: "18px",
  zIndex: 10,
};
