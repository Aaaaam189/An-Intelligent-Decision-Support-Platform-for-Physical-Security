import { Navigate, Outlet } from "react-router-dom";

const ROLE_KEY = "sentinel_role";

export default function AdminRoute() {
  const role = localStorage.getItem(ROLE_KEY);

  if (role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
