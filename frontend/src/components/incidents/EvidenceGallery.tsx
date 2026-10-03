import { useState, type CSSProperties } from "react";
import type { IncidentEvent } from "../../types/incident.types";
import { snapshotUrl } from "../../constants/stream";
import { borderRadius, colors, fontFamily, fontSizes } from "../../constants/theme";

interface EvidenceGalleryProps {
  events: IncidentEvent[];
}

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
 * The snapshots captured while the situation unfolded, one per timeline entry
 * that has an image. Clicking a thumbnail opens it full size.
 */
export default function EvidenceGallery({ events }: EvidenceGalleryProps) {
  const withImages = events.filter((e) => e.snapshot);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  if (withImages.length === 0) {
    return <p style={emptyStyle}>No snapshots were captured for this incident.</p>;
  }

  return (
    <div style={gridStyle}>
      {withImages.map((event) => {
        const url = snapshotUrl(event.snapshot as string);
        const broken = failed.has(event.id);
        return (
          <figure key={event.id} style={figureStyle}>
            {broken ? (
              <div style={brokenStyle}>Image unavailable</div>
            ) : (
              <a href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt={event.summary}
                  style={imageStyle}
                  loading="lazy"
                  onError={() => setFailed((prev) => new Set(prev).add(event.id))}
                />
              </a>
            )}
            <figcaption style={captionStyle}>
              <strong>{formatTime(event.occurredAt)}</strong> · {event.summary}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: "16px",
};

const figureStyle: CSSProperties = {
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const imageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 9",
  objectFit: "cover",
  borderRadius: borderRadius.card,
  backgroundColor: colors.lightGray,
  display: "block",
};

const brokenStyle: CSSProperties = {
  ...imageStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily,
  fontSize: "12px",
  color: colors.black,
  opacity: 0.6,
};

const captionStyle: CSSProperties = {
  fontFamily,
  fontSize: "12px",
  color: colors.black,
  opacity: 0.75,
};

const emptyStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  opacity: 0.6,
  margin: 0,
};
