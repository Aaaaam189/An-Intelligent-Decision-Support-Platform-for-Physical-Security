import { useState, type CSSProperties } from "react";
import {
  useRules,
  useCreateRule,
  useUpdateRule,
  useSetRuleEnabled,
  useDeleteRule,
} from "../../hooks/useRules";
import { useZones } from "../../hooks/useZones";
import type {
  Rule,
  RulePriority,
  DetectionType,
  WeaponClass,
  ZoneScope,
  CreateRuleRequest,
  UpdateRuleRequest,
} from "../../types/rule.types";
import {
  INCIDENT_TYPE_OPTIONS,
  type IncidentType,
} from "../../types/incident.types";
import StatusBadge from "../../components/ui/StatusBadge";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import { PRIORITY_COLORS } from "../../constants/priority";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

const DETECTION_OPTIONS = [
  { value: "PERSON_DETECTED", label: "Person detected" },
  { value: "WEAPON_DETECTED", label: "Weapon detected" },
  { value: "VEHICLE_DETECTED", label: "Vehicle detected" },
];

const WEAPON_CLASS_OPTIONS = [
  { value: "any", label: "Any weapon" },
  { value: "gun", label: "Gun" },
  { value: "rifle", label: "Rifle" },
  { value: "knife", label: "Knife" },
];

const ZONE_SCOPE_OPTIONS = [
  { value: "ALL", label: "All zones" },
  { value: "SET", label: "Specific zones" },
];

// Incident type dropdown options, derived from the shared Fixed_Incident_Type_Set
// so they stay in sync with the IncidentType union. A human-readable label is
// produced from each member value.
const INCIDENT_TYPE_SELECT_OPTIONS = INCIDENT_TYPE_OPTIONS.map((value) => ({
  value,
  label: value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" "),
}));

const DETECTION_LABELS: Record<DetectionType, string> = {
  PERSON_DETECTED: "Person",
  WEAPON_DETECTED: "Weapon",
  VEHICLE_DETECTED: "Vehicle",
};

// --- time-window helpers: minutes-since-midnight <-> "HH:MM" ---

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

// Shared editable form state for both create and edit.
interface RuleFormState {
  name: string;
  detectionType: DetectionType;
  weaponClass: WeaponClass;
  zoneScope: ZoneScope;
  targetZones: string[];
  windowStart: string; // "HH:MM"
  windowEnd: string; // "HH:MM"
  alwaysTrigger: boolean;
  priority: string;
  incidentType: string;
}

const EMPTY_FORM: RuleFormState = {
  name: "",
  detectionType: "PERSON_DETECTED",
  weaponClass: "any",
  zoneScope: "ALL",
  targetZones: [],
  windowStart: "00:00",
  windowEnd: "23:59",
  alwaysTrigger: false,
  priority: "",
  incidentType: "",
};

