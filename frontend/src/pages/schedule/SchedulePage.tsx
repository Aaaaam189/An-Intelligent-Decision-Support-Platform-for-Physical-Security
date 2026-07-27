import { useState, type CSSProperties, type FormEvent } from "react";
import { useShifts, useMyShifts, useCreateShift, useCreateShiftBatch, useUpdateShift, useDeleteShift } from "../../hooks/useShifts";
import { useActiveUsers } from "../../hooks/useUsers";
import { useZones } from "../../hooks/useZones";
import Select from "../../components/ui/Select";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";
import type { Shift } from "../../types/shift.types";

export default function SchedulePage() {
  const role = localStorage.getItem("sentinel_role");
  const isAdmin = role === "ADMIN";

  if (isAdmin) {
    return <AdminScheduleView />;
  }

  return <GuardScheduleView />;
}

function AdminScheduleView() {
  const { shifts, isLoading, error } = useShifts();
  const { users: guards, isLoading: guardsLoading } = useActiveUsers();
  const { zones, isLoading: zonesLoading } = useZones();
  const createShiftMutation = useCreateShift();
  const createBatchMutation = useCreateShiftBatch();
  const updateShiftMutation = useUpdateShift();
  const deleteShiftMutation = useDeleteShift();

  const [showForm, setShowForm] = useState(false);
  const [zoneId, setZoneId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedGuardIds, setSelectedGuardIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit state
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editZoneId, setEditZoneId] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);

  const guardMap = new Map(guards.map((g) => [g.id, g.fullName]));
  const zoneMap = new Map(zones.map((z) => [z.id, z.name]));

  function handleGuardToggle(guardId: string) {
    setSelectedGuardIds((prev) =>
      prev.includes(guardId)
        ? prev.filter((id) => id !== guardId)
        : [...prev, guardId]
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!zoneId || !startTime || !endTime || selectedGuardIds.length === 0) {
      setFormError("Please fill all fields and select at least one guard.");
      return;
    }

    if (new Date(endTime) <= new Date(startTime)) {
      setFormError("End time must be after start time.");
      return;
    }

    if (selectedGuardIds.length === 1) {
      createShiftMutation.mutate(
        {
          guardId: selectedGuardIds[0],
          zoneId,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        },
        {
          onSuccess: () => {
            resetForm();
          },
          onError: (err) => {
            setFormError(err.message);
          },
        }
      );
    } else {
      createBatchMutation.mutate(
        {
          zoneId,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          guardIds: selectedGuardIds,
        },
        {
          onSuccess: () => {
            resetForm();
          },
          onError: (err) => {
            setFormError(err.message);
          },
        }
      );
    }
  }

  function resetForm() {
    setShowForm(false);
    setZoneId("");
    setStartTime("");
    setEndTime("");
    setSelectedGuardIds([]);
    setFormError(null);
  }

  const isSubmitting = createShiftMutation.isPending || createBatchMutation.isPending;

  function isShiftEditable(shift: Shift): boolean {
    return new Date(shift.endTime) > new Date();
  }

  function openEditModal(shift: Shift) {
    setEditZoneId(shift.zoneId);
    setEditStartTime(new Date(shift.startTime).toISOString().slice(0, 16));
    setEditEndTime(new Date(shift.endTime).toISOString().slice(0, 16));
    updateShiftMutation.reset();
    setEditingShift(shift);
  }

  function closeEditModal() {
    setEditingShift(null);
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingShift || !editZoneId || !editStartTime || !editEndTime) return;
    if (new Date(editEndTime) <= new Date(editStartTime)) return;
    updateShiftMutation.mutate(
      {
        id: editingShift.id,
        data: {
          zoneId: editZoneId,
          guardId: editingShift.guardId,
          startTime: new Date(editStartTime).toISOString(),
          endTime: new Date(editEndTime).toISOString(),
        },
      },
      { onSuccess: () => closeEditModal() }
    );
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteShiftMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  // Group shifts by date for calendar-style display
  const shiftsByDate = new Map<string, typeof shifts>();
  shifts.forEach((shift) => {
    const dateKey = new Date(shift.startTime).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    if (!shiftsByDate.has(dateKey)) {
      shiftsByDate.set(dateKey, []);
    }
    shiftsByDate.get(dateKey)!.push(shift);
  });

  const sortedDates = Array.from(shiftsByDate.keys()).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={headingStyle}>Schedule</h1>
        <button
          style={createButtonStyle}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "Create Shift"}
        </button>
      </div>

      {showForm && (
        <form style={formContainerStyle} onSubmit={handleSubmit}>
          <h2 style={formHeadingStyle}>New Shift</h2>

          <Select
            label="Zone"
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            value={zoneId}
            onChange={setZoneId}
            placeholder="Select a zone"
            disabled={zonesLoading}
          />

          <div style={fieldRowStyle}>
            <label style={fieldLabelStyle}>Start Time:</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={fieldRowStyle}>
            <label style={fieldLabelStyle}>End Time:</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <p style={fieldLabelStyle}>Select Guard(s):</p>
            {guardsLoading && <p style={loadingStyle}>Loading guards...</p>}
            <div style={guardListStyle}>
              {guards
                .filter((g) => g.role === "SECURITY_GUARD")
                .map((guard) => (
                  <label key={guard.id} style={guardCheckboxStyle}>
                    <input
                      type="checkbox"
                      checked={selectedGuardIds.includes(guard.id)}
                      onChange={() => handleGuardToggle(guard.id)}
                      style={{ marginRight: "8px" }}
                    />
                    {guard.fullName}
                  </label>
                ))}
            </div>
          </div>

          {formError && (
            <p style={errorStyle} role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            style={submitButtonStyle}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Shift"}
          </button>
        </form>
      )}

      {isLoading && <p style={loadingStyle}>Loading shifts...</p>}

      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && shifts.length === 0 && (
        <p style={loadingStyle}>No shifts scheduled yet.</p>
      )}

      {!isLoading && !error && sortedDates.length > 0 && (
        <div style={calendarContainerStyle}>
          {sortedDates.map((date) => (
            <div key={date} style={dayColumnStyle}>
              <h3 style={dayHeadingStyle}>{date}</h3>
              {shiftsByDate.get(date)!.map((shift) => (
                <div key={shift.id} style={shiftCardStyle}>
                  <p style={shiftGuardStyle}>
                    {guardMap.get(shift.guardId) || "Unknown Guard"}
                  </p>
                  <p style={shiftZoneStyle}>
                    {zoneMap.get(shift.zoneId) || "Unknown Zone"}
                  </p>
                  <p style={shiftTimeStyle}>
                    {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                  </p>
                  {isShiftEditable(shift) && (
                    <div style={shiftActionsStyle}>
                      <button
                        type="button"
                        style={shiftEditBtnStyle}
                        onClick={() => openEditModal(shift)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        style={shiftDeleteBtnStyle}
                        onClick={() => setDeleteTarget(shift)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Edit Shift Modal */}
      <Modal isOpen={!!editingShift} onClose={closeEditModal}>
        <h2 style={formHeadingStyle}>Edit Shift</h2>
        <form onSubmit={handleEditSubmit}>
          <Select
            label="Zone"
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            value={editZoneId}
            onChange={setEditZoneId}
            placeholder="Select a zone"
          />
          <div style={fieldRowStyle}>
            <label style={fieldLabelStyle}>Start Time:</label>
            <input
              type="datetime-local"
              value={editStartTime}
              onChange={(e) => setEditStartTime(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={fieldRowStyle}>
            <label style={fieldLabelStyle}>End Time:</label>
            <input
              type="datetime-local"
              value={editEndTime}
              onChange={(e) => setEditEndTime(e.target.value)}
              style={inputStyle}
            />
          </div>
          {updateShiftMutation.error && (
            <p style={errorStyle} role="alert">{updateShiftMutation.error.message}</p>
          )}
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
            <button type="button" onClick={closeEditModal} style={{ ...submitButtonStyle, backgroundColor: colors.darkGray, color: colors.black }}>
              Cancel
            </button>
            <button type="submit" style={submitButtonStyle} disabled={updateShiftMutation.isPending}>
              {updateShiftMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Shift Confirmation */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete Shift"
        message="Are you sure you want to delete this shift? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function GuardScheduleView() {
  const { shifts, isLoading, error } = useMyShifts();
  const { zones } = useZones();

  const zoneMap = new Map(zones.map((z) => [z.id, z.name]));

  // Group shifts by date for calendar-style display
  const shiftsByDate = new Map<string, typeof shifts>();
  shifts.forEach((shift) => {
    const dateKey = new Date(shift.startTime).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    if (!shiftsByDate.has(dateKey)) {
      shiftsByDate.set(dateKey, []);
    }
    shiftsByDate.get(dateKey)!.push(shift);
  });

  const sortedDates = Array.from(shiftsByDate.keys()).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  return (
    <div style={pageStyle}>
      <h1 style={headingStyle}>My Schedule</h1>

      {isLoading && <p style={loadingStyle}>Loading shifts...</p>}

      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && shifts.length === 0 && (
        <p style={loadingStyle}>No shifts assigned to you.</p>
      )}

      {!isLoading && !error && sortedDates.length > 0 && (
        <div style={calendarContainerStyle}>
          {sortedDates.map((date) => (
            <div key={date} style={dayColumnStyle}>
              <h3 style={dayHeadingStyle}>{date}</h3>
              {shiftsByDate.get(date)!.map((shift) => (
                <div key={shift.id} style={shiftCardStyle}>
                  <p style={shiftZoneStyle}>
                    {zoneMap.get(shift.zoneId) || "Unknown Zone"}
                  </p>
                  <p style={shiftTimeStyle}>
                    {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

const createButtonStyle: CSSProperties = {
  padding: "10px 24px",
  borderRadius: borderRadius.pill,
  border: "none",
  backgroundColor: colors.green,
  color: colors.white,
  fontFamily,
  fontSize: fontSizes.body,
  fontWeight: 600,
  cursor: "pointer",
};

const formContainerStyle: CSSProperties = {
  backgroundColor: colors.lightGray,
  borderRadius: borderRadius.card,
  padding: "24px",
  marginBottom: "24px",
};

const formHeadingStyle: CSSProperties = {
  fontSize: fontSizes.sectionHeading,
  fontWeight: 600,
  color: colors.black,
  fontFamily,
  marginTop: 0,
  marginBottom: "16px",
};

const fieldRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginBottom: "16px",
  width: "100%",
};

const fieldLabelStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  fontWeight: 600,
  color: colors.black,
  minWidth: "120px",
  whiteSpace: "nowrap",
};

const inputStyle: CSSProperties = {
  flex: 1,
  padding: "12px 20px",
  borderRadius: borderRadius.pill,
  border: "1px solid transparent",
  backgroundColor: colors.darkGray,
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  outline: "none",
};

const guardListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  marginTop: "8px",
};

const guardCheckboxStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  cursor: "pointer",
  padding: "6px 12px",
  borderRadius: borderRadius.pill,
  backgroundColor: colors.white,
  border: `1px solid ${colors.darkGray}`,
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
  padding: "8px 0",
};

const submitButtonStyle: CSSProperties = {
  padding: "12px 32px",
  borderRadius: borderRadius.pill,
  border: "none",
  backgroundColor: colors.green,
  color: colors.white,
  fontFamily,
  fontSize: fontSizes.body,
  fontWeight: 600,
  cursor: "pointer",
};

const calendarContainerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "16px",
};

const dayColumnStyle: CSSProperties = {
  backgroundColor: colors.lightGray,
  borderRadius: borderRadius.card,
  padding: "16px",
};

const dayHeadingStyle: CSSProperties = {
  fontSize: fontSizes.body,
  fontWeight: 600,
  color: colors.black,
  fontFamily,
  marginTop: 0,
  marginBottom: "12px",
  paddingBottom: "8px",
  borderBottom: `1px solid ${colors.darkGray}`,
};

const shiftCardStyle: CSSProperties = {
  backgroundColor: colors.white,
  borderRadius: borderRadius.card,
  padding: "12px",
  marginBottom: "8px",
};

const shiftGuardStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  fontWeight: 600,
  color: colors.black,
  margin: "0 0 4px 0",
};

const shiftZoneStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.black,
  margin: "0 0 4px 0",
};

const shiftTimeStyle: CSSProperties = {
  fontFamily,
  fontSize: "12px",
  color: "#666",
  margin: 0,
};

const shiftActionsStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  marginTop: "8px",
};

const shiftEditBtnStyle: CSSProperties = {
  padding: "4px 10px",
  fontSize: "12px",
  fontFamily,
  fontWeight: 600,
  border: "none",
  borderRadius: borderRadius.pill,
  cursor: "pointer",
  backgroundColor: colors.green,
  color: colors.white,
};

const shiftDeleteBtnStyle: CSSProperties = {
  padding: "4px 10px",
  fontSize: "12px",
  fontFamily,
  fontWeight: 600,
  border: "none",
  borderRadius: borderRadius.pill,
  cursor: "pointer",
  backgroundColor: colors.red,
  color: colors.white,
};
