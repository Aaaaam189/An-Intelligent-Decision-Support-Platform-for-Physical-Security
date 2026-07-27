import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ZoneRow from "./ZoneRow";
import type { Zone } from "../../types/zone.types";

const mockZone: Zone = {
  id: "zone-1",
  name: "Main Entrance",
};

describe("ZoneRow", () => {
  it("renders zone name in view mode", () => {
    render(
      <ZoneRow
        zone={mockZone}
        onUpdate={vi.fn()}
        isUpdating={false}
        updateError={null}
      />
    );

    expect(screen.getByText("Main Entrance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("switches to edit mode when Edit is clicked", () => {
    render(
      <ZoneRow
        zone={mockZone}
        onUpdate={vi.fn()}
        isUpdating={false}
        updateError={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const input = screen.getByLabelText("Zone name");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Main Entrance");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onUpdate with zone id and new name on save", () => {
    const onUpdate = vi.fn();
    render(
      <ZoneRow
        zone={mockZone}
        onUpdate={onUpdate}
        isUpdating={false}
        updateError={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const input = screen.getByLabelText("Zone name");
    fireEvent.change(input, { target: { value: "Back Gate" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdate).toHaveBeenCalledWith("zone-1", "Back Gate");
  });

  it("reverts to view mode on cancel", () => {
    render(
      <ZoneRow
        zone={mockZone}
        onUpdate={vi.fn()}
        isUpdating={false}
        updateError={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Main Entrance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("shows loading state when isUpdating is true", () => {
    render(
      <ZoneRow
        zone={mockZone}
        onUpdate={vi.fn()}
        isUpdating={true}
        updateError={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByLabelText("Zone name")).toBeDisabled();
  });

  it("reverts name and shows error when updateError is provided", () => {
    const { rerender } = render(
      <ZoneRow
        zone={mockZone}
        onUpdate={vi.fn()}
        isUpdating={false}
        updateError={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const input = screen.getByLabelText("Zone name");
    fireEvent.change(input, { target: { value: "New Name" } });

    // Simulate error coming in
    rerender(
      <ZoneRow
        zone={mockZone}
        onUpdate={vi.fn()}
        isUpdating={false}
        updateError="Failed to update zone"
      />
    );

    // Should revert to view mode with original name
    expect(screen.getByText("Main Entrance")).toBeInTheDocument();
    expect(screen.getByText("Failed to update zone")).toBeInTheDocument();
  });

  it("does not call onUpdate when name is unchanged", () => {
    const onUpdate = vi.fn();
    render(
      <ZoneRow
        zone={mockZone}
        onUpdate={onUpdate}
        isUpdating={false}
        updateError={null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // Submit without changing the name
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdate).not.toHaveBeenCalled();
  });
});
