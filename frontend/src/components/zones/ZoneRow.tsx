import { useState, useEffect, type CSSProperties, type FormEvent } from "react";
import type { Zone } from "../../types/zone.types";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

interface ZoneRowProps {
  zone: Zone;
  onUpdate: (id: string, name: string) => void;
  onDelete: (zone: Zone) => void;
  isUpdating: boolean;
  updateError: string | null;
}

export default function ZoneRow({
  zone,
  onUpdate,
  onDelete,
  isUpdating,
  updateError,
}: ZoneRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(zone.name);

  // When updateError becomes non-null, revert to original name and exit edit mode
  useEffect(() => {
    if (updateError) {
      setEditName(zone.name);
      setIsEditing(false);
    }
  }, [updateError, zone.name]);

  // When zone.name changes (successful update), sync local state and exit edit mode
  useEffect(() => {
    setEditName(zone.name);
    if (!isUpdating) {
      setIsEditing(false);
    }
  }, [zone.name, isUpdating]);

  function handleEditClick() {
    setEditName(zone.name);
    setIsEditing(true);
  }

  function handleCancel() {
    setEditName(zone.name);
    setIsEditing(false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = editName.trim();
    if (trimmed && trimmed !== zone.name) {
      onUpdate(zone.id, trimmed);
    } else {
      setIsEditing(false);
    }
  }

  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    backgroundColor: colors.white,
    borderRadius: borderRadius.card,
    border: `1px solid ${colors.darkGray}`,
    marginBottom: "8px",
    fontFamily,
    fontSize: fontSizes.body,
  };

  const nameStyle: CSSProperties = {
    fontWeight: 500,
    color: colors.black,
  };

  const buttonStyle: CSSProperties = {
    padding: "6px 12px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 500,
  };

  const editButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.green,
    color: colors.white,
  };

  const deleteButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.red,
    color: colors.white,
    marginLeft: "8px",
  };

  const saveButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.green,
    color: colors.white,
    opacity: isUpdating ? 0.6 : 1,
    cursor: isUpdating ? "not-allowed" : "pointer",
  };

  const cancelButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: colors.lightGray,
    color: colors.black,
    marginLeft: "8px",
  };

  const inputStyle: CSSProperties = {
    padding: "6px 10px",
    border: `1px solid ${colors.darkGray}`,
    borderRadius: "4px",
    fontFamily,
    fontSize: fontSizes.body,
    flex: 1,
    marginRight: "8px",
    opacity: isUpdating ? 0.6 : 1,
  };

  const errorStyle: CSSProperties = {
    color: colors.red,
    fontSize: fontSizes.body,
    marginTop: "4px",
    fontFamily,
  };

  const formStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    flex: 1,
  };

  if (isEditing) {
    return (
      <div>
        <div style={rowStyle}>
          <form onSubmit={handleSubmit} style={formStyle}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={inputStyle}
              disabled={isUpdating}
              aria-label="Zone name"
              autoFocus
            />
            <button
              type="submit"
              style={saveButtonStyle}
              disabled={isUpdating || !editName.trim()}
            >
              {isUpdating ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              style={cancelButtonStyle}
              disabled={isUpdating}
            >
              Cancel
            </button>
          </form>
        </div>
        {updateError && <p style={errorStyle}>{updateError}</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={rowStyle}>
        <span style={nameStyle}>{zone.name}</span>
        <div>
          <button
            type="button"
            onClick={handleEditClick}
            style={editButtonStyle}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(zone)}
            style={deleteButtonStyle}
          >
            Delete
          </button>
        </div>
      </div>
      {updateError && <p style={errorStyle}>{updateError}</p>}
    </div>
  );
}
