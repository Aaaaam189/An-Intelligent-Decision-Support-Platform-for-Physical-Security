import { useState, type CSSProperties } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCamera, useCameraMutations } from "../../hooks/useCameras";
import { useZones } from "../../hooks/useZones";
import DeleteConfirmationModal from "../../components/cameras/DeleteConfirmationModal";
import Spinner from "../../components/ui/Spinner";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

type EditableField = "name" | "location" | "zoneId" | "streamUrl";

export default function CameraDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { camera, isLoading, error } = useCamera(id || "");
  const { zones } = useZones();
  const { updateCamera } = useCameraMutations();

  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editValue, setEditValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const role = localStorage.getItem("sentinel_role");
  const isAdmin = role === "ADMIN";

  // Get zone name by ID
  const getZoneName = (zoneId: string): string => {
    const zone = zones.find((z) => z.id === zoneId);
    return zone ? zone.name : "Unknown";
  };

  // Start editing a field
  const handleEdit = (field: EditableField) => {
    if (!camera) return;
    setEditingField(field);
    setEditValue(camera[field]);
    setFieldError(null);
  };

  // Cancel editing
  const handleCancel = () => {
    setEditingField(null);
    setEditValue("");
    setFieldError(null);
  };

  // Save edited field
  const handleSave = () => {
    if (!camera || !editingField || !id) return;
    setFieldError(null);
    setIsSaving(true);

    updateCamera.mutate(
      { id, [editingField]: editValue },
      {
        onSuccess: () => {
          setEditingField(null);
          setEditValue("");
          setIsSaving(false);
        },
        onError: (err) => {
          setFieldError(err.message || "Failed to update. Please try again.");
          setIsSaving(false);
        },
      }
    );
  };

  // Toggle camera active status
  const handleToggleActive = () => {
    if (!id || !camera) return;
    updateCamera.mutate({ id, isActive: !camera.isActive });
  };

  // Styles
  const pageStyle: CSSProperties = {
    display: "flex",
    minHeight: "100vh",
    fontFamily,
    minWidth: "1024px",
  };

  const leftPanelStyle: CSSProperties = {
    flex: 1,
    backgroundColor: colors.black,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    position: "relative",
    minHeight: "400px",
  };

  const fullscreenIconStyle: CSSProperties = {
    position: "absolute",
    top: "16px",
    right: "16px",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    border: "none",
    borderRadius: "8px",
    padding: "8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const rightPanelStyle: CSSProperties = {
    width: "400px",
    padding: "32px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    overflowY: "auto",
  };

  const detailsHeadingStyle: CSSProperties = {
    fontSize: fontSizes.sectionHeading,
    fontWeight: 700,
    color: colors.black,
    fontFamily,
    margin: 0,
  };

  const fieldContainerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  const fieldLabelStyle: CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    color: "#666666",
    textTransform: "uppercase",
    fontFamily,
  };

  const fieldRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const fieldValueStyle: CSSProperties = {
    fontSize: fontSizes.body,
    color: colors.black,
    fontFamily,
    wordBreak: "break-word",
  };

  const editInputStyle: CSSProperties = {
    flex: 1,
    padding: "8px 14px",
    borderRadius: borderRadius.pill,
    border: "1px solid transparent",
    backgroundColor: colors.lightGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    outline: "none",
  };

  const iconButtonStyle: CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const actionButtonStyle: CSSProperties = {
    background: "none",
    border: "none",
    color: colors.red,
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    cursor: "pointer",
    padding: "8px 0",
    textAlign: "left",
  };

  const errorInlineStyle: CSSProperties = {
    color: colors.red,
    fontSize: "12px",
    fontFamily,
    marginTop: "4px",
  };

  const notFoundStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "300px",
    fontFamily,
    gap: "16px",
    padding: "32px",
  };

  const loadingStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    fontFamily,
  };

  // Loading state
  if (isLoading) {
    return (
      <div style={loadingStyle}>
        <Spinner size={40} color={colors.green} />
      </div>
    );
  }

  // Not found / error state
  if (error || !camera) {
    const is404 = error?.includes("404") || error?.includes("not found") || error?.includes("Not Found");
    if (is404 || (!isLoading && !camera)) {
      return (
        <div style={notFoundStyle}>
          <p style={{ fontSize: fontSizes.sectionHeading, color: colors.black, margin: 0 }}>
            Camera not found
          </p>
          <Link
            to="/cameras"
            style={{
              color: colors.green,
              fontFamily,
              fontSize: fontSizes.body,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            ← Back to Cameras
          </Link>
        </div>
      );
    }

    return (
      <div style={notFoundStyle}>
        <p style={{ fontSize: fontSizes.body, color: colors.red, margin: 0 }}>
          {error || "Failed to load camera"}
        </p>
        <Link
          to="/cameras"
          style={{
            color: colors.green,
            fontFamily,
            fontSize: fontSizes.body,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Back to Cameras
        </Link>
      </div>
    );
  }

  // Render a detail field (read-only or editable)
  const renderField = (label: string, field: EditableField, value: string) => {
    const isEditing = editingField === field;

    return (
      <div style={fieldContainerStyle} key={field}>
        <span style={fieldLabelStyle}>{label}</span>
        {isEditing ? (
          <>
            <div style={fieldRowStyle}>
              {field === "zoneId" ? (
                <select
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  style={{
                    ...editInputStyle,
                    cursor: "pointer",
                    appearance: "auto",
                  }}
                  aria-label={`Edit ${label}`}
                >
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  style={editInputStyle}
                  aria-label={`Edit ${label}`}
                  autoFocus
                />
              )}
              {/* Save button (green checkmark) */}
              <button
                type="button"
                style={iconButtonStyle}
                onClick={handleSave}
                disabled={isSaving}
                aria-label={`Save ${label}`}
                title="Save"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke={colors.green}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {/* Cancel button (X) */}
              <button
                type="button"
                style={iconButtonStyle}
                onClick={handleCancel}
                aria-label={`Cancel editing ${label}`}
                title="Cancel"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke={colors.red}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {fieldError && <span style={errorInlineStyle}>{fieldError}</span>}
          </>
        ) : (
          <div style={fieldRowStyle}>
            <span style={fieldValueStyle}>
              {field === "zoneId" ? getZoneName(value) : value}
            </span>
            {isAdmin && (
              <button
                type="button"
                style={iconButtonStyle}
                onClick={() => handleEdit(field)}
                aria-label={`Edit ${label}`}
                title={`Edit ${label}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M15.232 5.232l3.536 3.536M9 13l-2 6 6-2 9.536-9.536a2.5 2.5 0 00-3.536-3.536L9 13z"
                    stroke={colors.green}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <button
        type="button"
        onClick={() => navigate("/cameras")}
        style={{ background: "none", border: "none", color: colors.green, fontFamily, fontSize: fontSizes.body, fontWeight: 600, cursor: "pointer", padding: "16px 32px", textAlign: "left" }}
      >
        ← Back to Cameras
      </button>
    <div style={pageStyle}>
      {/* Left Panel: Video Stream Player */}
      <div
        style={leftPanelStyle}
        onClick={() => navigate(`/cameras/${id}/fullscreen`)}
        role="button"
        tabIndex={0}
        aria-label="Open fullscreen view"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            navigate(`/cameras/${id}/fullscreen`);
          }
        }}
      >
        {/* Placeholder video area */}
        <p style={{ color: "#666666", fontSize: fontSizes.body, fontFamily }}>
          Video Stream
        </p>

        {/* Fullscreen icon */}
        <button
          type="button"
          style={fullscreenIconStyle}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/cameras/${id}/fullscreen`);
          }}
          aria-label="Go to fullscreen"
          title="Fullscreen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
              stroke={colors.white}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Right Panel: Details */}
      <div style={rightPanelStyle}>
        <h2 style={detailsHeadingStyle}>Details</h2>

        {renderField("Name", "name", camera.name)}
        {renderField("Location", "location", camera.location)}
        {renderField("Zone", "zoneId", camera.zoneId)}
        {renderField("Stream URL", "streamUrl", camera.streamUrl)}

        {/* Admin-only action buttons */}
        {isAdmin && (
          <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              type="button"
              style={actionButtonStyle}
              onClick={handleToggleActive}
            >
              {camera.isActive ? "Deactivate" : "Activate"}
            </button>
            <button
              type="button"
              style={actionButtonStyle}
              onClick={() => setDeleteModalOpen(true)}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {id && (
        <DeleteConfirmationModal
          isOpen={deleteModalOpen}
          cameraId={id}
          onClose={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
    </div>
  );
}
