import { useState, type CSSProperties } from "react";
import {
  useRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
} from "../../hooks/useRules";
import type {
  Rule,
  RulePriority,
  CreateRuleRequest,
  UpdateRuleRequest,
} from "../../types/rule.types";
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

export default function RulesPage() {
  const { rules, isLoading, error } = useRules();
  const createMutation = useCreateRule();
  const updateMutation = useUpdateRule();
  const deleteMutation = useDeleteRule();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createCondition, setCreateCondition] = useState("");
  const [createPriority, setCreatePriority] = useState<string>("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [editPriority, setEditPriority] = useState<string>("");

  function openCreateModal() {
    setCreateName("");
    setCreateCondition("");
    setCreatePriority("");
    createMutation.reset();
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    setShowCreateModal(false);
  }

  function handleCreate() {
    if (!createName.trim() || !createCondition.trim() || !createPriority) return;
    const data: CreateRuleRequest = {
      name: createName.trim(),
      condition: createCondition.trim(),
      resultingPriority: createPriority as RulePriority,
    };
    createMutation.mutate(data, {
      onSuccess: () => {
        closeCreateModal();
      },
    });
  }

  function openEditModal(rule: Rule) {
    setEditName(rule.name);
    setEditCondition(rule.condition);
    setEditPriority(rule.resultingPriority);
    updateMutation.reset();
    setEditingRule(rule);
  }

  function closeEditModal() {
    setEditingRule(null);
  }

  function handleUpdate() {
    if (!editingRule) return;
    if (!editName.trim() || !editCondition.trim() || !editPriority) return;
    const data: UpdateRuleRequest = {
      name: editName.trim(),
      condition: editCondition.trim(),
      resultingPriority: editPriority as RulePriority,
    };
    updateMutation.mutate(
      { id: editingRule.id, data },
      {
        onSuccess: () => {
          closeEditModal();
        },
      }
    );
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
      },
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

  // Styles
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
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td style={tdStyle}>{rule.name}</td>
                <td style={tdStyle}>{rule.condition}</td>
                <td style={tdStyle}>
                  <StatusBadge
                    value={rule.resultingPriority}
                    colorMap={PRIORITY_COLORS}
                  />
                </td>
                <td style={tdStyle}>{formatDate(rule.createdAt)}</td>
                <td style={tdStyle}>
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
        <Input
          label="Name"
          value={createName}
          onChange={setCreateName}
          placeholder="Rule name"
        />
        <Input
          label="Condition"
          value={createCondition}
          onChange={setCreateCondition}
          placeholder="e.g. motion_detected && zone == 'restricted'"
        />
        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={createPriority}
          onChange={setCreatePriority}
          placeholder="Select priority"
        />
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
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </Modal>

      {/* Edit Rule Modal */}
      <Modal isOpen={!!editingRule} onClose={closeEditModal}>
        <h2 style={modalTitleStyle}>Edit Rule</h2>
        <Input
          label="Name"
          value={editName}
          onChange={setEditName}
          placeholder="Rule name"
        />
        <Input
          label="Condition"
          value={editCondition}
          onChange={setEditCondition}
          placeholder="e.g. motion_detected && zone == 'restricted'"
        />
        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={editPriority}
          onChange={setEditPriority}
          placeholder="Select priority"
        />
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
            disabled={updateMutation.isPending}
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
