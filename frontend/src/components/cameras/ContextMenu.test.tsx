import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ContextMenu from "./ContextMenu";

const defaultProps = {
  position: { x: 100, y: 200 },
  isActive: true,
  onDetails: vi.fn(),
  onToggleActive: vi.fn(),
  onClose: vi.fn(),
};

describe("ContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders the Details option for all users", () => {
    localStorage.setItem("sentinel_role", "SECURITY_GUARD");
    render(<ContextMenu {...defaultProps} />);
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("does not render Deactivate option for SECURITY_GUARD role", () => {
    localStorage.setItem("sentinel_role", "SECURITY_GUARD");
    render(<ContextMenu {...defaultProps} />);
    expect(screen.queryByText("Deactivate")).not.toBeInTheDocument();
  });

  it("renders Deactivate option for ADMIN role", () => {
    localStorage.setItem("sentinel_role", "ADMIN");
    render(<ContextMenu {...defaultProps} />);
    expect(screen.getByText("Deactivate")).toBeInTheDocument();
  });

  it("calls onDetails and onClose when Details is clicked", () => {
    localStorage.setItem("sentinel_role", "ADMIN");
    render(<ContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByText("Details"));
    expect(defaultProps.onDetails).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleActive and onClose when Deactivate is clicked", () => {
    localStorage.setItem("sentinel_role", "ADMIN");
    render(<ContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByText("Deactivate"));
    expect(defaultProps.onToggleActive).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking outside the menu", () => {
    localStorage.setItem("sentinel_role", "ADMIN");
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ContextMenu {...defaultProps} />
      </div>
    );
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the menu", () => {
    localStorage.setItem("sentinel_role", "ADMIN");
    render(<ContextMenu {...defaultProps} />);
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("is positioned at the specified coordinates", () => {
    localStorage.setItem("sentinel_role", "ADMIN");
    render(<ContextMenu {...defaultProps} />);
    const menu = screen.getByRole("menu");
    expect(menu.style.top).toBe("200px");
    expect(menu.style.left).toBe("100px");
  });
});
