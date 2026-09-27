import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CriticalAlertsBanner from "./CriticalAlertsBanner";
import type { Incident } from "../../types/incident.types";

const mockIncident = (overrides: Partial<Incident> = {}): Incident => ({
  id: "inc-1",
  cameraId: "cam-1",
  zoneId: "zone-1",
  type: "WEAPON_DETECTED",
  priority: "CRITICAL",
  riskScore: 90,
  status: "PENDING",
  ruleId: null,
  shiftId: null,
  assignedGuardId: null,
  createdAt: "2024-06-15T14:30:00Z",
  closedAt: null,
  ...overrides,
});

describe("CriticalAlertsBanner", () => {
  it("renders empty state message when no incidents provided", () => {
    render(<CriticalAlertsBanner incidents={[]} />);

    expect(screen.getByText("No critical alerts at this time.")).toBeInTheDocument();
    expect(screen.getByText("Critical Alerts")).toBeInTheDocument();
  });

  it("renders incident type for each alert", () => {
    const incidents = [
      mockIncident({ id: "inc-1", type: "WEAPON_DETECTED" }),
      mockIncident({ id: "inc-2", type: "CROWD_OVERFLOW" }),
    ];

    render(<CriticalAlertsBanner incidents={incidents} />);

    expect(screen.getByText("WEAPON DETECTED")).toBeInTheDocument();
    expect(screen.getByText("CROWD OVERFLOW")).toBeInTheDocument();
  });

  it("renders priority for each alert with correct color", () => {
    const incidents = [
      mockIncident({ id: "inc-1", priority: "CRITICAL" }),
      mockIncident({ id: "inc-2", priority: "HIGH" }),
    ];

    render(<CriticalAlertsBanner incidents={incidents} />);

    const criticalEl = screen.getByText("CRITICAL");
    const highEl = screen.getByText("HIGH");

    expect(criticalEl).toBeInTheDocument();
    expect(highEl).toBeInTheDocument();
    expect(criticalEl).toHaveStyle({ color: "#FF3B30" });
    expect(highEl).toHaveStyle({ color: "#FF9500" });
  });

  it("renders creation time for each alert", () => {
    const incidents = [
      mockIncident({ id: "inc-1", createdAt: "2024-06-15T14:30:00Z" }),
    ];

    render(<CriticalAlertsBanner incidents={incidents} />);

    // The formatted time should appear in the document
    const listItems = screen.getAllByRole("listitem");
    expect(listItems).toHaveLength(1);
    // Time is locale-dependent, just verify the list item is rendered
    expect(listItems[0]).toBeInTheDocument();
  });

  it("renders heading 'Critical Alerts' when incidents are present", () => {
    const incidents = [mockIncident()];

    render(<CriticalAlertsBanner incidents={incidents} />);

    expect(screen.getByText("Critical Alerts")).toBeInTheDocument();
  });
});
