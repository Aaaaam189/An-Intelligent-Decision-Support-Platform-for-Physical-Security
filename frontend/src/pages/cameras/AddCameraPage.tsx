import { useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCameraMutations } from "../../hooks/useCameras";
import { useZones } from "../../hooks/useZones";
import { validateCameraForm } from "../../utils/validators";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { colors, fontFamily, fontFamilyHeading, fontSizes, borderRadius } from "../../constants/theme";

export default function AddCameraPage() {
  const navigate = useNavigate();
  const { zones, isLoading: zonesLoading, error: zonesError } = useZones();
  const { createCamera } = useCameraMutations();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const zonesDisabled = zonesLoading || !!zonesError || zones.length === 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);

    const errors = validateCameraForm({ name, location, zoneId, streamUrl });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    createCamera.mutate(
      { name: name.trim(), location: location.trim(), zoneId, streamUrl: streamUrl.trim() },
      {
        onSuccess: () => {
          navigate("/cameras");
        },
        onError: (err) => {
          setApiError(err.message || "Failed to create camera");
        },
      }
    );
  };

  const handleCancel = () => {
    navigate("/cameras");
  };

  // Styles
  const pageStyle: CSSProperties = {
    padding: "24px 32px",
    fontFamily,
    minWidth: "1024px",
    maxWidth: "600px",
    margin: "0 auto",
  };

  const titleStyle: CSSProperties = {
    fontSize: "28px",
    fontFamily: fontFamilyHeading,
    fontWeight: 700,
    color: colors.black,
    margin: "0 0 32px 0",
    textAlign: "center",
  };

  const formFrameStyle: CSSProperties = {
    backgroundColor: colors.lightGray,
    borderRadius: borderRadius.card,
    padding: "32px",
  };

  const selectWrapperStyle: CSSProperties = {
    width: "100%",
    marginBottom: "16px",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "12px",
  };

  const selectLabelStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    color: colors.black,
    whiteSpace: "nowrap",
    minWidth: "120px",
    textAlign: "left",
  };

  const selectStyle: CSSProperties = {
    flex: 1,
    padding: "12px 20px",
    borderRadius: borderRadius.pill,
    border: fieldErrors.zoneId ? `1px solid ${colors.red}` : "1px solid transparent",
    backgroundColor: colors.darkGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    outline: "none",
    cursor: zonesDisabled ? "not-allowed" : "pointer",
    opacity: zonesDisabled ? 0.6 : 1,
    boxSizing: "border-box",
    appearance: "auto",
  };

  const selectErrorStyle: CSSProperties = {
    fontFamily,
    fontSize: "12px",
    color: colors.red,
    marginTop: "4px",
  };

  const apiErrorStyle: CSSProperties = {
    padding: "12px 16px",
    backgroundColor: "#FFF0F0",
    color: colors.red,
    borderRadius: borderRadius.card,
    fontFamily,
    fontSize: fontSizes.body,
    marginBottom: "16px",
  };

  const buttonsStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    marginTop: "32px",
  };

  return (
    <div style={pageStyle}>
      <button
        type="button"
        onClick={() => navigate("/cameras")}
        style={{ background: "none", border: "none", color: colors.green, fontFamily, fontSize: fontSizes.body, fontWeight: 600, cursor: "pointer", padding: "0", marginBottom: "16px" }}
      >
        ← Back to Cameras
      </button>
      <h1 style={titleStyle}>Add Camera</h1>

      <div style={formFrameStyle}>
      <form onSubmit={handleSubmit} noValidate>
        <Input
          label="Name"
          value={name}
          onChange={(val) => {
            setName(val);
            if (fieldErrors.name) {
              setFieldErrors((prev) => { const next = { ...prev }; delete next.name; return next; });
            }
          }}
          maxLength={100}
          error={fieldErrors.name}
          placeholder="Camera name"
        />

        <Input
          label="Location"
          value={location}
          onChange={(val) => {
            setLocation(val);
            if (fieldErrors.location) {
              setFieldErrors((prev) => { const next = { ...prev }; delete next.location; return next; });
            }
          }}
          maxLength={200}
          error={fieldErrors.location}
          placeholder="Camera location"
        />

        {/* Zone Dropdown */}
        <div style={selectWrapperStyle}>
          <label style={selectLabelStyle} htmlFor="zone-select">
            Zone:
          </label>
          <select
            id="zone-select"
            value={zoneId}
            onChange={(e) => {
              setZoneId(e.target.value);
              if (fieldErrors.zoneId) {
                setFieldErrors((prev) => { const next = { ...prev }; delete next.zoneId; return next; });
              }
            }}
            disabled={zonesDisabled}
            style={selectStyle}
            aria-invalid={!!fieldErrors.zoneId}
            aria-describedby={fieldErrors.zoneId ? "zone-error" : undefined}
          >
            {zonesDisabled ? (
              <option value="">No zones available</option>
            ) : (
              <>
                <option value="">Select a zone</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </>
            )}
          </select>
          {fieldErrors.zoneId && (
            <p id="zone-error" style={selectErrorStyle} role="alert">
              {fieldErrors.zoneId}
            </p>
          )}
        </div>

        <Input
          label="Stream URL"
          value={streamUrl}
          onChange={(val) => {
            setStreamUrl(val);
            if (fieldErrors.streamUrl) {
              setFieldErrors((prev) => { const next = { ...prev }; delete next.streamUrl; return next; });
            }
          }}
          maxLength={500}
          error={fieldErrors.streamUrl}
          placeholder="rtsp:// or http:// stream URL"
        />

        {/* API Error */}
        {apiError && (
          <div style={apiErrorStyle} role="alert">
            {apiError}
          </div>
        )}

        {/* Buttons */}
        <div style={buttonsStyle}>
          <Button
            variant="primary"
            type="submit"
            isLoading={createCamera.isPending}
            disabled={createCamera.isPending}
          >
            Create
          </Button>
          <Button
            variant="destructive"
            type="button"
            onClick={handleCancel}
          >
            Cancel
          </Button>
        </div>
      </form>
      </div>
    </div>
  );
}
