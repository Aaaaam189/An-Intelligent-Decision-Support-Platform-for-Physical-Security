import { useState, type CSSProperties, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { verifyResetCode } from "../../api/auth.api";
import { validateVerificationCode } from "../../utils/validators";
import { colors, fontFamily, fontSizes } from "../../constants/theme";

export default function VerificationPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const email = (location.state as { email?: string })?.email;

  const [code, setCode] = useState("");
  const [apiError, setApiError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Redirect to /forgot-password if email not in router state
  if (!email) {
    return <Navigate to="/forgot-password" replace />;
  }

  function handleCodeChange(value: string) {
    // Only allow numeric digits, max 6 characters
    const sanitized = value.replace(/\D/g, "").slice(0, 6);
    setCode(sanitized);
    if (apiError) {
      setApiError("");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!validateVerificationCode(code)) {
      return;
    }

    setIsLoading(true);
    setApiError("");

    try {
      const response = await verifyResetCode({ email: email!, code });
      navigate("/reset-password", { state: { resetToken: response.resetToken } });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "The code is invalid or expired. Please try again.";
      setApiError(message);
    } finally {
      setIsLoading(false);
    }
  }

  const isValid = validateVerificationCode(code);

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
      <h1 style={titleStyle}>Verification</h1>

      <form onSubmit={handleSubmit} noValidate>
        <Input
          label="Verification Code"
          type="text"
          value={code}
          onChange={handleCodeChange}
          placeholder="Enter 6-digit code"
          maxLength={6}
        />

        {apiError && <p style={errorBannerStyle} role="alert">{apiError}</p>}

        <div style={{ display: "flex", justifyContent: "center", marginTop: "16px" }}>
          <Button
            variant="primary"
            type="submit"
            isLoading={isLoading}
            disabled={!isValid || isLoading}
          >
            Verify
          </Button>
        </div>
      </form>
    </Card>
  );
}
