import { useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useLogin } from "../../hooks/useAuth";
import { validateEmail } from "../../utils/validators";
import { colors, fontFamily, fontFamilyHeading, fontSizes, borderRadius } from "../../constants/theme";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error: apiError } = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setPasswordError("");

    let hasError = false;

    if (!email.trim()) {
      setEmailError("Email is required");
      hasError = true;
    } else if (!validateEmail(email)) {
      setEmailError("Invalid email format");
      hasError = true;
    }

    if (!password.trim()) {
      setPasswordError("Password is required");
      hasError = true;
    }

    if (hasError) return;

    try {
      await login({ email, password });
      navigate("/dashboard");
    } catch {
      // Error handled by useLogin hook
    }
  };

  return (
    <div style={containerStyle}>
      {/* Left panel - camera image, edge to edge */}
      <div style={leftPanelStyle}>
        <span style={brandingStyle}>SentinelAI</span>
        <img
          src="/images/cctv-camera-on-a-transparent-background-free-png.webp"
          alt="CCTV Camera"
          style={cameraImageStyle}
        />
      </div>

      {/* Right panel - login form with frame */}
      <div style={rightPanelStyle}>
        <div style={formWrapperStyle}>
          {/* Welcome heading - ABOVE the frame */}
          <h1 style={welcomeHeadingStyle}>Welcome</h1>

          {/* Frame contains only the form inputs */}
          <div style={formFrameStyle}>
            <form onSubmit={handleSubmit} style={formStyle} noValidate>
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(val) => {
                  setEmail(val);
                  if (emailError) setEmailError("");
                }}
                error={emailError}
                placeholder="Enter your email"
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(val) => {
                  setPassword(val);
                  if (passwordError) setPasswordError("");
                }}
                error={passwordError}
                placeholder="Enter your password"
              />

              <div style={forgotPasswordContainerStyle}>
                <Link to="/forgot-password" style={forgotPasswordLinkStyle}>
                  Forgot Password?
                </Link>
              </div>

              {apiError && (
                <p style={apiErrorStyle} role="alert">
                  {apiError}
                </p>
              )}

              <Button
                variant="primary"
                type="submit"
                isLoading={isLoading}
                disabled={isLoading}
              >
                Sign in
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Styles ---

const containerStyle: CSSProperties = {
  display: "flex",
  minHeight: "100vh",
  width: "100%",
  fontFamily,
};

const leftPanelStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  backgroundColor: colors.white,
  overflow: "hidden",
  position: "relative",
};

const brandingStyle: CSSProperties = {
  fontFamily: fontFamilyHeading,
  fontSize: "28px",
  fontWeight: 700,
  color: colors.green,
  position: "absolute",
  top: "32px",
  left: "32px",
};

const cameraImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "right center",
  transform: "scaleX(-1) rotate(5deg) translateX(15%)",
};

const rightPanelStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.white,
  padding: "40px",
};

const formWrapperStyle: CSSProperties = {
  width: "100%",
  maxWidth: "420px",
};

const formFrameStyle: CSSProperties = {
  backgroundColor: colors.lightGray,
  borderRadius: borderRadius.card,
  padding: "40px 32px",
};

const welcomeHeadingStyle: CSSProperties = {
  fontFamily: fontFamilyHeading,
  fontSize: "32px",
  fontWeight: 700,
  color: colors.black,
  marginBottom: "24px",
  marginTop: 0,
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
};

const forgotPasswordContainerStyle: CSSProperties = {
  textAlign: "center",
  marginBottom: "24px",
  marginTop: "-8px",
};

const forgotPasswordLinkStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.green,
  textDecoration: "none",
  fontWeight: 500,
};

const apiErrorStyle: CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.red,
  marginBottom: "16px",
  padding: "8px 12px",
  backgroundColor: "#FFF0F0",
  borderRadius: "8px",
  margin: "0 0 16px 0",
};
