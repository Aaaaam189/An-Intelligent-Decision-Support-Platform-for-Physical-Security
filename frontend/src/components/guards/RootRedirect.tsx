import { Navigate } from "react-router-dom";

const STORAGE_KEY = "sentinel_token";

export default function RootRedirect() {
  const token = localStorage.getItem(STORAGE_KEY);

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
}
