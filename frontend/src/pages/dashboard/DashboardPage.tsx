import AdminDashboard from "./AdminDashboard";
import GuardDashboard from "./GuardDashboard";

export default function DashboardPage() {
  const role = localStorage.getItem("sentinel_role");

  if (role === "ADMIN") {
    return <AdminDashboard />;
  }

  return <GuardDashboard />;
}
