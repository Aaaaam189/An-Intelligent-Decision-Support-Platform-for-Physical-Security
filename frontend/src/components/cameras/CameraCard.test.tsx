import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CameraCard from "./CameraCard";
import type { Camera } from "../../types/camera.types";

const mockCamera: Camera = {
  id: "cam-1",
  name: "Front Entrance Camera",
  zoneId: "zone-1",
  location: "Building A - Main Lobby",
  isActive: true,
  streamUrl: "http://example.com/stream1.m3u8",
  createdAt: "2024-01-15T10:30:00Z",
};

describe("CameraCard", () => {
  it("renders camera name and location", () => {
    const onMenuClick = vi.fn();
    render(<CameraCard camera={mockCamera} onMenuClick={onMenuClick} />);

    expect(screen.getByText("Front Entrance Camera")).toBeInTheDocument();
    expect(screen.getByText("Building A - Main Lobby")).toBeInTheDocument();
  });

  it("truncates camera name longer than 30 characters", () => {
    const longNameCamera: Camera = {
      ...mockCamera,
      name: "This Is A Very Long Camera Name That Exceeds Thirty Characters",
    };
    const onMenuClick = vi.fn();
    render(<CameraCard camera={longNameCamera} onMenuClick={onMenuClick} />);

    expect(screen.getByText("This Is A Very Long Camera ...")).toBeInTheDocument();
  });

  it("shows full name in title attribute when name is truncated", () => {
    const longNameCamera: Camera = {
      ...mockCamera,
      name: "This Is A Very Long Camera Name That Exceeds Thirty Characters",
    };
    const onMenuClick = vi.fn();
    render(<CameraCard camera={longNameCamera} onMenuClick={onMenuClick} />);

    const nameElement = screen.getByText("This Is A Very Long Camera ...");
    expect(nameElement).toHaveAttribute("title", longNameCamera.name);
  });

  it("does not add title attribute when name is 30 chars or fewer", () => {
    const onMenuClick = vi.fn();
    render(<CameraCard camera={mockCamera} onMenuClick={onMenuClick} />);

    const nameElement = screen.getByText("Front Entrance Camera");
    expect(nameElement).not.toHaveAttribute("title");
  });

  it("renders the '...' menu button with proper aria-label", () => {
    const onMenuClick = vi.fn();
    render(<CameraCard camera={mockCamera} onMenuClick={onMenuClick} />);

    const menuButton = screen.getByRole("button", {
      name: `Actions for ${mockCamera.name}`,
    });
    expect(menuButton).toBeInTheDocument();
  });

  it("calls onMenuClick when '...' button is clicked", () => {
    const onMenuClick = vi.fn();
    render(<CameraCard camera={mockCamera} onMenuClick={onMenuClick} />);

    const menuButton = screen.getByRole("button", {
      name: `Actions for ${mockCamera.name}`,
    });
    fireEvent.click(menuButton);

    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it("renders the placeholder icon (hidden until the stream fails)", () => {
    const onMenuClick = vi.fn();
    const { container } = render(
      <CameraCard camera={mockCamera} onMenuClick={onMenuClick} />
    );

    // The placeholder starts hidden; it's revealed only when the live stream
    // and raw-stream fallback both fail to load.
    const svg = container.querySelector("svg.camera-placeholder");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveStyle({ display: "none" });
  });

  it("renders the live stream img pointing at the ai-service stream URL", () => {
    const onMenuClick = vi.fn();
    render(<CameraCard camera={mockCamera} onMenuClick={onMenuClick} />);

    const img = screen.getByAltText(`${mockCamera.name} live`);
    expect(img).toBeInTheDocument();
    // Points at the ai-service MJPEG stream keyed by camera id, not the raw URL.
    expect(img.getAttribute("src")).toContain(`/stream/${mockCamera.id}`);
  });
});
