import { useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateUser } from "../../hooks/useUsers";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import {
  colors,
  fontFamily,
  fontFamilyHeading,
  fontSizes,
  borderRadius,
} from "../../constants/theme";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "SECURITY_GUARD", label: "Security Guard" },
];

export default function CreateUserPage() {
  const navigate = useNavigate();
  const createUser = useCreateUser();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = "Full name is required";
    if (!email.trim()) errors.email = "Email is required";
    if (!password.trim()) errors.password = "Password is required";
    if (!role) errors.role = "Role is required";
    return errors;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    createUser.mutate(
      {
        fullName: fullName.trim(),
        email: email.trim(),
        password: password.trim(),
        role: role as "ADMIN" | "SECURITY_GUARD",
      },
      {
        onSuccess: () => {
          navigate("/users");
        },
        onError: (err: any) => {
          // Handle per-field validation errors from API
          if (err.response?.data?.errors) {
            const apiFieldErrors: Record<string, string> = {};
            const errorsData = err.response.data.errors;
            if (errorsData.fullName) apiFieldErrors.fullName = errorsData.fullName;
            if (errorsData.email) apiFieldErrors.email = errorsData.email;
            if (errorsData.password) apiFieldErrors.password = errorsData.password;
            if (errorsData.role) apiFieldErrors.role = errorsData.role;
            if (Object.keys(apiFieldErrors).length > 0) {
              setFieldErrors(apiFieldErrors);
              return;
            }
          }
          // Handle email already in use
          if (err.response?.data?.error?.includes("email")) {
            setFieldErrors({ email: err.response.data.error });
            return;
          }
          setApiError(
            err.response?.data?.error ||
              err.message ||
              "Failed to create user"
          );
        },
      }
    );
  };

  const handleCancel = () => {
    navigate("/users");
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

  const backButtonStyle: CSSProperties = {
    background: "none",
    border: "none",
    color: colors.green,
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    cursor: "pointer",
    padding: "0",
    marginBottom: "16px",
  };

  return (
    <div style={pageStyle}>
      <button
        type="button"
        onClick={() => navigate("/users")}
        style={backButtonStyle}
      >
        ← Back to Users
      </button>
      <h1 style={titleStyle}>Create User</h1>

      <div style={formFrameStyle}>
        <form onSubmit={handleSubmit} noValidate>
          <Input
            label="Full Name"
            value={fullName}
            onChange={(val) => {
              setFullName(val);
              if (fieldErrors.fullName) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.fullName;
                  return next;
                });
              }
            }}
            maxLength={100}
            error={fieldErrors.fullName}
            placeholder="Enter full name"
          />

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(val) => {
              setEmail(val);
              if (fieldErrors.email) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.email;
                  return next;
                });
              }
            }}
            maxLength={200}
            error={fieldErrors.email}
            placeholder="Enter email address"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(val) => {
              setPassword(val);
              if (fieldErrors.password) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.password;
                  return next;
                });
              }
            }}
            maxLength={100}
            error={fieldErrors.password}
            placeholder="Enter password"
          />

          <Select
            label="Role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(val) => {
              setRole(val);
              if (fieldErrors.role) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.role;
                  return next;
                });
              }
            }}
            placeholder="Select a role"
            error={fieldErrors.role}
          />

          {apiError && (
            <div style={apiErrorStyle} role="alert">
              {apiError}
            </div>
          )}

          <div style={buttonsStyle}>
            <Button
              variant="primary"
              type="submit"
              isLoading={createUser.isPending}
              disabled={createUser.isPending}
            >
              Create User
            </Button>
            <Button variant="destructive" type="button" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
