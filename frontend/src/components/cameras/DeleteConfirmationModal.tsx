import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { useCameraMutations } from "../../hooks/useCameras";
import { colors, fontFamily, fontSizes } from "../../constants/theme";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  cameraId: string;
  onClose: () => void;
}

export default function DeleteConfirmationModal({
  isOpen,
  cameraId,
  onClose,
}: DeleteConfirmationModalProps) {
  const navigate = useNavigate();
  const { deleteCamera } = useCameraMutations();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    deleteCamera.mutate(cameraId, {
      onSuccess: () => {
        onClose();
        navigate("/cameras");
      },
      onError: (err) => {
        setError(err.message || "Failed to delete camera. Please try again.");
      },
    });
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const warningStyle: CSSProperties = {
    color: colors.red,
    fontSize: fontSizes.body,
    fontFamily,
    marginBottom: "24px",
    textAlign: "center",
  };

  const errorStyle: CSSProperties = {
    color: colors.red,
    fontSize: fontSizes.body,
    fontFamily,
    marginBottom: "16px",
    textAlign: "center",
  };

  const actionsStyle: CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <p style={warningStyle}>This action is irreversible</p>

      {error && <p style={errorStyle}>{error}</p>}

      <div style={actionsStyle}>
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          isLoading={deleteCamera.isPending}
          disabled={deleteCamera.isPending}
        >
          Delete
        </Button>
      </div>
    </Modal>
  );
}
