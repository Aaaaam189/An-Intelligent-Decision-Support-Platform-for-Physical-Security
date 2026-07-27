import type { CSSProperties, ReactNode } from "react";
import { colors, fontFamily, borderRadius } from "../../constants/theme";
import Spinner from "./Spinner";

interface ButtonProps {
  variant: "primary" | "destructive" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}

const sizeStyles: Record<string, CSSProperties> = {
  sm: { padding: "6px 16px", fontSize: "12px" },
  md: { padding: "10px 24px", fontSize: "14px" },
  lg: { padding: "14px 32px", fontSize: "16px" },
};

function getVariantStyles(variant: ButtonProps["variant"]): CSSProperties {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: colors.green,
        color: colors.white,
        border: "none",
      };
    case "destructive":
      return {
        backgroundColor: "transparent",
        color: colors.red,
        border: "none",
      };
    case "ghost":
      return {
        backgroundColor: "transparent",
        color: colors.black,
        border: "none",
      };
  }
}

export default function Button({
  variant,
  size = "md",
  isLoading = false,
  disabled = false,
  children,
  onClick,
  type = "button",
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  const style: CSSProperties = {
    ...sizeStyles[size],
    ...getVariantStyles(variant),
    borderRadius: borderRadius.pill,
    fontFamily,
    fontWeight: 600,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.6 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "opacity 0.2s ease",
    minWidth: "80px",
  };

  return (
    <button
      type={type}
      style={style}
      disabled={isDisabled}
      onClick={onClick}
      aria-busy={isLoading}
    >
      {isLoading && <Spinner size={16} />}
      {children}
    </button>
  );
}
