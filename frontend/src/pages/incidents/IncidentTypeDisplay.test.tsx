import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Incident, IncidentType } from "../../types/incident.types";
import { INCIDENT_TYPE_OPTIONS } from "../../types/incident.types";

// --- Hook mocks -------------------------------------------------------------
// The incident views pull data from several hooks. We mock them so the tests
// stay focused on how the fixed-set incident type is rendered (Requirements
// 7.4 and 7.5) rather than on data fetching.

const mockUseIncidents = vi.fn();
const mockUseIncident = vi.fn();
const noopMutation = () => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null,
});

vi.mock("../../hooks/useIncidents", () => ({
  useIncidents: () => mockUseIncidents(),
  useIncident: () => mockUseIncident(),
  useUpdateIncidentStatus: () => noopMutation(),
  useReassignIncident: () => noopMutation(),
}));

vi.mock("../../hooks/useUsers", () => ({
  useActiveUsers: () => ({ users: [] }),
}));

vi.mock("../../hooks/useZones", () => ({
  useZones: () => ({ zones: [] }),
}));

vi.mock("../../hooks/useCameras", () => ({
  useCameras: () => ({ cameras: [] }),
}));

vi.mock("../../hooks/useRules", () => ({
  useRules: () => ({ rules: [] }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "inc-1" }),
}));

import IncidentsPage from "./IncidentsPage";
import IncidentDetailPage from "./IncidentDetailPage";

function mockIncident(overrides: Partial<Incident> = {}): Incident {
  return {
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
  };
}

// A representative sample of the Fixed_Incident_Type_Set.
const REPRESENTATIVE_TYPES: IncidentType[] = [
  "WEAPON_DETECTED",
  "INTRUSION",
  "UNAUTHORIZED_VEHICLE",
  "OTHER",
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Incidents list view renders fixed-set incident types (Requirement 7.4)", () => {
  it("renders each incident's fixed-set type in the admin list", () => {
    localStorage.setItem("sentinel_role", "ADMIN");
    const incidents = REPRESENTATIVE_TYPES.map((type, i) =>
      mockIncident({ id: `inc-${i}`, type })
    );
    mockUseIncidents.mockReturnValue({
      incidents,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<IncidentsPage />);

    for (const type of REPRESENTATIVE_TYPES) {
      expect(screen.getByText(type)).toBeInTheDocument();
    }
  });

  it("renders every member of the Fixed_Incident_Type_Set in the admin list", () => {
    localStorage.setItem("sentinel_role", "ADMIN");
    const incidents = INCIDENT_TYPE_OPTIONS.map((type, i) =>
      mockIncident({ id: `inc-${i}`, type })
    );
    mockUseIncidents.mockReturnValue({
      incidents,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<IncidentsPage />);

    for (const type of INCIDENT_TYPE_OPTIONS) {
      expect(screen.getByText(type)).toBeInTheDocument();
    }
  });

  it("renders the incident's fixed-set type in the guard list", () => {
    localStorage.setItem("sentinel_role", "SECURITY_GUARD");
    localStorage.setItem("sentinel_userId", "guard-1");
    const incidents = REPRESENTATIVE_TYPES.map((type, i) =>
      mockIncident({ id: `inc-${i}`, type, assignedGuardId: "guard-1" })
    );
    mockUseIncidents.mockReturnValue({
      incidents,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<IncidentsPage />);

    for (const type of REPRESENTATIVE_TYPES) {
      expect(screen.getByText(type)).toBeInTheDocument();
    }
  });
});

describe("Incident detail view renders fixed-set incident type (Requirement 7.5)", () => {
  it.each(REPRESENTATIVE_TYPES)(
    "renders the fixed-set type %s in the Type detail field",
    (type) => {
      mockUseIncident.mockReturnValue({
        incident: mockIncident({ type }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { unmount } = render(<IncidentDetailPage />);

      // The "Type" field label is followed by the incident's fixed-set value.
      const label = screen.getByText("Type");
      const field = label.parentElement as HTMLElement;
      expect(within(field).getByText(type)).toBeInTheDocument();

      unmount();
    }
  );
});
