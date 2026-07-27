import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DeleteConfirmationModal from "./DeleteConfirmationModal";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockMutate = vi.fn();
const mockDeleteCamera = {
  mutate: mockMutate,
  isPending: false,
};

vi.mock("../../hooks/useCameras", () => ({
  useCameraMutations: () => ({
    deleteCamera: mockDeleteCamera,
    createCamera: { mutate: vi.fn(), isPending: false },
    updateCamera: { mutate: vi.fn(), isPending: false },
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DeleteConfirmationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteCamera.isPending = false;
  });

  it("does not render when isOpen is false", () => {
    render(
      <DeleteConfirmationModal
        isOpen={false}
        cameraId="cam-1"
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText("This action is irreversible")).not.toBeInTheDocument();
  });

  it("renders warning text in red when open", () => {
    render(
      <DeleteConfirmationModal
        isOpen={true}
        cameraId="cam-1"
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    const warning = screen.getByText("This action is irreversible");
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveStyle({ color: "#FF3B30" });
  });

  it("renders Delete and Cancel buttons", () => {
    render(
      <DeleteConfirmationModal
        isOpen={true}
        cameraId="cam-1"
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <DeleteConfirmationModal
        isOpen={true}
        cameraId="cam-1"
        onClose={onClose}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls deleteCamera.mutate with cameraId when Delete is clicked", () => {
    render(
      <DeleteConfirmationModal
        isOpen={true}
        cameraId="cam-123"
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockMutate).toHaveBeenCalledWith("cam-123", expect.any(Object));
  });

  it("calls onClose and navigates to /cameras on delete success", async () => {
    mockMutate.mockImplementation((_id: string, options: { onSuccess: () => void }) => {
      options.onSuccess();
    });

    const onClose = vi.fn();
    render(
      <DeleteConfirmationModal
        isOpen={true}
        cameraId="cam-1"
        onClose={onClose}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/cameras");
    });
  });

  it("shows error message on delete failure", async () => {
    mockMutate.mockImplementation((_id: string, options: { onError: (err: Error) => void }) => {
      options.onError(new Error("Network error"));
    });

    const onClose = vi.fn();
    render(
      <DeleteConfirmationModal
        isOpen={true}
        cameraId="cam-1"
        onClose={onClose}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape key press", () => {
    const onClose = vi.fn();
    render(
      <DeleteConfirmationModal
        isOpen={true}
        cameraId="cam-1"
        onClose={onClose}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
