import type { CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { colors, fontFamily } from "../../constants/theme";

export default function AuthLayout() {
  const containerStyle: CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    fontFamily,
  };

  return (
    <div style={containerStyle}>
      <Outlet />
    </div>
  );
}
