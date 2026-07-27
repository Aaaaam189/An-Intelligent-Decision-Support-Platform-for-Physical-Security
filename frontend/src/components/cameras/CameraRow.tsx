import type { CSSProperties } from "react";
import { colors, fontFamily, fontSizes } from "../../constants/theme";
import { formatDate } from "../../utils/formatters";
import type { Camera } from "../../types/camera.types";

interface CameraRowProps {
  camera: Camera;
  zoneName: string;
  onMenuClick: (event: React.MouseEvent) => void;
}

export default function CameraRow({ camera, zoneName, onMenuClick }: CameraRowProps) {
  const cellStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    padding: "12px 16px",
    verticalAlign: "middle",
  };

  const statusDotStyle: CSSProperties = {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: camera.isActive ? colors.green : "#999999",
    marginRight: "8px",
  };

  const statusTextStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: camera.isActive ? colors.green : "#999999",
    fontWeight: 500,
  };

  const menuButtonStyle: CSSProperties = {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily,
    fontSize: "18px",
    fontWeight: 700,
    color: colors.black,
    lineHeight: 1,
    padding: 0,
  };

  return (
    <tr>
      <td style={cellStyle}>{camera.name}</td>
      <td style={cellStyle}>{zoneName}</td>
      <td style={cellStyle}>{formatDate(camera.createdAt)}</td>
      <td style={cellStyle}>
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          <span style={statusDotStyle} aria-hidden="true" />
          <span style={statusTextStyle}>
            {camera.isActive ? "Active" : "Inactive"}
          </span>
        </span>
      </td>
      <td style={cellStyle}>
        <button
          style={menuButtonStyle}
          onClick={onMenuClick}
          aria-label={`Actions for ${camera.name}`}
          type="button"
        >
          &#8230;
        </button>
      </td>
    </tr>
  );
}
