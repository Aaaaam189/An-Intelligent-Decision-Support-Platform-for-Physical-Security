import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useIncidents, useUpdateIncidentStatus, useReassignIncident } from "../../hooks/useIncidents";
import { useActiveUsers } from "../../hooks/useUsers";
import { useZones } from "../../hooks/useZones";
import StatusBadge from "../../components/ui/StatusBadge";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { PRIORITY_COLORS, STATUS_COLORS } from "../../constants/priority";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

export default function IncidentsPage() {
  const role = localStorage.getItem("sentinel_role");
  const isAdmin = role === "ADMIN";

  if (isAdmin) {
    return <AdminIncidentsView />;
  }

  return <GuardIncidentsView />;
}

function AdminIncidentsView() {
  const navigate = useNavigate();
  const { incidents, isLoading, error } = useIncidents();
  const { users: guards } = useActiveUsers();
  const { zones } = useZones();
  const reassignMutation = useReassignIncident();

  const [reassignTarget, setReassignTarget] = useState<string | null>(null);
  const [selectedGuardId, setSelectedGuardId] = useState("");

  const guardMap = new Map(guards.map((g) => [g.id, g.fullName]));
  const zoneMap = new Map(zones.map((z) => [z.id, z.name]));

  const guardOptions = guards
    .filter((g) => g.role === "SECURITY_GUARD")
    .map((g) => ({ value: g.id, label: g.fullName }));

  function handleReassignClick(e: React.MouseEvent, incidentId: string) {
    e.stopPropagation();
    setSelectedGuardId("");
    reassignMutation.reset();
    setReassignTarget(incidentId);
  }

  function handleReassignConfirm() {
    if (!reassignTarget || !selectedGuardId) return;
    reassignMutation.mutate(
      { id: reassignTarget, guardId: selectedGuardId },
      {
        onSuccess: () => {
          setReassignTarget(null);
          setSelectedGuardId("");
        },
      }
    );
  }

  function handleRowClick(incidentId: string) {
    navigate(`/incidents/${incidentId}`);
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={headingStyle}>Incidents</h1>
      </div>

      {isLoading && <p style={loadingStyle}>Loading incidents...</p>}

      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Zone</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Assigned Guard</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr
                key={incident.id}
                style={rowStyle}
                onClick={() => handleRowClick(incident.id)}
              >
                <td style={tdStyle}>{incident.type}</td>
                <td style={tdStyle}>
                  <StatusBadge
                    value={incident.priority}
                    colorMap={PRIORITY_COLORS}
                  />
                </td>
                <td style={tdStyle}>
                  {zoneMap.get(incident.zoneId) || "Unknown"}
                </td>
                <td style={tdStyle}>
                  <StatusBadge
                    value={incident.status}
                    colorMap={STATUS_COLORS}
                  />
                </td>
                <td style={tdStyle}>
                  {incident.assignedGuardId
                    ? guardMap.get(incident.assignedGuardId) || "Unknown"
                    : "Unassigned"}
                </td>
                <td style={tdStyle}>{formatDate(incident.createdAt)}</td>
                <td style={tdStyle}>
                  <button
                    style={reassignButtonStyle}
                    onClick={(e) => handleReassignClick(e, incident.id)}
                    type="button"
                  >
                    Reassign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Reassign Modal */}
      <Modal isOpen={!!reassignTarget} onClose={() => setReassignTarget(null)}>
        <h2 style={modalTitleStyle}>Reassign Incident</h2>
        <p style={modalDescStyle}>Select a guard to assign this incident to:</p>
        <Select
          label="Guard"
          options={guardOptions}
          value={selectedGuardId}
          onChange={setSelectedGuardId}
          placeholder="Select a guard"
        />
        {reassignMutation.error && (
          <p style={formErrorStyle} role="alert">
            {reassignMutation.error.message}
          </p>
        )}
        <div style={modalActionsStyle}>
          <button
            style={cancelButtonStyle}
            onClick={() => setReassignTarget(null)}
            type="button"
          >
            Cancel
          </button>
          <button
            style={confirmButtonStyle}
            onClick={handleReassignConfirm}
            type="button"
            disabled={!selectedGuardId || reassignMutation.isPending}
          >
            {reassignMutation.isPending ? "Reassigning..." : "Reassign"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function GuardIncidentsView() {
  const navigate = useNavigate();
  const { incidents, isLoading, error } = useIncidents();
  const { zones } = useZones();
  const statusMutation = useUpdateIncidentStatus();

  const guardId = localStorage.getItem("sentinel_userId");

  const zoneMap = new Map(zones.map((z) => [z.id, z.name]));

  // Filter incidents to only show those assigned to the authenticated guard
  const myIncidents = incidents.filter(
    (incident) => incident.assignedGuardId === guardId
  );

  function handleResolve(e: React.MouseEvent, incidentId: string) {
    e.stopPropagation();
    statusMutation.mutate({ id: incidentId, status: "RESOLVED" });
  }

  function handleClose(e: React.MouseEvent, incidentId: string) {
    e.stopPropagation();
    statusMutation.mutate({ id: incidentId, status: "CLOSED" });
  }

  function handleRowClick(incidentId: string) {
    navigate(`/incidents/${incidentId}`);
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={headingStyle}>My Incidents</h1>
      </div>

      {isLoading && <p style={loadingStyle}>Loading incidents...</p>}

      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Zone</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {myIncidents.map((incident) => (
              <tr
                key={incident.id}
                style={rowStyle}
                onClick={() => handleRowClick(incident.id)}
              >
                <td style={tdStyle}>{incident.type}</td>
                <td style={tdStyle}>
                  <StatusBadge
                    value={incident.priority}
                    colorMap={PRIORITY_COLORS}
                  />
                </td>
                <td style={tdStyle}>
                  {zoneMap.get(incident.zoneId) || "Unknown"}
                </td>
                <td style={tdStyle}>
                  <StatusBadge
                    value={incident.status}
                    colorMap={STATUS_COLORS}
                  />
                </td>
                <td style={tdStyle}>{formatDate(incident.createdAt)}</td>
                <td style={tdStyle}>
                  {incident.status !== "CLOSED" && (
                    <div style={actionGroupStyle}>
                      <button
                        style={resolveButtonStyle}
                        onClick={(e) => handleResolve(e, incident.id)}
                        type="button"
                        disabled={statusMutation.isPending}
                      >
                        Resolve
                      </button>
                      <button
                        style={closeButtonStyle}
                        onClick={(e) => handleClose(e, incident.id)}
                        type="button"
                        disabled={statusMutation.isPending}
                      >
                        Close
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// --- Styles ---

const pageStyle: CSSProperties = {
  padding: "32px",
  fontFamily,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "24px",
};

const headingStyle: CSSProperties = {
  fontSize: fontSizes.pageHeading,
  fontWeight: 600,
  color: colors.black,
  fontFamily,
  margin: 0,
};

const loadingStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  padding: "16px 0",
};

const errorStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.red,
  padding: "16px 0",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily,
  fontSize: fontSizes.body,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontWeight: 600,
  color: colors.black,
  borderBottom: `2px solid ${colors.darkGray}`,
};

const tdStyle: CSSProperties = {
  padding: "12px 16px",
  color: colors.black,
  borderBottom: `1px solid ${colors.darkGray}`,
  verticalAlign: "middle",
};

const rowStyle: CSSProperties = {
  cursor: "pointer",
  transition: "background-color 0.15s ease",
};

const reassignButtonStyle: CSSProperties = {
  padding: "6px 14px",
  fontSize: fontSizes.body,
  fontFamily,
  fontWeight: 600,
  border: "none",
  borderRadius: borderRadius.pill,
  cursor: "pointer",
  backgroundColor: colors.darkGray,
  color: colors.black,
};

const modalTitleStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.sectionHeading,
  fontWeight: 600,
  color: colors.black,
  margin: "0 0 12px 0",
};

const modalDescStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  margin: "0 0 20px 0",
};

const modalActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "12px",
  marginTop: "20px",
};

const cancelButtonStyle: CSSProperties = {
  padding: "10px 24px",
  fontSize: fontSizes.body,
  fontFamily,
  fontWeight: 600,
  backgroundColor: "transparent",
  color: colors.black,
  border: `1px solid ${colors.darkGray}`,
  borderRadius: borderRadius.pill,
  cursor: "pointer",
};

const confirmButtonStyle: CSSProperties = {
  padding: "10px 24px",
  fontSize: fontSizes.body,
  fontFamily,
  fontWeight: 600,
  backgroundColor: colors.green,
  color: colors.white,
  border: "none",
  borderRadius: borderRadius.pill,
  cursor: "pointer",
};

const formErrorStyle: CSSProperties = {
  fontFamily,
  fontSize: "12px",
  color: colors.red,
  marginTop: "8px",
};

const actionGroupStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
};

const resolveButtonStyle: CSSProperties = {
  padding: "6px 14px",
  fontSize: fontSizes.body,
  fontFamily,
  fontWeight: 600,
  border: "none",
  borderRadius: borderRadius.pill,
  cursor: "pointer",
  backgroundColor: colors.green,
  color: colors.white,
};

const closeButtonStyle: CSSProperties = {
  padding: "6px 14px",
  fontSize: fontSizes.body,
  fontFamily,
  fontWeight: 600,
  border: "none",
  borderRadius: borderRadius.pill,
  cursor: "pointer",
  backgroundColor: colors.darkGray,
  color: colors.black,
};
