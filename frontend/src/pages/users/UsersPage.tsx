import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  useActiveUsers,
  useInactiveUsers,
  useDeactivateUser,
  useReactivateUser,
  useUpdateUser,
} from "../../hooks/useUsers";
import Tabs from "../../components/ui/Tabs";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import Input from "../../components/ui/Input";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";
import type { User, UpdateUserRequest } from "../../types/user.types";

const TABS = [
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

export default function UsersPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("active");

  // Confirm dialog state
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [confirmAction, setConfirmAction] = useState<"deactivate" | "reactivate" | null>(null);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Hooks
  const {
    users: activeUsers,
    isLoading: activeLoading,
    error: activeError,
  } = useActiveUsers();
  const {
    users: inactiveUsers,
    isLoading: inactiveLoading,
    error: inactiveError,
  } = useInactiveUsers();

  const deactivateMutation = useDeactivateUser();
  const reactivateMutation = useReactivateUser();
  const updateMutation = useUpdateUser();

  const users = activeTab === "active" ? activeUsers : inactiveUsers;
  const isLoading = activeTab === "active" ? activeLoading : inactiveLoading;
  const error = activeTab === "active" ? activeError : inactiveError;

  function handleDeactivateClick(user: User) {
    setConfirmUser(user);
    setConfirmAction("deactivate");
  }

  function handleReactivateClick(user: User) {
    setConfirmUser(user);
    setConfirmAction("reactivate");
  }

  function handleConfirm() {
    if (!confirmUser || !confirmAction) return;

    if (confirmAction === "deactivate") {
      deactivateMutation.mutate(confirmUser.id);
    } else {
      reactivateMutation.mutate(confirmUser.id);
    }

    setConfirmUser(null);
    setConfirmAction(null);
  }

  function handleCancelConfirm() {
    setConfirmUser(null);
    setConfirmAction(null);
  }

  function openEditModal(user: User) {
    setEditFullName(user.fullName);
    setEditEmail(user.email);
    updateMutation.reset();
    setEditingUser(user);
  }

  function closeEditModal() {
    setEditingUser(null);
  }

  function handleUpdate() {
    if (!editingUser) return;
    if (!editFullName.trim() || !editEmail.trim()) return;
    const data: UpdateUserRequest = {
      fullName: editFullName.trim(),
      email: editEmail.trim(),
    };
    updateMutation.mutate(
      { id: editingUser.id, data },
      {
        onSuccess: () => {
          closeEditModal();
        },
      }
    );
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
    margin: 0,
    fontFamily,
  };

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
    whiteSpace: "nowrap",
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

  const tableCellStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    padding: "12px 16px",
    borderBottom: `1px solid ${colors.lightGray}`,
  };

  const actionButtonStyle: CSSProperties = {
    padding: "6px 14px",
    borderRadius: borderRadius.pill,
    border: `1px solid ${colors.darkGray}`,
    backgroundColor: "transparent",
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 500,
    cursor: "pointer",
    marginRight: "8px",
  };

  const editButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    color: colors.green,
    borderColor: colors.green,
  };

  const deactivateButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    color: colors.red,
    borderColor: colors.red,
  };

  const reactivateButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    color: colors.green,
    borderColor: colors.green,
  };

  const statusBadgeStyle = (isActive: boolean): CSSProperties => ({
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: borderRadius.pill,
    fontSize: "12px",
    fontFamily,
    fontWeight: 600,
    backgroundColor: isActive ? "#E6F9F0" : "#FFF0F0",
    color: isActive ? colors.green : colors.red,
  });

  const roleLabelStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
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
        <h1 style={headingStyle}>Users</h1>
        <button
          type="button"
          style={addButtonStyle}
          onClick={() => navigate("/users/create")}
        >
          + Add User
        </button>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {isLoading && <p style={loadingStyle}>Loading users...</p>}

      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Full Name</th>
              <th style={tableHeaderStyle}>Email</th>
              <th style={tableHeaderStyle}>Role</th>
              <th style={tableHeaderStyle}>Status</th>
              <th style={tableHeaderStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td style={tableCellStyle}>{user.fullName}</td>
                <td style={tableCellStyle}>{user.email}</td>
                <td style={tableCellStyle}>
                  <span style={roleLabelStyle}>
                    {user.role === "ADMIN" ? "Admin" : "Security Guard"}
                  </span>
                </td>
                <td style={tableCellStyle}>
                  <span style={statusBadgeStyle(user.isActive)}>
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={tableCellStyle}>
                  {user.role !== "ADMIN" && (
                    <>
                      <button
                        type="button"
                        style={editButtonStyle}
                        onClick={() => openEditModal(user)}
                      >
                        Edit
                      </button>
                      {user.isActive ? (
                        <button
                          type="button"
                          style={deactivateButtonStyle}
                          onClick={() => handleDeactivateClick(user)}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={reactivateButtonStyle}
                          onClick={() => handleReactivateClick(user)}
                        >
                          Reactivate
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        isOpen={confirmUser !== null}
        title={confirmAction === "deactivate" ? "Deactivate User" : "Reactivate User"}
        message={
          confirmAction === "deactivate"
            ? `Are you sure you want to deactivate ${confirmUser?.fullName}? They will no longer be able to access the platform.`
            : `Are you sure you want to reactivate ${confirmUser?.fullName}? They will regain access to the platform.`
        }
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />

      {/* Edit User Modal */}
      <Modal isOpen={!!editingUser} onClose={closeEditModal}>
        <h2 style={modalTitleStyle}>Edit User</h2>
        <Input
          label="Full Name"
          value={editFullName}
          onChange={setEditFullName}
          placeholder="Full name"
        />
        <Input
          label="Email"
          type="email"
          value={editEmail}
          onChange={setEditEmail}
          placeholder="Email address"
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
    </div>
  );
}
