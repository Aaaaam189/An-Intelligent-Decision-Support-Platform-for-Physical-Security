import { useState, useEffect, type CSSProperties, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { resetPassword } from "../../api/auth.api";
import { validatePasswordPair } from "../../utils/validators";
import { colors, fontFamily, fontSizes } from "../../constants/theme";

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const resetToken = (location.state as { resetToken?: string })?.resetToken;

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [apiError, setApiError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Redirect to /forgot-password if resetToken is not in router state
  useEffect(() => {
    if (!resetToken) {
      navigate("/forgot-password", { replace: true });
    }
  }, [resetToken, navigate]);

  function handleNewPasswordChange(value: string) {
    setNewPassword(value);
    if (passwordError) setPasswordError("");
    if (apiError) setApiError("");
  }

  function handleConfirmPasswordChange(value: string) {
    setConfirmPassword(value);
    if (confirmError) setConfirmError("");
    if (apiError) setApiError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Validate password pair
    const validation = validatePasswordPair(newPassword, confirmPassword);

    if (!validation.valid) {
      if (validation.error === "password_length") {
        setPasswordError("Password must be between 8 and 128 characters");
        return;
      }
      if (validation.error === "passwords_do_not_match") {
        setConfirmError("Passwords do not match");
        return;
      }
    }

    if (!resetToken) return;

    setIsLoading(true);
    setApiError("");

    try {
      await resetPassword({ resetToken, newPassword });
      navigate("/login", { state: { resetSuccess: true } });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to reset password. Please try again.";
      setApiError(message);
    } finally {
      setIsLoading(false);
    }
  }

  // Don't render the form if there's no token (redirect will happen)
  if (!resetToken) {
    return null;
  }

  const titleStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.pageHeading,
    fontWeight: 600,
    color: colors.black,
    margin: "0 0 24px 0",
    textAlign: "center",
  };

  const errorBannerStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.red,
    backgroundColor: "rgba(255, 59, 48, 0.08)",
    padding: "10px 16px",
    borderRadius: "8px",
    marginBottom: "16px",
    textAlign: "center",
  };

  return (
    <Card style={{ width: "100%", maxWidth: "420px" }}>
      <h1 style={titleStyle}>Reset Password</h1>

      <form onSubmit={handleSubmit} noValidate>
        <Input
          label="New Password"
          type="password"
          value={newPassword}
          onChange={handleNewPasswordChange}
          error={passwordError}
          placeholder="Enter new password"
        />

        <Input
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          error={confirmError}
          placeholder="Confirm new password"
        />

        {apiError && <p style={errorBannerStyle} role="alert">{apiError}</p>}

        <Button
          variant="primary"
          type="submit"
          isLoading={isLoading}
          disabled={isLoading}
        >
          Reset Password
        </Button>
      </form>
    </Card>
  );
}
