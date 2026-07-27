import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { colors, borderRadius } from "../../constants/theme";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ isOpen, onClose, children }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  if (!isOpen) return null;

  const backdropStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const contentStyle: CSSProperties = {
    backgroundColor: colors.white,
    borderRadius: borderRadius.card,
    padding: "32px",
    maxWidth: "480px",
    width: "90%",
    maxHeight: "90vh",
    overflow: "auto",
  };

  return (
    <div
      style={backdropStyle}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div ref={contentRef} style={contentStyle}>
        {children}
      </div>
    </div>
  );
}
