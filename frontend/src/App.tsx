import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/guards/ProtectedRoute";
import PublicRoute from "./components/guards/PublicRoute";
import AdminRoute from "./components/guards/AdminRoute";
import RootRedirect from "./components/guards/RootRedirect";
import AuthLayout from "./components/layout/AuthLayout";
import AppLayout from "./components/layout/AppLayout";

import LoginPage from "./pages/auth/LoginPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import VerificationPage from "./pages/auth/VerificationPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";

import CamerasPage from "./pages/cameras/CamerasPage";
import AddCameraPage from "./pages/cameras/AddCameraPage";
import CameraDetailsPage from "./pages/cameras/CameraDetailsPage";
import CameraFullscreenPage from "./pages/cameras/CameraFullscreenPage";

import DashboardPage from "./pages/dashboard/DashboardPage";
import ZonesPage from "./pages/zones/ZonesPage";

import UsersPage from "./pages/users/UsersPage";
import CreateUserPage from "./pages/users/CreateUserPage";
import RulesPage from "./pages/rules/RulesPage";
import SchedulePage from "./pages/schedule/SchedulePage";
import IncidentsPage from "./pages/incidents/IncidentsPage";
import IncidentDetailPage from "./pages/incidents/IncidentDetailPage";
import AnalyticsPage from "./pages/analytics/AnalyticsPage";
import AlertsPage from "./pages/alerts/AlertsPage";
import ProfilePage from "./pages/profile/ProfilePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 30_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public auth routes */}
          <Route element={<PublicRoute />}>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/verify" element={<VerificationPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>
          </Route>

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/cameras" element={<CamerasPage />} />
              <Route path="/cameras/:id" element={<CameraDetailsPage />} />
              <Route
                path="/cameras/:id/fullscreen"
                element={<CameraFullscreenPage />}
              />

              {/* Routes accessible to both Admin and Guard */}
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/incidents/:id" element={<IncidentDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />

              {/* Admin-only routes */}
              <Route element={<AdminRoute />}>
                <Route path="/cameras/add" element={<AddCameraPage />} />
                <Route path="/zones" element={<ZonesPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/users/create" element={<CreateUserPage />} />
                <Route path="/rules" element={<RulesPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
              </Route>
            </Route>
          </Route>

          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Catch-all */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
