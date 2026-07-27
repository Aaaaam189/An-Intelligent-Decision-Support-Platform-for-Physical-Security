import { useEffect, useRef, type CSSProperties } from "react";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

interface ContextMenuProps {
  position: { x: number; y: number };
  isActive: boolean;
  onDetails: () => void;
  onToggleActive: () => void;
  onClose: () => void;
}

export default function ContextMenu({
  position,
  isActive,
  onDetails,
  onToggleActive,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const role = localStorage.getItem("sentinel_role");
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const handleDetails = () => {
    onDetails();
    onClose();
  };

  const handleToggleActive = () => {
    onToggleActive();
    onClose();
  };

  const menuStyle: CSSProperties = {
    position: "absolute",
    top: position.y,
    left: position.x,
    backgroundColor: colors.white,
    borderRadius: borderRadius.card,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    zIndex: 1000,
    minWidth: "150px",
    overflow: "hidden",
    fontFamily,
  };

  const optionStyle: CSSProperties = {
    padding: "10px 16px",
    fontSize: fontSizes.body,
    cursor: "pointer",
    color: colors.black,
    backgroundColor: colors.white,
    border: "none",
    width: "100%",
    textAlign: "left",
    fontFamily,
    transition: "background-color 0.15s ease",
  };

  return (
    <div ref={menuRef} style={menuStyle} role="menu" aria-label="Camera actions">
      <button
        style={optionStyle}
        onClick={handleDetails}
        role="menuitem"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = colors.lightGray;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = colors.white;
        }}
      >
        Details
      </button>
      {isAdmin && (
        <button
          style={{ ...optionStyle, color: isActive ? colors.red : colors.green }}
          onClick={handleToggleActive}
          role="menuitem"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.lightGray;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = colors.white;
          }}
        >
          {isActive ? "Deactivate" : "Activate"}
        </button>
      )}
    </div>
  );
}
