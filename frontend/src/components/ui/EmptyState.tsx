import type { CSSProperties, ReactNode } from "react";
import { colors, fontFamily, fontSizes } from "../../constants/theme";

interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
}

export default function EmptyState({ message, icon }: EmptyStateProps) {
  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
    textAlign: "center",
  };

  const iconStyle: CSSProperties = {
    marginBottom: "16px",
    color: colors.darkGray,
    fontSize: "48px",
  };

  const messageStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.darkGray,
    margin: 0,
  };

  return (
    <div style={containerStyle} role="status">
      {icon && <div style={iconStyle}>{icon}</div>}
      <p style={messageStyle}>{message}</p>
    </div>
  );
}
