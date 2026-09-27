import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Rule } from "../../types/rule.types";
import type { IncidentType } from "../../types/incident.types";
import { INCIDENT_TYPE_OPTIONS } from "../../types/incident.types";

// --- Hook mocks -------------------------------------------------------------
// RulesPage pulls rules/zones from hooks and uses mutation hooks for
// create/update/delete. We mock them so the tests stay focused on the
// incident type dropdown behavior (Requirements 2.2, 7.1, 7.2, 7.3) rather
// than on data fetching or network calls.

const mockUseRules = vi.fn();
const mockUseZones = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();

function createMutation() {
  return {
    mutate: mockCreateMutate,
    reset: vi.fn(),
    isPending: false,
    error: null,
  };
}

function updateMutation() {
  return {
    mutate: mockUpdateMutate,
    reset: vi.fn(),
    isPending: false,
    error: null,
  };
}

function deleteMutation() {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  };
}

vi.mock("../../hooks/useRules", () => ({
  useRules: () => mockUseRules(),
  useCreateRule: () => createMutation(),
  useUpdateRule: () => updateMutation(),
  useDeleteRule: () => deleteMutation(),
}));

vi.mock("../../hooks/useZones", () => ({
  useZones: () => mockUseZones(),
}));

import RulesPage from "./RulesPage";

// The human-readable label the form derives from a fixed-set member value.
function labelFor(value: IncidentType): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function mockRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: "rule-1",
    name: "Test rule",
    enabled: true,
    detectionType: "PERSON_DETECTED",
    weaponClass: null,
    zoneScope: "ALL",
    targetZones: [],
    windowStartMin: 0,
    windowEndMin: 1439,
    alwaysTrigger: false,
    resultingPriority: "HIGH",
    incidentType: "INTRUSION",
    createdAt: "2024-06-15T14:30:00Z",
    updatedAt: "2024-06-15T14:30:00Z",
    ...overrides,
  };
}

// Finds the <select> that belongs to the "Incident type" field by locating
// its label and reading the associated control.
function getIncidentTypeSelect(container: HTMLElement): HTMLSelectElement {
  const label = within(container).getByText("Incident type:");
  const select = label.parentElement?.querySelector("select");
  if (!select) throw new Error("Incident type select not found");
  return select as HTMLSelectElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRules.mockReturnValue({
    rules: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  mockUseZones.mockReturnValue({ zones: [] });
});

describe("Rule form incident type dropdown options (Requirements 2.2, 7.1)", () => {
  const REPRESENTATIVE_DETECTION_TYPES = [
    "PERSON_DETECTED",
    "WEAPON_DETECTED",
    "VEHICLE_DETECTED",
  ];

  it.each(REPRESENTATIVE_DETECTION_TYPES)(
    "presents every Fixed_Incident_Type_Set member for detection type %s",
    (detectionType) => {
      render(<RulesPage />);
      fireEvent.click(screen.getByRole("button", { name: "Add Rule" }));

      const dialog = screen.getByRole("dialog");
      // Switch the detection type to the representative value.
      const detectLabel = within(dialog).getByText("Detect:");
      const detectSelect = detectLabel.parentElement?.querySelector(
        "select"
      ) as HTMLSelectElement;
      fireEvent.change(detectSelect, { target: { value: detectionType } });

      const incidentSelect = getIncidentTypeSelect(dialog);
      const optionValues = Array.from(incidentSelect.options)
        .map((o) => o.value)
        .filter((v) => v !== ""); // drop the placeholder option

      expect(optionValues).toEqual([...INCIDENT_TYPE_OPTIONS]);

      // Each member is presented with its human-readable label.
      for (const value of INCIDENT_TYPE_OPTIONS) {
        expect(
          within(incidentSelect).getByText(labelFor(value))
        ).toBeInTheDocument();
      }
    }
  );
});

describe("Rule form blocks submit when incident type unselected (Requirement 7.2)", () => {
  it("disables the create submit button and shows a required indication", () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Rule" }));

    const dialog = screen.getByRole("dialog");

    // Fill the other required fields so only the missing incident type blocks
    // submission.
    fireEvent.change(within(dialog).getByPlaceholderText("Rule name"), {
      target: { value: "My rule" },
    });
    const priorityLabel = within(dialog).getByText("Priority:");
    const prioritySelect = priorityLabel.parentElement?.querySelector(
      "select"
    ) as HTMLSelectElement;
    fireEvent.change(prioritySelect, { target: { value: "HIGH" } });

    // Required indication is shown while nothing is selected.
    expect(
      within(dialog).getByText("Incident type is required")
    ).toBeInTheDocument();

    // Submission is blocked.
    const createButton = within(dialog).getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();
    fireEvent.click(createButton);
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it("enables submission once an incident type is selected", () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Add Rule" }));

    const dialog = screen.getByRole("dialog");

    fireEvent.change(within(dialog).getByPlaceholderText("Rule name"), {
      target: { value: "My rule" },
    });
    const priorityLabel = within(dialog).getByText("Priority:");
    const prioritySelect = priorityLabel.parentElement?.querySelector(
      "select"
    ) as HTMLSelectElement;
    fireEvent.change(prioritySelect, { target: { value: "HIGH" } });

    const incidentSelect = getIncidentTypeSelect(dialog);
    fireEvent.change(incidentSelect, { target: { value: "SUSPICIOUS_ACTIVITY" } });

    // Required indication disappears and submission is allowed.
    expect(
      within(dialog).queryByText("Incident type is required")
    ).not.toBeInTheDocument();

    const createButton = within(dialog).getByRole("button", { name: "Create" });
    expect(createButton).not.toBeDisabled();

    fireEvent.click(createButton);
    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockCreateMutate.mock.calls[0][0]).toMatchObject({
      incidentType: "SUSPICIOUS_ACTIVITY",
    });
  });
});

describe("Rule form pre-selects stored incident type on edit (Requirement 7.3)", () => {
  it.each(INCIDENT_TYPE_OPTIONS)(
    "pre-selects the stored incidentType %s when editing",
    (storedType) => {
      mockUseRules.mockReturnValue({
        rules: [mockRule({ incidentType: storedType })],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<RulesPage />);
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Edit Rule")).toBeInTheDocument();

      const incidentSelect = getIncidentTypeSelect(dialog);
      expect(incidentSelect.value).toBe(storedType);

      // No required indication when a value is pre-selected.
      expect(
        within(dialog).queryByText("Incident type is required")
      ).not.toBeInTheDocument();
    }
  );
});
