import type { CSSProperties } from "react";
import type { IncidentEvent } from "../../types/incident.types";
import { PRIORITY_COLORS } from "../../constants/priority";
import { colors, fontFamily, fontSizes } from "../../constants/theme";

interface IncidentTimelineProps {
  events: IncidentEvent[];
}

const KIND_ICON: Record<string, string> = {
  VEHICLE_DETECTED: "🚗",
  PERSON_DETECTED: "🧍",
  WEAPON_DETECTED: "⚠️",
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * "What happened": the ordered steps of the security situation, with the rule
 * outcome that explains each one. Escalations are highlighted.
 */
export default function IncidentTimeline({ events }: IncidentTimelineProps) {
  if (events.length === 0) {
    return <p style={emptyStyle}>No detections recorded for this incident yet.</p>;
  }

  return (
    <ol style={listStyle} aria-label="Incident timeline">
      {events.map((event) => (
        <li key={event.id} style={itemStyle}>
          <span style={timeStyle}>{formatTime(event.occurredAt)}</span>
          <span
            style={{
              ...dotStyle,
              backgroundColor:
                PRIORITY_COLORS[event.priority] ?? colors.darkGray,
            }}
            aria-hidden="true"
          />
          <div style={bodyStyle}>
            <div style={summaryRowStyle}>
              <span aria-hidden="true">{KIND_ICON[event.kind] ?? "•"}</span>
              <span style={summaryStyle}>{event.summary}</span>
              {event.escalated && <span style={escalatedBadgeStyle}>ESCALATED</span>}
            </div>
            {event.reason && <div style={reasonStyle}>{event.reason}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const listStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
};

const timeStyle: CSSProperties = {
  fontFamily,
  fontSize: "12px",
  color: colors.black,
  opacity: 0.55,
  width: "72px",
  flexShrink: 0,
  paddingTop: "2px",
};

const dotStyle: CSSProperties = {
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  marginTop: "4px",
  flexShrink: 0,
};

const bodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const summaryRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};

const summaryStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  fontWeight: 600,
  color: colors.black,
};

const escalatedBadgeStyle: CSSProperties = {
  fontFamily,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.5px",
  color: colors.white,
  backgroundColor: colors.red,
  borderRadius: "9999px",
  padding: "2px 8px",
};

const reasonStyle: CSSProperties = {
  fontFamily,
  fontSize: "12px",
  color: colors.black,
  opacity: 0.6,
};

const emptyStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  opacity: 0.6,
  margin: 0,
};
