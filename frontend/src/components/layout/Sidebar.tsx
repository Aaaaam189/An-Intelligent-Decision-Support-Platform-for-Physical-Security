import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "../../constants/navigation";
import { colors, fontFamily, fontFamilyHeading, fontSizes } from "../../constants/theme";
import type { UserRole } from "../../types/auth.types";
import NavItem from "./NavItem";

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const getUserRole = (): UserRole => {
    const role = localStorage.getItem("sentinel_role");
    if (role === "ADMIN" || role === "SECURITY_GUARD") {
      return role;
    }
    return "SECURITY_GUARD";
  };

  const role = getUserRole();

  const filteredItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleLogout = () => {
    localStorage.removeItem("sentinel_token");
    localStorage.removeItem("sentinel_role");
    localStorage.removeItem("sentinel_uid");
    localStorage.removeItem("sentinel_fullName");
    localStorage.removeItem("sentinel_email");
    navigate("/login");
  };

  const sidebarStyle: CSSProperties = {
    width: "220px",
    minWidth: "220px",
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    display: "flex",
    flexDirection: "column",
    backgroundColor: colors.white,
    borderRight: `1px solid ${colors.lightGray}`,
    padding: "24px 0",
    boxSizing: "border-box",
    overflowY: "auto",
  };

  const brandStyle: CSSProperties = {
    color: colors.green,
    fontSize: fontSizes.sectionHeading,
    fontFamily: fontFamilyHeading,
    fontWeight: 700,
    margin: "0 0 24px 0",
    padding: "0 16px",
  };

  const navListStyle: CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    listStyle: "none",
    margin: 0,
    padding: 0,
  };

  const logoutButtonStyle: CSSProperties = {
    background: "none",
    border: "none",
    color: colors.red,
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    cursor: "pointer",
    padding: "10px 16px",
    textAlign: "left",
    width: "100%",
    marginTop: "auto",
  };

  return (
    <aside style={sidebarStyle} aria-label="Main navigation">
      <h1 style={brandStyle}>SentinelAI</h1>
      <nav style={navListStyle}>
        {filteredItems.map((item) => (
          <NavItem
            key={item.path}
            label={item.label}
            path={item.path}
            isActive={location.pathname === item.path}
          />
        ))}
      </nav>
      <button style={logoutButtonStyle} onClick={handleLogout}>
        Log out
      </button>
    </aside>
  );
}
