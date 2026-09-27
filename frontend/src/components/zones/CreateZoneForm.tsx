import { useState, useEffect, useRef, type CSSProperties, type FormEvent } from "react";
import { colors, fontFamily, fontSizes, borderRadius } from "../../constants/theme";

interface CreateZoneFormProps {
  onCreate: (name: string) => void;
  isCreating: boolean;
  createError: string | null;
}

export default function CreateZoneForm({
  onCreate,
  isCreating,
  createError,
}: CreateZoneFormProps) {
  const [name, setName] = useState("");
  const prevIsCreatingRef = useRef(isCreating);

  // Clear input on successful creation (isCreating goes from true to false without error)
  useEffect(() => {
    if (prevIsCreatingRef.current && !isCreating && !createError) {
      setName("");
    }
    prevIsCreatingRef.current = isCreating;
  }, [isCreating, createError]);

  const trimmedName = name.trim();
  // Only disable when there's no name to submit. Do not gate on isCreating so a
  // stuck/hung mutation can never leave the button permanently unclickable.
  const isSubmitDisabled = trimmedName.length === 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isSubmitDisabled) {
      onCreate(trimmedName);
    }
  }

  const formStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    padding: "10px 16px",
    borderRadius: borderRadius.pill,
    border: "1px solid transparent",
    backgroundColor: colors.darkGray,
    fontFamily,
    fontSize: fontSizes.body,
    color: colors.black,
    outline: "none",
    transition: "border-color 0.2s ease",
    opacity: isCreating ? 0.6 : 1,
  };

  const buttonStyle: CSSProperties = {
    padding: "10px 24px",
    borderRadius: borderRadius.pill,
    border: "none",
    backgroundColor: colors.green,
    color: colors.white,
    fontFamily,
    fontSize: fontSizes.body,
    fontWeight: 600,
    cursor: isSubmitDisabled ? "not-allowed" : "pointer",
    opacity: isSubmitDisabled ? 0.6 : 1,
    transition: "opacity 0.2s ease",
    whiteSpace: "nowrap",
  };

  const errorStyle: CSSProperties = {
    fontFamily,
    fontSize: "12px",
    color: colors.red,
    marginTop: "4px",
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter zone name"
          style={inputStyle}
          aria-label="Zone name"
        />
        <button
          type="submit"
          disabled={isSubmitDisabled}
          style={buttonStyle}
          aria-busy={isCreating}
        >
          {isCreating ? "Creating..." : "Create Zone"}
        </button>
      </form>
      {createError && (
        <p style={errorStyle} role="alert">
          {createError}
        </p>
      )}
    </div>
  );
}
