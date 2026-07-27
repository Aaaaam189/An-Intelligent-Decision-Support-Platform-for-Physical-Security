import type { CSSProperties } from "react";
import { borderRadius, colors, fontFamily, fontSizes } from "../../constants/theme";

interface SummaryWidgetProps {
  label: string;
  value: number | string;
}

export default function SummaryWidget({ label, value }: SummaryWidgetProps) {
  const cardStyle: CSSProperties = {
    backgroundColor: "#1a1a2e",
    borderRadius: borderRadius.card,
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: "180px",
  };

  const labelStyle: CSSProperties = {
    color: colors.darkGray,
    fontSize: fontSizes.body,
    fontFamily,
    fontWeight: 400,
    margin: 0,
  };

  const valueStyle: CSSProperties = {
    color: colors.white,
    fontSize: fontSizes.pageHeading,
    fontFamily,
    fontWeight: 700,
    margin: 0,
  };

  return (
    <div style={cardStyle}>
      <p style={labelStyle}>{label}</p>
      <p style={valueStyle}>{value}</p>
    </div>
  );
}
