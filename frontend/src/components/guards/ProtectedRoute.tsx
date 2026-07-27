import { Navigate, Outlet } from "react-router-dom";

const STORAGE_KEY = "sentinel_token";

export default function ProtectedRoute() {
  const token = localStorage.getItem(STORAGE_KEY);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
