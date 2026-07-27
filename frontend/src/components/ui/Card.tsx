import type { CSSProperties, ReactNode } from "react";
import { colors, borderRadius } from "../../constants/theme";

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
}

export default function Card({ children, style }: CardProps) {
  const cardStyle: CSSProperties = {
    backgroundColor: colors.lightGray,
    borderRadius: borderRadius.card,
    padding: "32px",
    ...style,
  };

  return <div style={cardStyle}>{children}</div>;
}
