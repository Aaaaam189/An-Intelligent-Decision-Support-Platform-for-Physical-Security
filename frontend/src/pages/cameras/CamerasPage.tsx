import { useState, useMemo, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useCameras, useCameraMutations } from "../../hooks/useCameras";
import { useZones } from "../../hooks/useZones";
import CameraCard from "../../components/cameras/CameraCard";
import CameraRow from "../../components/cameras/CameraRow";
import ContextMenu from "../../components/cameras/ContextMenu";
import Spinner from "../../components/ui/Spinner";
import { colors, fontFamily, fontFamilyHeading, fontSizes, borderRadius } from "../../constants/theme";
import type { Camera } from "../../types/camera.types";

type ViewMode = "grid" | "list";

export default function CamerasPage() {
  const navigate = useNavigate();
  const { cameras, isLoading, error, refetch } = useCameras();
  const { zones } = useZones();
  const { updateCamera } = useCameraMutations();

  const [searchText, setSearchText] = useState("");
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  // Context menu state
  const [menuCamera, setMenuCamera] = useState<Camera | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const role = localStorage.getItem("sentinel_role");
  const isAdmin = role === "ADMIN";

  // Filter cameras by search and zone
  const filteredCameras = useMemo(() => {
    let result = cameras;

    // Filter by zone
    if (selectedZone) {
      result = result.filter((camera) => camera.zoneId === selectedZone);
    }

    // Filter by search text (case-insensitive)
    if (searchText.trim()) {
      const lowerSearch = searchText.toLowerCase();
      result = result.filter((camera) =>
        camera.name.toLowerCase().includes(lowerSearch)
      );
    }

    return result;
  }, [cameras, selectedZone, searchText]);

  // Get zone name by ID
  const getZoneName = (zoneId: string): string => {
    const zone = zones.find((z) => z.id === zoneId);
    return zone ? zone.name : "Unknown";
  };

  // Context menu handlers
  const handleMenuClick = (camera: Camera, event: React.MouseEvent) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({ x: rect.left, y: rect.bottom + 4 });
    setMenuCamera(camera);
  };

  const handleCloseMenu = () => {
    setMenuCamera(null);
  };

  const handleDetails = () => {
    if (menuCamera) {
      navigate(`/cameras/${menuCamera.id}`);
    }
  };

  const handleToggleActive = () => {
    if (!menuCamera) return;
    setDeactivateError(null);
    const newStatus = !menuCamera.isActive;
    updateCamera.mutate(
      { id: menuCamera.id, isActive: newStatus },
      {
        onError: (err) => {
          setDeactivateError(err.message || `Failed to ${newStatus ? "activate" : "deactivate"} camera`);
        },
      }
    );
  };

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

  const contentFrameStyle: CSSProperties = {
    backgroundColor: colors.lightGray,
    borderRadius: borderRadius.card,
    padding: "24px",
  };

  const toolbarStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "24px",
    flexWrap: "wrap",
  };

  const searchInputStyle: CSSProperties = {
    padding: "10px 16px",
    borderRadius: borderRadius.pill,
    border: "none",
    backgroundColor: colors.lightGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    outline: "none",
    minWidth: "220px",
    flex: "0 1 300px",
  };

  const selectStyle: CSSProperties = {
    padding: "10px 16px",
    borderRadius: borderRadius.pill,
    border: "none",
    backgroundColor: colors.lightGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    outline: "none",
    cursor: "pointer",
    minWidth: "150px",
  };

  const toggleContainerStyle: CSSProperties = {
    display: "flex",
    borderRadius: borderRadius.pill,
    overflow: "hidden",
    border: `1px solid ${colors.lightGray}`,
  };

  const toggleButtonStyle = (active: boolean): CSSProperties => ({
    padding: "8px 16px",
    border: "none",
    backgroundColor: active ? colors.green : colors.white,
    color: active ? colors.white : colors.black,
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 500,
    cursor: "pointer",
    transition: "background-color 0.2s, color 0.2s",
  });

  const addButtonStyle: CSSProperties = {
    padding: "10px 20px",
    borderRadius: borderRadius.pill,
    border: "none",
    backgroundColor: colors.green,
    color: colors.white,
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    cursor: "pointer",
    marginLeft: "auto",
    whiteSpace: "nowrap",
  };

  const gridStyle: CSSProperties = {
    display: "grid",
    gap: "20px",
    gridTemplateColumns: "repeat(2, 1fr)",
  };

  const tableStyle: CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontFamily,
  };

  const tableHeaderStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    color: "#666666",
    padding: "12px 16px",
    textAlign: "left",
    borderBottom: `1px solid ${colors.lightGray}`,
  };

  const emptyStateStyle: CSSProperties = {
    textAlign: "center",
    padding: "48px 16px",
    fontFamily,
    fontSize: fontSizes.body,
    color: "#666666",
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

  // Loading state
  if (isLoading) {
    return (
      <div style={{ ...pageStyle, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <Spinner size={40} color={colors.green} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={pageStyle}>
        <h1 style={titleStyle}>Cameras</h1>
        <div style={errorStyle}>
          <p style={{ margin: "0 0 12px 0" }}>Failed to load cameras: {error}</p>
          <button
            onClick={() => refetch()}
            style={{
              padding: "8px 16px",
              borderRadius: borderRadius.pill,
              border: "none",
              backgroundColor: colors.green,
              color: colors.white,
              fontFamily,
              fontSize: fontSizes.body,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>Cameras</h1>

      {/* Deactivation error message */}
      {deactivateError && (
        <div style={errorStyle}>
          {deactivateError}
        </div>
      )}

      {/* Toolbar: Search, Zone filter, View toggle, Add button */}
      <div style={toolbarStyle}>
        <input
          type="text"
          placeholder="Search cameras..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={searchInputStyle}
          aria-label="Search cameras"
        />

        <select
          value={selectedZone}
          onChange={(e) => setSelectedZone(e.target.value)}
          style={selectStyle}
          aria-label="Filter by zone"
        >
          <option value="">All Zones</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>

        <div style={toggleContainerStyle}>
          <button
            type="button"
            style={toggleButtonStyle(viewMode === "grid")}
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            Grid
          </button>
          <button
            type="button"
            style={toggleButtonStyle(viewMode === "list")}
            onClick={() => setViewMode("list")}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            List
          </button>
        </div>

        {isAdmin && (
          <button
            type="button"
            style={addButtonStyle}
            onClick={() => navigate("/cameras/add")}
          >
            + Add a camera
          </button>
        )}
      </div>

      {/* Camera content - inside frame */}
      <div style={contentFrameStyle}>
      {filteredCameras.length === 0 ? (
        <div style={emptyStateStyle}>
          <p>No cameras found</p>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid View */
        <div style={gridStyle} className="cameras-grid">
          {filteredCameras.map((camera) => (
            <CameraCard
              key={camera.id}
              camera={camera}
              onMenuClick={(e) => handleMenuClick(camera, e)}
            />
          ))}
        </div>
      ) : (
        /* List View */
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Name</th>
              <th style={tableHeaderStyle}>Zone</th>
              <th style={tableHeaderStyle}>Date of creation</th>
              <th style={tableHeaderStyle}>Status</th>
              <th style={tableHeaderStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCameras.map((camera) => (
              <CameraRow
                key={camera.id}
                camera={camera}
                zoneName={getZoneName(camera.zoneId)}
                onMenuClick={(e) => handleMenuClick(camera, e)}
              />
            ))}
          </tbody>
        </table>
      )}
      </div>

      {/* Context Menu */}
      {menuCamera && (
        <ContextMenu
          position={menuPosition}
          isActive={menuCamera.isActive}
          onDetails={handleDetails}
          onToggleActive={handleToggleActive}
          onClose={handleCloseMenu}
        />
      )}

      {/* Responsive grid styles */}
      <style>{`
        .cameras-grid {
          grid-template-columns: repeat(2, 1fr) !important;
        }
        @media (min-width: 1280px) {
          .cameras-grid {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
        @media (min-width: 1920px) {
          .cameras-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
