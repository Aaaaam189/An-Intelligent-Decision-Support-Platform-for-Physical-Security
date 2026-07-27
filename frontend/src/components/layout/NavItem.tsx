import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { colors, fontFamily, fontSizes } from "../../constants/theme";

interface NavItemProps {
  label: string;
  path: string;
  isActive: boolean;
}

export default function NavItem({ label, path, isActive }: NavItemProps) {
  const itemStyle: CSSProperties = {
    display: "block",
    textDecoration: "none",
    padding: "10px 16px",
    borderLeft: isActive ? `3px solid ${colors.green}` : "3px solid transparent",
    backgroundColor: isActive ? "rgba(53, 209, 133, 0.08)" : "transparent",
    color: isActive ? colors.green : colors.black,
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: isActive ? 600 : 400,
    borderRadius: "0 4px 4px 0",
    transition: "background-color 0.15s ease, border-color 0.15s ease",
  };

  return (
    <Link to={path} style={itemStyle} aria-current={isActive ? "page" : undefined}>
      {label}
    </Link>
  );
}
