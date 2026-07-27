import { Navigate, Outlet } from "react-router-dom";

const STORAGE_KEY = "sentinel_token";

export default function PublicRoute() {
  const token = localStorage.getItem(STORAGE_KEY);

  if (token) {
    return <Navigate to="/cameras" replace />;
  }

  return <Outlet />;
}
