import { useMemo, type CSSProperties } from "react";
import { useIncidents } from "../../hooks/useIncidents";
import { useCameras } from "../../hooks/useCameras";
import Spinner from "../../components/ui/Spinner";
import {
  colors,
  fontFamily,
  fontFamilyHeading,
  fontSizes,
  borderRadius,
} from "../../constants/theme";
import type { IncidentPriority } from "../../types/incident.types";

const PRIORITY_COLORS: Record<IncidentPriority, string> = {
  LOW: "#4CAF50",
  MEDIUM: "#FF9800",
  HIGH: "#F44336",
  CRITICAL: "#9C27B0",
};

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GuardDashboard() {
  const guardId = localStorage.getItem("sentinel_uid");

  const { incidents, isLoading: incidentsLoading, error: incidentsError } =
    useIncidents();
  const { cameras, isLoading: camerasLoading, error: camerasError } =
    useCameras();

  // Filter incidents assigned to this guard
  const assignedIncidents = useMemo(() => {
    if (!guardId) return [];
    return incidents.filter((incident) => incident.assignedGuardId === guardId);
  }, [incidents, guardId]);

  // Get cameras associated with the guard's assigned incidents (by zoneId)
  const assignedCameras = useMemo(() => {
    const zoneIds = new Set(
      assignedIncidents.map((incident) => incident.zoneId)
    );
    return cameras.filter((camera) => zoneIds.has(camera.zoneId));
  }, [assignedIncidents, cameras]);

  // Styles
  const pageStyle: CSSProperties = {
    padding: "24px 32px",
    fontFamily,
    minWidth: "1024px",
  };

  const titleStyle: CSSProperties = {
    fontSize: "28px",
    fontFamily: fontFamilyHeading,
    fontWeight: 700,
    color: colors.black,
    margin: "0 0 24px 0",
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: fontSizes.sectionHeading,
    fontFamily: fontFamilyHeading,
    fontWeight: 600,
    color: colors.black,
    margin: "0 0 16px 0",
  };

  const sectionStyle: CSSProperties = {
    marginBottom: "32px",
  };

  const errorStyle: CSSProperties = {
    padding: "12px 16px",
    backgroundColor: "#FFF0F0",
    color: colors.red,
    borderRadius: borderRadius.card,
    fontFamily,
    fontSize: fontSizes.body,
    marginBottom: "16px",
  };

  const incidentCardStyle: CSSProperties = {
    backgroundColor: colors.white,
    borderRadius: borderRadius.card,
    padding: "16px 20px",
    marginBottom: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  };

  const incidentInfoStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flex: 1,
  };

  const priorityBadgeStyle = (priority: IncidentPriority): CSSProperties => ({
    padding: "4px 10px",
    borderRadius: borderRadius.pill,
    backgroundColor: PRIORITY_COLORS[priority],
    color: colors.white,
    fontSize: "12px",
    fontWeight: 600,
    fontFamily,
    textTransform: "uppercase",
  });

  const statusBadgeStyle: CSSProperties = {
    padding: "4px 10px",
    borderRadius: borderRadius.pill,
    backgroundColor: colors.lightGray,
    color: colors.black,
    fontSize: "12px",
    fontWeight: 500,
    fontFamily,
  };

  const incidentTypeStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    color: colors.black,
    minWidth: "180px",
  };

  const incidentTimeStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: "#666666",
  };

  const cameraGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  };

  const cameraCardStyle: CSSProperties = {
    backgroundColor: colors.white,
    borderRadius: borderRadius.card,
    padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  };

  const cameraThumbnailStyle: CSSProperties = {
    width: "100%",
    height: "160px",
    backgroundColor: colors.lightGray,
    borderRadius: "8px",
    marginBottom: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#999999",
    fontSize: fontSizes.body,
    fontFamily,
  };

  const cameraNameStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    color: colors.black,
    margin: "0 0 4px 0",
  };

  const cameraLocationStyle: CSSProperties = {
    fontFamily,
    fontSize: "12px",
    color: "#666666",
    margin: 0,
  };

  const emptyStateStyle: CSSProperties = {
    textAlign: "center",
    padding: "32px 16px",
    fontFamily,
    fontSize: fontSizes.body,
    color: "#666666",
    backgroundColor: colors.lightGray,
    borderRadius: borderRadius.card,
  };

  // Loading state
  if (incidentsLoading && camerasLoading) {
    return (
      <div
        style={{
          ...pageStyle,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "300px",
        }}
      >
        <Spinner size={40} color={colors.green} />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>My Dashboard</h1>

      {/* Assigned Incidents Section */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Assigned Incidents</h2>

        {incidentsLoading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
            <Spinner size={32} color={colors.green} />
          </div>
        )}

        {incidentsError && (
          <div style={errorStyle}>
            Failed to load incidents: {incidentsError}
          </div>
        )}

        {!incidentsLoading && !incidentsError && assignedIncidents.length === 0 && (
          <div style={emptyStateStyle}>
            <p style={{ margin: 0 }}>No incidents assigned to you</p>
          </div>
        )}

        {!incidentsLoading &&
          !incidentsError &&
          assignedIncidents.map((incident) => (
            <div
              key={incident.id}
              style={incidentCardStyle}
              data-testid="incident-card"
            >
              <div style={incidentInfoStyle}>
                <span style={incidentTypeStyle} data-testid="incident-type">
                  {incident.type.replace(/_/g, " ")}
                </span>
                <span
                  style={priorityBadgeStyle(incident.priority)}
                  data-testid="incident-priority"
                >
                  {incident.priority}
                </span>
                <span style={statusBadgeStyle} data-testid="incident-status">
                  {incident.status.replace(/_/g, " ")}
                </span>
              </div>
              <span style={incidentTimeStyle} data-testid="incident-time">
                {formatDate(incident.createdAt)}
              </span>
            </div>
          ))}
      </section>

      {/* Cameras Section */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Assigned Cameras</h2>

        {camerasLoading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
            <Spinner size={32} color={colors.green} />
          </div>
        )}

        {camerasError && (
          <div style={errorStyle}>
            Failed to load cameras: {camerasError}
          </div>
        )}

        {!camerasLoading && !camerasError && assignedCameras.length === 0 && (
          <div style={emptyStateStyle}>
            <p style={{ margin: 0 }}>No cameras assigned to your zones</p>
          </div>
        )}

        {!camerasLoading && !camerasError && assignedCameras.length > 0 && (
          <div style={cameraGridStyle}>
            {assignedCameras.map((camera) => (
              <div key={camera.id} style={cameraCardStyle}>
                <div style={cameraThumbnailStyle}>
                  {camera.isActive ? "Live Feed" : "Offline"}
                </div>
                <p style={cameraNameStyle}>{camera.name}</p>
                <p style={cameraLocationStyle}>{camera.location}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
