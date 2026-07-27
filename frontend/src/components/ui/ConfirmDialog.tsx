import type { CSSProperties } from "react";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";
import Modal from "./Modal";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.sectionHeading,
    fontWeight: 600,
    color: colors.black,
    margin: "0 0 12px 0",
  };

  const messageStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    margin: "0 0 24px 0",
    lineHeight: 1.5,
  };

  const actionsStyle: CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
  };

  const cancelButtonStyle: CSSProperties = {
    padding: "10px 24px",
    fontSize: fontSizes.body,
    fontFamily,
    fontWeight: 600,
    backgroundColor: "transparent",
    color: colors.black,
    border: `1px solid ${colors.darkGray}`,
    borderRadius: borderRadius.pill,
    cursor: "pointer",
  };

  const confirmButtonStyle: CSSProperties = {
    padding: "10px 24px",
    fontSize: fontSizes.body,
    fontFamily,
    fontWeight: 600,
    backgroundColor: colors.red,
    color: colors.white,
    border: "none",
    borderRadius: borderRadius.pill,
    cursor: "pointer",
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel}>
      <h2 style={titleStyle}>{title}</h2>
      <p style={messageStyle}>{message}</p>
      <div style={actionsStyle}>
        <button style={cancelButtonStyle} onClick={onCancel} type="button">
          Cancel
        </button>
        <button style={confirmButtonStyle} onClick={onConfirm} type="button">
          Confirm
        </button>
      </div>
    </Modal>
  );
}
