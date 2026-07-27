import type { NavItemConfig } from "../types/navigation.types";

export const NAV_ITEMS: NavItemConfig[] = [
  { label: "Dashboard", path: "/dashboard", roles: ["ADMIN", "SECURITY_GUARD"] },
  { label: "Cameras", path: "/cameras", roles: ["ADMIN", "SECURITY_GUARD"] },
  { label: "Zones", path: "/zones", roles: ["ADMIN"] },
  { label: "Users", path: "/users", roles: ["ADMIN"] },
  { label: "Rules", path: "/rules", roles: ["ADMIN"] },
  { label: "Schedule", path: "/schedule", roles: ["ADMIN", "SECURITY_GUARD"] },
  { label: "Incidents", path: "/incidents", roles: ["ADMIN", "SECURITY_GUARD"] },
  { label: "Alerts", path: "/alerts", roles: ["ADMIN"] },
  { label: "Profile", path: "/profile", roles: ["ADMIN", "SECURITY_GUARD"] },
];
