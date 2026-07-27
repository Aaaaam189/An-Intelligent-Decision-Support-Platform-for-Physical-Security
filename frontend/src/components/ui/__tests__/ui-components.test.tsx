import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Button from "../Button";
import Input from "../Input";
import Card from "../Card";
import Modal from "../Modal";
import Spinner from "../Spinner";
import Toast from "../Toast";
import Skeleton from "../Skeleton";
import ConfirmDialog from "../ConfirmDialog";
import Tabs from "../Tabs";
import StatusBadge from "../StatusBadge";

describe("Button", () => {
  it("renders children text", () => {
    render(<Button variant="primary">Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<Button variant="primary" onClick={handleClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("disables button when isLoading is true", () => {
    render(<Button variant="primary" isLoading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables button when disabled prop is true", () => {
    render(<Button variant="primary" disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows spinner when isLoading", () => {
    render(<Button variant="primary" isLoading>Loading</Button>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("applies correct type attribute", () => {
    render(<Button variant="primary" type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});

describe("Input", () => {
  it("renders label and input", () => {
    render(<Input label="Email" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("calls onChange with new value", () => {
    const handleChange = vi.fn();
    render(<Input label="Name" value="" onChange={handleChange} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "test" } });
    expect(handleChange).toHaveBeenCalledWith("test");
  });

  it("displays error message", () => {
    render(<Input label="Email" value="" onChange={() => {}} error="Required" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("sets aria-invalid when error is present", () => {
    render(<Input label="Email" value="" onChange={() => {}} error="Invalid" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("respects maxLength", () => {
    render(<Input label="Code" value="" onChange={() => {}} maxLength={6} />);
    expect(screen.getByLabelText("Code")).toHaveAttribute("maxlength", "6");
  });
});

describe("Card", () => {
  it("renders children", () => {
    render(<Card><p>Card content</p></Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("renders children when open", () => {
    render(<Modal isOpen onClose={() => {}}>Modal content</Modal>);
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<Modal isOpen={false} onClose={() => {}}>Hidden</Modal>);
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", () => {
    const handleClose = vi.fn();
    render(<Modal isOpen onClose={handleClose}>Content</Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const handleClose = vi.fn();
    render(<Modal isOpen onClose={handleClose}>Content</Modal>);
    fireEvent.click(screen.getByRole("dialog"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when content is clicked", () => {
    const handleClose = vi.fn();
    render(<Modal isOpen onClose={handleClose}><button>Inside</button></Modal>);
    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(handleClose).not.toHaveBeenCalled();
  });
});

describe("Spinner", () => {
  it("renders with status role", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Toast", () => {
  it("renders message", () => {
    render(<Toast message="Action completed" onDismiss={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Action completed");
  });

  it("calls onDismiss after duration", async () => {
    vi.useFakeTimers();
    const handleDismiss = vi.fn();
    render(<Toast message="Bye" duration={3000} onDismiss={handleDismiss} />);
    await vi.advanceTimersByTimeAsync(3000);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("Skeleton", () => {
  it("renders with aria-hidden", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});


describe("StatusBadge", () => {
  const PRIORITY_COLORS: Record<string, string> = {
    LOW: "#35d185",
    MEDIUM: "#FFA500",
    HIGH: "#FF6347",
    CRITICAL: "#FF3B30",
  };

  it("renders the value text", () => {
    render(<StatusBadge value="HIGH" colorMap={PRIORITY_COLORS} />);
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });

  it("applies the correct background color from colorMap", () => {
    render(<StatusBadge value="CRITICAL" colorMap={PRIORITY_COLORS} />);
    const badge = screen.getByText("CRITICAL");
    expect(badge).toHaveStyle({ backgroundColor: "#FF3B30" });
  });

  it("uses a fallback color for unknown values", () => {
    render(<StatusBadge value="UNKNOWN" colorMap={PRIORITY_COLORS} />);
    const badge = screen.getByText("UNKNOWN");
    expect(badge).toHaveStyle({ backgroundColor: "#999999" });
  });

  it("uses pill border radius", () => {
    render(<StatusBadge value="LOW" colorMap={PRIORITY_COLORS} />);
    const badge = screen.getByText("LOW");
    expect(badge).toHaveStyle({ borderRadius: "9999px" });
  });
});

describe("Tabs", () => {
  const tabs = [
    { key: "active", label: "Active" },
    { key: "inactive", label: "Inactive" },
  ];

  it("renders all tabs", () => {
    render(<Tabs tabs={tabs} activeTab="active" onTabChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Inactive" })).toBeInTheDocument();
  });

  it("marks the active tab with aria-selected true", () => {
    render(<Tabs tabs={tabs} activeTab="active" onTabChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Inactive" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onTabChange with the correct key when a tab is clicked", () => {
    const handleChange = vi.fn();
    render(<Tabs tabs={tabs} activeTab="active" onTabChange={handleChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Inactive" }));
    expect(handleChange).toHaveBeenCalledWith("inactive");
  });

  it("renders a tablist role container", () => {
    render(<Tabs tabs={tabs} activeTab="active" onTabChange={() => {}} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});


describe("ConfirmDialog", () => {
  it("renders title and message when open", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete item?"
        message="This action cannot be undone."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Delete item?")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="Delete item?"
        message="This action cannot be undone."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByText("Delete item?")).not.toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const handleConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={handleConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", () => {
    const handleCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={handleCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Escape key is pressed", () => {
    const handleCancel = vi.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={handleCancel}
      />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it("renders both confirm and cancel buttons", () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
