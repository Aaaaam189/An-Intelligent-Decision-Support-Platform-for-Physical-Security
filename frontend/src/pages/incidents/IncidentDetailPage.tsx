import { useState, type CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useIncident,
  useUpdateIncidentStatus,
  useReassignIncident,
} from "../../hooks/useIncidents";
import { useIncidentEvents } from "../../hooks/useIncidentEvents";
import { useActiveUsers } from "../../hooks/useUsers";
import { useZones } from "../../hooks/useZones";
import { useCameras } from "../../hooks/useCameras";
import { useRules } from "../../hooks/useRules";
import StatusBadge from "../../components/ui/StatusBadge";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import IncidentTimeline from "../../components/incidents/IncidentTimeline";
import EvidenceGallery from "../../components/incidents/EvidenceGallery";
import { formatObjectCounts } from "../../components/incidents/situation";
import { PRIORITY_COLORS, STATUS_COLORS } from "../../constants/priority";
import {
  colors,
  fontFamily,
  fontSizes,
  borderRadius,
} from "../../constants/theme";
import type { IncidentStatus } from "../../types/incident.types";

const STATUS_SEQUENCE: IncidentStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

/**
 * Returns the valid next statuses from the current status.
 * Only forward transitions are allowed (no skipping).
 */
function getNextStatuses(current: IncidentStatus): IncidentStatus[] {
  const currentIndex = STATUS_SEQUENCE.indexOf(current);
  if (currentIndex === -1 || currentIndex >= STATUS_SEQUENCE.length - 1) {
    return [];
  }
  return [STATUS_SEQUENCE[currentIndex + 1]];
}

