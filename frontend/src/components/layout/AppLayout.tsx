import type { CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { colors, fontFamily } from "../../constants/theme";
import Sidebar from "./Sidebar";
import ChatWidget from "../assistant/ChatWidget";

export default function AppLayout() {
  const containerStyle: CSSProperties = {
    display: "flex",
    minWidth: "1024px",
    minHeight: "100vh",
    fontFamily,
    backgroundColor: colors.white,
  };

  const mainStyle: CSSProperties = {
    marginLeft: "220px",
    flex: 1,
    padding: "24px 32px",
  };

  return (
    <div style={containerStyle}>
      <Sidebar />
      <main style={mainStyle}>
        <Outlet />
      </main>
      <ChatWidget />
    </div>
  );
}
