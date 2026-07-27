import { useState, type CSSProperties, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { forgotPassword } from "../../api/auth.api";
import { validateEmail } from "../../utils/validators";
import { colors, fontFamily, fontSizes } from "../../constants/theme";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [apiError, setApiError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (emailError) {
      setEmailError("");
    }
    if (apiError) {
      setApiError("");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Validate email
    if (!email.trim()) {
      setEmailError("Email is required");
      return;
    }

    if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    setApiError("");

    try {
      await forgotPassword({ email });
      navigate("/verify", { state: { email } });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "The request could not be completed. Please try again.";
      setApiError(message);
    } finally {
      setIsLoading(false);
    }
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

  const linkStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.green,
    textDecoration: "none",
    fontWeight: 500,
  };

  const footerStyle: CSSProperties = {
    marginTop: "20px",
    textAlign: "center",
  };

  return (
    <Card style={{ width: "100%", maxWidth: "420px" }}>
      <h1 style={titleStyle}>Forgot Password</h1>

      <form onSubmit={handleSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={handleEmailChange}
          error={emailError}
          placeholder="Enter your email"
        />

        {apiError && <p style={errorBannerStyle} role="alert">{apiError}</p>}

        <div style={{ display: "flex", justifyContent: "center", marginTop: "16px" }}>
          <Button
            variant="primary"
            type="submit"
            isLoading={isLoading}
            disabled={isLoading}
          >
            Reset Password
          </Button>
        </div>
      </form>

      <div style={footerStyle}>
        <Link to="/login" style={linkStyle}>
          Back to Login
        </Link>
      </div>
    </Card>
  );
}
