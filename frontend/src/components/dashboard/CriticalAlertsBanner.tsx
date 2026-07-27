import type { CSSProperties } from "react";
import type { Incident } from "../../types/incident.types";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

interface CriticalAlertsBannerProps {
  incidents: Incident[];
}

const priorityColors: Record<string, string> = {
  HIGH: "#FF9500",
  CRITICAL: colors.red,
};

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

export default function CriticalAlertsBanner({ incidents }: CriticalAlertsBannerProps) {
  const containerStyle: CSSProperties = {
    padding: "16px",
    backgroundColor: colors.white,
    borderRadius: borderRadius.card,
    border: `1px solid ${colors.lightGray}`,
    fontFamily,
  };

  const headingStyle: CSSProperties = {
    fontSize: fontSizes.sectionHeading,
    fontWeight: 600,
    marginBottom: "12px",
    color: colors.black,
  };

  const emptyStyle: CSSProperties = {
    fontSize: fontSizes.body,
    color: colors.darkGray,
    padding: "12px 0",
  };

  const listStyle: CSSProperties = {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  const alertItemStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    backgroundColor: colors.lightGray,
    borderRadius: "8px",
    fontSize: fontSizes.body,
  };

  if (incidents.length === 0) {
    return (
      <section style={containerStyle}>
        <h3 style={headingStyle}>Critical Alerts</h3>
        <p style={emptyStyle}>No critical alerts at this time.</p>
      </section>
    );
  }

  return (
    <section style={containerStyle}>
      <h3 style={headingStyle}>Critical Alerts</h3>
      <ul style={listStyle}>
        {incidents.map((incident) => (
          <li key={incident.id} style={alertItemStyle}>
            <span style={{ fontWeight: 500, color: colors.black }}>
              {incident.type.replace(/_/g, " ")}
            </span>
            <span
              style={{
                fontWeight: 600,
                color: priorityColors[incident.priority] || colors.black,
                textTransform: "uppercase",
                fontSize: "12px",
              }}
            >
              {incident.priority}
            </span>
            <span style={{ color: colors.darkGray, fontSize: "12px" }}>
              {formatTime(incident.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
