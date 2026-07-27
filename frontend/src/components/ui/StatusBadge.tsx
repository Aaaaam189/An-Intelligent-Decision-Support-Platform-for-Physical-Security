import type { CSSProperties } from "react";
import { borderRadius, fontSizes, fontFamily } from "../../constants/theme";

interface StatusBadgeProps {
  value: string;
  colorMap: Record<string, string>;
}

export default function StatusBadge({ value, colorMap }: StatusBadgeProps) {
  const backgroundColor = colorMap[value] ?? "#999999";

  const style: CSSProperties = {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: borderRadius.pill,
    backgroundColor,
    color: "#FFFFFF",
    fontSize: fontSizes.body,
    fontFamily,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    lineHeight: "1.4",
  };

  return <span style={style}>{value}</span>;
}
