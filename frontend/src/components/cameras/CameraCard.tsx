import type { CSSProperties } from "react";
import { colors, borderRadius, fontFamily, fontSizes } from "../../constants/theme";
import { truncateName } from "../../utils/formatters";
import type { Camera } from "../../types/camera.types";
import { cameraStreamUrl } from "../../constants/stream";

interface CameraCardProps {
  camera: Camera;
  onMenuClick: (event: React.MouseEvent) => void;
}

export default function CameraCard({ camera, onMenuClick }: CameraCardProps) {
  const cardStyle: CSSProperties = {
    backgroundColor: colors.lightGray,
    borderRadius: borderRadius.card,
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column",
  };

  const thumbnailContainerStyle: CSSProperties = {
    width: "100%",
    aspectRatio: "16 / 9",
    backgroundColor: "#D9D9D9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  };

  const cameraIconStyle: CSSProperties = {
    width: "40px",
    height: "40px",
    color: "#999999",
  };

  const infoContainerStyle: CSSProperties = {
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };

  const nameStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    color: colors.black,
    margin: 0,
    lineHeight: 1.4,
  };

  const locationStyle: CSSProperties = {
    fontFamily,
    fontSize: "12px",
    color: "#666666",
    margin: 0,
    lineHeight: 1.4,
  };

  const menuButtonStyle: CSSProperties = {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily,
    fontSize: "16px",
    fontWeight: 700,
    color: colors.black,
    lineHeight: 1,
    padding: 0,
  };

  return (
    <div style={cardStyle}>
      <div style={thumbnailContainerStyle}>
        {/* Live annotated MJPEG stream from the ai-service (detection boxes).
            Falls back to the raw streamUrl, then to the placeholder icon. */}
        <img
          src={cameraStreamUrl(camera.id)}
          alt={`${camera.name} live`}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => {
            const target = e.currentTarget;
            if (camera.streamUrl && target.dataset.fellBack !== "true") {
              // Fall back once to the raw stream URL.
              target.dataset.fellBack = "true";
              target.src = camera.streamUrl;
              return;
            }
            // No stream available: hide the image, show the placeholder icon.
            target.style.display = "none";
            target.parentElement
              ?.querySelector<HTMLElement>(".camera-placeholder")
              ?.style.removeProperty("display");
          }}
        />
        <svg
          className="camera-placeholder"
          style={{
            ...cameraIconStyle,
            display: "none",
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M23 7l-7 5 7 5V7z" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
        <button
          style={menuButtonStyle}
          onClick={onMenuClick}
          aria-label={`Actions for ${camera.name}`}
          type="button"
        >
          &#8230;
        </button>
      </div>
      <div style={infoContainerStyle}>
        <p style={nameStyle} title={camera.name.length > 30 ? camera.name : undefined}>
          {truncateName(camera.name, 30)}
        </p>
        <p style={locationStyle}>{camera.location}</p>
      </div>
    </div>
  );
}