function getStatusLabel(status: IncidentStatus): string {
  switch (status) {
    case "IN_PROGRESS":
      return "Mark In Progress";
    case "RESOLVED":
      return "Resolve";
    case "CLOSED":
      return "Close";
    default:
      return status;
  }
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { incident, isLoading, error } = useIncident(id ?? "");
  const { events } = useIncidentEvents(id ?? "");
  const { users: guards } = useActiveUsers();
  const { zones } = useZones();
  const { cameras } = useCameras();
  const { rules } = useRules();
  const statusMutation = useUpdateIncidentStatus();
  const reassignMutation = useReassignIncident();

  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedGuardId, setSelectedGuardId] = useState("");

  const role = localStorage.getItem("sentinel_role");
  const isAdmin = role === "ADMIN";

  // Build lookup maps
  const zoneMap = new Map(zones.map((z) => [z.id, z.name]));
  const cameraMap = new Map(cameras.map((c) => [c.id, c.name]));
  const guardMap = new Map(guards.map((g) => [g.id, g.fullName]));
  const ruleMap = new Map(rules.map((r) => [r.id, r.name]));

  const guardOptions = guards
    .filter((g) => g.role === "SECURITY_GUARD")
    .map((g) => ({ value: g.id, label: g.fullName }));

  function handleStatusChange(newStatus: IncidentStatus) {
    if (!incident) return;
    statusMutation.mutate({ id: incident.id, status: newStatus });
  }

  function handleReassignOpen() {
    setSelectedGuardId("");
    reassignMutation.reset();
    setShowReassignModal(true);
  }

  function handleReassignConfirm() {
    if (!incident || !selectedGuardId) return;
    reassignMutation.mutate(
      { id: incident.id, guardId: selectedGuardId },
      {
        onSuccess: () => {
          setShowReassignModal(false);
          setSelectedGuardId("");
        },
      }
    );
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Error state
  if (error) {
    return (
      <div style={pageStyle}>
        <p style={errorStyle} role="alert">
          {error}
        </p>
        <button
          style={goBackButtonStyle}
          onClick={() => navigate("/incidents")}
          type="button"
        >
          ← Go Back
        </button>
      </div>
    );
  }

  // Loading state
  if (isLoading || !incident) {
    return (
      <div style={pageStyle}>
        <p style={loadingStyle}>Loading incident details...</p>
      </div>
    );
  }

  const nextStatuses = getNextStatuses(incident.status);

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <button
            style={backLinkStyle}
            onClick={() => navigate("/incidents")}
            type="button"
          >
            ← Back to Incidents
          </button>
          <h1 style={headingStyle}>Incident Detail</h1>
        </div>
        <div style={headerActionsStyle}>
          {isAdmin && (
            <button
              style={reassignButtonStyle}
              onClick={handleReassignOpen}
              type="button"
            >
              Reassign
            </button>
          )}
          {!isAdmin &&
            nextStatuses.map((status) => (
              <button
                key={status}
                style={statusActionButtonStyle}
                onClick={() => handleStatusChange(status)}
                type="button"
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending
                  ? "Updating..."
                  : getStatusLabel(status)}
              </button>
            ))}
        </div>
      </div>

      {statusMutation.error && (
        <p style={mutationErrorStyle} role="alert">
          {statusMutation.error.message}
        </p>
      )}

      {/* Detail Fields */}
      <div style={detailGridStyle}>
        <DetailField label="Type" value={incident.type} />
        <DetailField
          label="Priority"
          value={
            <StatusBadge
              value={incident.priority}
              colorMap={PRIORITY_COLORS}
            />
          }
        />
        <DetailField label="Risk Score" value={String(incident.riskScore)} />
        <DetailField
          label="Status"
          value={
            <StatusBadge value={incident.status} colorMap={STATUS_COLORS} />
          }
        />
        <DetailField
          label="Zone"
          value={zoneMap.get(incident.zoneId) || "Unknown"}
        />
        <DetailField
          label="Camera"
          value={cameraMap.get(incident.cameraId) || "Unknown"}
        />
        <DetailField
          label="Assigned Guard"
          value={
            incident.assignedGuardId
              ? guardMap.get(incident.assignedGuardId) || "Unknown"
              : "Unassigned"
          }
        />
        <DetailField
          label="Rule"
          value={
            incident.ruleId
              ? ruleMap.get(incident.ruleId) || "Unknown"
              : "None"
          }
        />
        <DetailField label="Created" value={formatDate(incident.createdAt)} />
        <DetailField label="Closed" value={formatDate(incident.closedAt)} />
      </div>

      {/* Situation: what this incident involves and how it evolved */}
      <div style={situationSectionStyle}>
        <h2 style={sectionHeadingStyle}>What happened</h2>
        <div style={situationSummaryStyle}>
          {formatObjectCounts(incident) && (
            <DetailField label="Involves" value={formatObjectCounts(incident)} />
          )}
          {incident.contributingTypes && incident.contributingTypes.length > 1 && (
            <DetailField
              label="Situation progressed"
              value={incident.contributingTypes.join(" → ")}
            />
          )}
          {incident.escalatedAt && (
            <DetailField
              label="Escalated"
              value={formatDate(incident.escalatedAt)}
            />
          )}
        </div>
        <IncidentTimeline events={events} />
      </div>

      {/* Evidence */}
      <div style={situationSectionStyle}>
        <h2 style={sectionHeadingStyle}>Evidence</h2>
        <EvidenceGallery events={events} />
      </div>

      {/* Status Timeline */}
      <div style={timelineSectionStyle}>
        <h2 style={sectionHeadingStyle}>Status Timeline</h2>
        <div style={timelineContainerStyle}>
          {STATUS_SEQUENCE.map((status, index) => {
            const currentIndex = STATUS_SEQUENCE.indexOf(incident.status);
            const isReached = index <= currentIndex;
            const isCurrent = status === incident.status;

            // Determine timestamp for this step
            let timestamp: string | null = null;
            if (status === "PENDING") {
              timestamp = incident.createdAt;
            } else if (status === "CLOSED" && incident.closedAt) {
              timestamp = incident.closedAt;
            } else if (isReached) {
              // For intermediate statuses, we don't have exact timestamps
              // from the API, so we show a checkmark for reached states
              timestamp = null;
            }

            return (
              <div key={status} style={timelineItemStyle}>
                {/* Connector line (not on first item) */}
                {index > 0 && (
                  <div
                    style={{
                      ...timelineLineStyle,
                      backgroundColor: isReached
                        ? STATUS_COLORS[status]
                        : colors.darkGray,
                    }}
                  />
                )}
                {/* Circle */}
                <div
                  style={{
                    ...timelineCircleStyle,
                    backgroundColor: isReached
                      ? STATUS_COLORS[status]
                      : colors.darkGray,
                    border: isCurrent
                      ? `3px solid ${colors.black}`
                      : "3px solid transparent",
                  }}
                />
                {/* Label */}
                <div style={timelineLabelContainerStyle}>
                  <span
                    style={{
                      ...timelineLabelStyle,
                      fontWeight: isCurrent ? 700 : 400,
                      color: isReached ? colors.black : colors.darkGray,
                    }}
                  >
                    {status.replace("_", " ")}
                  </span>
                  {timestamp && (
                    <span style={timelineTimestampStyle}>
                      {formatDate(timestamp)}
                    </span>
                  )}
                  {isReached && !timestamp && status !== "PENDING" && (
                    <span style={timelineTimestampStyle}>✓ Completed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reassign Modal */}
      <Modal
        isOpen={showReassignModal}
        onClose={() => setShowReassignModal(false)}
      >
        <h2 style={modalTitleStyle}>Reassign Incident</h2>
        <p style={modalDescStyle}>
          Select a guard to assign this incident to:
        </p>
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
            onClick={() => setShowReassignModal(false)}
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

// --- Detail Field Helper ---

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
}

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <div style={detailFieldStyle}>
      <span style={detailLabelStyle}>{label}</span>
      <span style={detailValueStyle}>{value}</span>
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
  alignItems: "flex-start",
  marginBottom: "32px",
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "center",
};

const backLinkStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  marginBottom: "8px",
  display: "block",
  opacity: 0.7,
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

const mutationErrorStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.red,
  marginBottom: "16px",
};

const goBackButtonStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  background: "none",
  border: `1px solid ${colors.darkGray}`,
  borderRadius: borderRadius.pill,
  padding: "10px 24px",
  cursor: "pointer",
  fontWeight: 600,
};

const reassignButtonStyle: CSSProperties = {
  padding: "10px 24px",
  fontSize: fontSizes.body,
  fontFamily,
  fontWeight: 600,
  border: "none",
  borderRadius: borderRadius.pill,
  cursor: "pointer",
  backgroundColor: colors.darkGray,
  color: colors.black,
};

const statusActionButtonStyle: CSSProperties = {
  padding: "10px 24px",
  fontSize: fontSizes.body,
  fontFamily,
  fontWeight: 600,
  border: "none",
  borderRadius: borderRadius.pill,
  cursor: "pointer",
  backgroundColor: colors.green,
  color: colors.white,
};

// Detail grid
const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "20px",
  marginBottom: "40px",
  backgroundColor: colors.lightGray,
  padding: "24px",
  borderRadius: borderRadius.card,
};

const detailFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const detailLabelStyle: CSSProperties = {
  fontFamily,
  fontSize: "12px",
  fontWeight: 600,
  color: colors.black,
  opacity: 0.6,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const detailValueStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  fontWeight: 500,
};

// Situation ("what happened") + evidence
const situationSectionStyle: CSSProperties = {
  marginBottom: "40px",
};

const situationSummaryStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "32px",
  marginBottom: "20px",
};

// Timeline
const timelineSectionStyle: CSSProperties = {
  marginBottom: "40px",
};

const sectionHeadingStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.sectionHeading,
  fontWeight: 600,
  color: colors.black,
  marginBottom: "20px",
};

const timelineContainerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0",
  position: "relative",
  padding: "16px 0",
};

const timelineItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  flex: 1,
  position: "relative",
};

const timelineLineStyle: CSSProperties = {
  position: "absolute",
  top: "12px",
  right: "50%",
  width: "100%",
  height: "4px",
  zIndex: 0,
};

const timelineCircleStyle: CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  zIndex: 1,
  flexShrink: 0,
  boxSizing: "border-box",
};

const timelineLabelContainerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  marginTop: "8px",
  gap: "2px",
};

const timelineLabelStyle: CSSProperties = {
  fontFamily,
  fontSize: "12px",
  textAlign: "center",
};

const timelineTimestampStyle: CSSProperties = {
  fontFamily,
  fontSize: "11px",
  color: colors.black,
  opacity: 0.5,
  textAlign: "center",
};

// Modal styles
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