export default function RulesPage() {
  const { rules, isLoading, error } = useRules();
  const { zones } = useZones();
  const createMutation = useCreateRule();
  const updateMutation = useUpdateRule();
  const setEnabledMutation = useSetRuleEnabled();
  const deleteMutation = useDeleteRule();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const [createForm, setCreateForm] = useState<RuleFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<RuleFormState>(EMPTY_FORM);

  const zoneNameById = new Map(zones.map((z) => [z.id, z.name]));

  function openCreateModal() {
    setCreateForm(EMPTY_FORM);
    createMutation.reset();
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    setShowCreateModal(false);
  }

  // Build the request payload from form state, omitting weapon/always-trigger
  // fields when they don't apply so the backend cross-field validation passes.
  function buildCreatePayload(form: RuleFormState): CreateRuleRequest | null {
    if (!form.name.trim() || !form.priority) return null;
    // Incident type is required for every detection type.
    if (!form.incidentType) return null;
    if (form.zoneScope === "SET" && form.targetZones.length === 0) return null;

    const isWeapon = form.detectionType === "WEAPON_DETECTED";
    return {
      name: form.name.trim(),
      detectionType: form.detectionType,
      weaponClass: isWeapon ? form.weaponClass : undefined,
      zoneScope: form.zoneScope,
      targetZones: form.zoneScope === "SET" ? form.targetZones : undefined,
      windowStartMin: timeToMinutes(form.windowStart),
      windowEndMin: timeToMinutes(form.windowEnd),
      alwaysTrigger: isWeapon ? form.alwaysTrigger : false,
      resultingPriority: form.priority as RulePriority,
      incidentType: form.incidentType as IncidentType,
    };
  }

  function handleCreate() {
    const data = buildCreatePayload(createForm);
    if (!data) return;
    createMutation.mutate(data, {
      onSuccess: () => closeCreateModal(),
    });
  }

  function openEditModal(rule: Rule) {
    setEditForm({
      name: rule.name,
      detectionType: rule.detectionType,
      weaponClass: rule.weaponClass ?? "any",
      zoneScope: rule.zoneScope,
      targetZones: rule.targetZones ?? [],
      windowStart: minutesToTime(rule.windowStartMin),
      windowEnd: minutesToTime(rule.windowEndMin),
      alwaysTrigger: rule.alwaysTrigger,
      priority: rule.resultingPriority,
      incidentType: rule.incidentType,
    });
    updateMutation.reset();
    setEditingRule(rule);
  }

  function closeEditModal() {
    setEditingRule(null);
  }

  function handleUpdate() {
    if (!editingRule) return;
    const payload = buildCreatePayload(editForm);
    if (!payload) return;
    const data: UpdateRuleRequest = payload;
    updateMutation.mutate(
      { id: editingRule.id, data },
      { onSuccess: () => closeEditModal() }
    );
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // Human-readable summary of a rule's conditions for the table.
  function describeRule(rule: Rule): string {
    const parts: string[] = [DETECTION_LABELS[rule.detectionType]];
    if (rule.detectionType === "WEAPON_DETECTED" && rule.weaponClass) {
      parts[0] = `${rule.weaponClass === "any" ? "Any" : rule.weaponClass} weapon`;
    }
    if (rule.zoneScope === "SET") {
      const names = rule.targetZones
        .map((id) => zoneNameById.get(id) ?? "?")
        .join(", ");
      parts.push(`in ${names || "selected zones"}`);
    } else {
      parts.push("in all zones");
    }
    if (rule.alwaysTrigger) {
      parts.push("(always)");
    } else {
      parts.push(
        `between ${minutesToTime(rule.windowStartMin)} and ${minutesToTime(rule.windowEndMin)}`
      );
    }
    return parts.join(" ");
  }

  // Styles
  const pageStyle: CSSProperties = { padding: "32px", fontFamily };
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
  const addButtonStyle: CSSProperties = {
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
  const actionButtonStyle: CSSProperties = {
    padding: "6px 14px",
    fontSize: fontSizes.body,
    fontFamily,
    fontWeight: 600,
    border: "none",
    borderRadius: borderRadius.pill,
    cursor: "pointer",
    marginRight: "8px",
  };
  const editButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    backgroundColor: colors.darkGray,
    color: colors.black,
  };
  const deleteButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    backgroundColor: colors.red,
    color: colors.white,
  };
  const modalTitleStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.sectionHeading,
    fontWeight: 600,
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
  const submitButtonStyle: CSSProperties = {
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
  const fieldRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    marginBottom: "16px",
  };
  const fieldLabelStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    color: colors.black,
    whiteSpace: "nowrap",
    minWidth: "120px",
    textAlign: "left",
  };
  const timeInputStyle: CSSProperties = {
    flex: 1,
    padding: "12px 20px",
    borderRadius: borderRadius.pill,
    border: "1px solid transparent",
    backgroundColor: colors.darkGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    outline: "none",
    boxSizing: "border-box",
  };
  const zoneListStyle: CSSProperties = {
    flex: 1,
    maxHeight: "140px",
    overflowY: "auto",
    border: `1px solid ${colors.darkGray}`,
    borderRadius: borderRadius.pill,
    padding: "10px 16px",
    boxSizing: "border-box",
  };
  const checkboxRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 0",
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
  };

  // Renders the shared condition fields for a given form state + setter.
  function renderFormFields(
    form: RuleFormState,
    setForm: (updater: (prev: RuleFormState) => RuleFormState) => void
  ) {
    const isWeapon = form.detectionType === "WEAPON_DETECTED";
    return (
      <>
        <Input
          label="Name"
          value={form.name}
          onChange={(v) => setForm((p) => ({ ...p, name: v }))}
          placeholder="Rule name"
        />

        <Select
          label="Detect"
          options={DETECTION_OPTIONS}
          value={form.detectionType}
          onChange={(v) =>
            setForm((p) => ({ ...p, detectionType: v as DetectionType }))
          }
        />

        {isWeapon && (
          <Select
            label="Weapon type"
            options={WEAPON_CLASS_OPTIONS}
            value={form.weaponClass}
            onChange={(v) =>
              setForm((p) => ({ ...p, weaponClass: v as WeaponClass }))
            }
          />
        )}

        <Select
          label="Zones"
          options={ZONE_SCOPE_OPTIONS}
          value={form.zoneScope}
          onChange={(v) =>
            setForm((p) => ({ ...p, zoneScope: v as ZoneScope }))
          }
        />

        {form.zoneScope === "SET" && (
          <div style={fieldRowStyle}>
            <span style={fieldLabelStyle}>Select zones:</span>
            <div style={zoneListStyle}>
              {zones.length === 0 && (
                <p style={{ margin: 0, color: "#888" }}>No zones available</p>
              )}
              {zones.map((zone) => {
                const checked = form.targetZones.includes(zone.id);
                return (
                  <label key={zone.id} style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setForm((p) => ({
                          ...p,
                          targetZones: checked
                            ? p.targetZones.filter((id) => id !== zone.id)
                            : [...p.targetZones, zone.id],
                        }))
                      }
                    />
                    {zone.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {!form.alwaysTrigger && (
          <>
            <div style={fieldRowStyle}>
              <label style={fieldLabelStyle}>Active from:</label>
              <input
                type="time"
                value={form.windowStart}
                onChange={(e) =>
                  setForm((p) => ({ ...p, windowStart: e.target.value }))
                }
                style={timeInputStyle}
                aria-label="Active from"
              />
            </div>
            <div style={fieldRowStyle}>
              <label style={fieldLabelStyle}>Active until:</label>
              <input
                type="time"
                value={form.windowEnd}
                onChange={(e) =>
                  setForm((p) => ({ ...p, windowEnd: e.target.value }))
                }
                style={timeInputStyle}
                aria-label="Active until"
              />
            </div>
          </>
        )}

        {isWeapon && (
          <label style={{ ...checkboxRowStyle, marginBottom: "16px" }}>
            <input
              type="checkbox"
              checked={form.alwaysTrigger}
              onChange={(e) =>
                setForm((p) => ({ ...p, alwaysTrigger: e.target.checked }))
              }
            />
            Always trigger (ignore time window)
          </label>
        )}

        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={form.priority}
          onChange={(v) => setForm((p) => ({ ...p, priority: v }))}
          placeholder="Select priority"
        />

        <Select
          label="Incident type"
          options={INCIDENT_TYPE_SELECT_OPTIONS}
          value={form.incidentType}
          onChange={(v) => setForm((p) => ({ ...p, incidentType: v }))}
          placeholder="Select incident type"
          error={form.incidentType ? undefined : "Incident type is required"}
        />
      </>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={headingStyle}>Rules</h1>
        <button style={addButtonStyle} onClick={openCreateModal} type="button">
          Add Rule
        </button>
      </div>

      {isLoading && <p style={loadingStyle}>Loading rules...</p>}

      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Condition</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Enabled</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td style={tdStyle}>{rule.name}</td>
                <td style={tdStyle}>{describeRule(rule)}</td>
                <td style={tdStyle}>
                  <StatusBadge
                    value={rule.resultingPriority}
                    colorMap={PRIORITY_COLORS}
                  />
                </td>
                <td style={tdStyle}>{rule.enabled ? "Yes" : "No"}</td>
                <td style={tdStyle}>{formatDate(rule.createdAt)}</td>
                <td style={tdStyle}>
                  <button
                    style={editButtonStyle}
                    onClick={() =>
                      setEnabledMutation.mutate({
                        id: rule.id,
                        enabled: !rule.enabled,
                      })
                    }
                    type="button"
                    disabled={setEnabledMutation.isPending}
                  >
                    {rule.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    style={editButtonStyle}
                    onClick={() => openEditModal(rule)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    style={deleteButtonStyle}
                    onClick={() => setDeleteTarget(rule)}
                    type="button"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create Rule Modal */}
      <Modal isOpen={showCreateModal} onClose={closeCreateModal}>
        <h2 style={modalTitleStyle}>Create Rule</h2>
        {renderFormFields(createForm, setCreateForm)}
        {createMutation.error && (
          <p style={formErrorStyle} role="alert">
            {createMutation.error.message}
          </p>
        )}
        <div style={modalActionsStyle}>
          <button style={cancelButtonStyle} onClick={closeCreateModal} type="button">
            Cancel
          </button>
          <button
            style={submitButtonStyle}
            onClick={handleCreate}
            type="button"
            disabled={createMutation.isPending || !buildCreatePayload(createForm)}
          >
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </Modal>

      {/* Edit Rule Modal */}
      <Modal isOpen={!!editingRule} onClose={closeEditModal}>
        <h2 style={modalTitleStyle}>Edit Rule</h2>
        {renderFormFields(editForm, setEditForm)}
        {updateMutation.error && (
          <p style={formErrorStyle} role="alert">
            {updateMutation.error.message}
          </p>
        )}
        <div style={modalActionsStyle}>
          <button style={cancelButtonStyle} onClick={closeEditModal} type="button">
            Cancel
          </button>
          <button
            style={submitButtonStyle}
            onClick={handleUpdate}
            type="button"
            disabled={updateMutation.isPending || !buildCreatePayload(editForm)}
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Rule"
        message={`Are you sure you want to delete the rule "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
