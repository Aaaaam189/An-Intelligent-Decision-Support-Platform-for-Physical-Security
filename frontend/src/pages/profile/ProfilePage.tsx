import { useState, type CSSProperties, type FormEvent } from "react";
import { useChangePassword } from "../../hooks/useProfile";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import {
  colors,
  fontFamily,
  fontFamilyHeading,
  fontSizes,
  borderRadius,
} from "../../constants/theme";

export default function ProfilePage() {
  const changePassword = useChangePassword();

  // Read user info from localStorage (stored at login)
  const fullName = localStorage.getItem("sentinel_fullName") || "—";
  const email = localStorage.getItem("sentinel_email") || "—";
  const role = localStorage.getItem("sentinel_role") || "—";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!currentPassword.trim()) errors.currentPassword = "Current password is required";
    if (!newPassword.trim()) errors.newPassword = "New password is required";
    if (!confirmPassword.trim()) errors.confirmPassword = "Confirm password is required";
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
    return errors;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setSuccessMessage(null);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    changePassword.mutate(
      {
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      },
      {
        onSuccess: () => {
          setSuccessMessage("Password changed successfully.");
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        },
        onError: (err: any) => {
          const message =
            err.response?.data?.error || err.message || "Failed to change password";
          if (
            message.toLowerCase().includes("current password") ||
            message.toLowerCase().includes("incorrect")
          ) {
            setFieldErrors({ currentPassword: message });
          } else {
            setApiError(message);
          }
        },
      }
    );
  };

  const formatRole = (r: string): string => {
    if (r === "ADMIN") return "Admin";
    if (r === "SECURITY_GUARD") return "Security Guard";
    return r;
  };

  // Styles
  const pageStyle: CSSProperties = {
    padding: "24px 32px",
    fontFamily,
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

  const sectionStyle: CSSProperties = {
    backgroundColor: colors.lightGray,
    borderRadius: borderRadius.card,
    padding: "32px",
    marginBottom: "24px",
  };

  const sectionTitleStyle: CSSProperties = {
    fontSize: fontSizes.sectionHeading,
    fontFamily: fontFamilyHeading,
    fontWeight: 600,
    color: colors.black,
    margin: "0 0 20px 0",
  };

  const infoRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
    fontFamily,
    fontSize: fontSizes.body,
  };

  const infoLabelStyle: CSSProperties = {
    fontWeight: 600,
    color: colors.black,
    minWidth: "120px",
  };

  const infoValueStyle: CSSProperties = {
    color: colors.black,
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

  const successStyle: CSSProperties = {
    padding: "12px 16px",
    backgroundColor: "#F0FFF4",
    color: colors.green,
    borderRadius: borderRadius.card,
    fontFamily,
    fontSize: fontSizes.body,
    marginBottom: "16px",
    fontWeight: 600,
  };

  const buttonsStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    marginTop: "24px",
  };

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>Profile</h1>

      {/* User Info Section */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>User Information</h2>
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Full Name:</span>
          <span style={infoValueStyle}>{fullName}</span>
        </div>
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Email:</span>
          <span style={infoValueStyle}>{email}</span>
        </div>
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}>Role:</span>
          <span style={infoValueStyle}>{formatRole(role)}</span>
        </div>
      </div>

      {/* Change Password Section */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Change Password</h2>

        {successMessage && (
          <div style={successStyle} role="status">
            {successMessage}
          </div>
        )}

        {apiError && (
          <div style={apiErrorStyle} role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(val) => {
              setCurrentPassword(val);
              if (fieldErrors.currentPassword) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.currentPassword;
                  return next;
                });
              }
              setSuccessMessage(null);
            }}
            error={fieldErrors.currentPassword}
            placeholder="Enter current password"
          />

          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(val) => {
              setNewPassword(val);
              if (fieldErrors.newPassword) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.newPassword;
                  return next;
                });
              }
              if (fieldErrors.confirmPassword && val === confirmPassword) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.confirmPassword;
                  return next;
                });
              }
              setSuccessMessage(null);
            }}
            error={fieldErrors.newPassword}
            placeholder="Enter new password"
          />

          <Input
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(val) => {
              setConfirmPassword(val);
              if (fieldErrors.confirmPassword) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.confirmPassword;
                  return next;
                });
              }
              setSuccessMessage(null);
            }}
            error={fieldErrors.confirmPassword}
            placeholder="Confirm new password"
          />

          <div style={buttonsStyle}>
            <Button
              variant="primary"
              type="submit"
              isLoading={changePassword.isPending}
              disabled={changePassword.isPending}
            >
              Change Password
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
