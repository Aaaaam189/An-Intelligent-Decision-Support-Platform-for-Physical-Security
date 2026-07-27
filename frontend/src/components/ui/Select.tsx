import { useId, type CSSProperties } from "react";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export default function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
}: SelectProps) {
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

  const selectStyle: CSSProperties = {
    flex: 1,
    padding: "12px 20px",
    borderRadius: borderRadius.pill,
    border: error ? `1px solid ${colors.red}` : "1px solid transparent",
    backgroundColor: colors.darkGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: value ? colors.black : "#888",
    outline: "none",
    transition: "border-color 0.2s ease",
    opacity: disabled ? 0.6 : 1,
    boxSizing: "border-box",
    cursor: disabled ? "not-allowed" : "pointer",
    appearance: "none",
    backgroundImage:
      'url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%278%27 viewBox=%270 0 12 8%27%3E%3Cpath fill=%27%23000%27 d=%27M6 8L0 0h12z%27/%3E%3C/svg%3E")',
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 16px center",
    backgroundSize: "12px 8px",
    paddingRight: "40px",
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
        {label && (
          <label htmlFor={id} style={labelStyle}>
            {label}:
          </label>
        )}
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={selectStyle}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p id={errorId} style={errorStyle} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
