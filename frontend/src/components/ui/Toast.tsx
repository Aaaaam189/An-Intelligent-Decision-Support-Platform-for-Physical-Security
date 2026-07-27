import { useEffect, useState, type CSSProperties } from "react";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  duration?: number;
  onDismiss: () => void;
}

export default function Toast({
  message,
  type = "info",
  duration = 5000,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  if (!visible) return null;

  const backgroundColor = type === "error" ? colors.red : type === "success" ? colors.green : colors.black;

  const style: CSSProperties = {
    position: "fixed",
    top: "24px",
    right: "24px",
    backgroundColor,
    color: colors.white,
    padding: "12px 24px",
    borderRadius: borderRadius.card,
    fontFamily,
    fontSize: fontSizes.body,
    zIndex: 2000,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    maxWidth: "400px",
    wordBreak: "break-word",
  };

  return (
    <div style={style} role="alert" aria-live="polite">
      {message}
    </div>
  );
}
