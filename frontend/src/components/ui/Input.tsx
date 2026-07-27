import { useId, type CSSProperties } from "react";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

interface InputProps {
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
}

export default function Input({
  label,
  type = "text",
  value,
  onChange,
  error,
  maxLength,
  disabled = false,
  placeholder,
}: InputProps) {
  const id = useId();
  const errorId = `${id}-error`;

  const wrapperStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "12px",
    width: "100%",
  };

  const labelStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    color: colors.black,
    whiteSpace: "nowrap",
    minWidth: "120px",
    textAlign: "left",
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    padding: "12px 20px",
    borderRadius: borderRadius.pill,
    border: error ? `1px solid ${colors.red}` : "1px solid transparent",
    backgroundColor: colors.darkGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    outline: "none",
    transition: "border-color 0.2s ease",
    opacity: disabled ? 0.6 : 1,
    boxSizing: "border-box",
  };

  const errorStyle: CSSProperties = {
    fontFamily,
    fontSize: "12px",
    color: colors.red,
    marginTop: "4px",
  };

  return (
    <div style={{ width: "100%", marginBottom: "16px" }}>
      <div style={wrapperStyle}>
        <label htmlFor={id} style={labelStyle}>
          {label}:
        </label>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          style={inputStyle}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      {error && (
        <p id={errorId} style={errorStyle} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
