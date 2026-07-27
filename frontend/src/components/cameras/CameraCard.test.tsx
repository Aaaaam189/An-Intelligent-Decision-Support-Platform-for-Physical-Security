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

  it("shows placeholder icon when streamUrl is empty", () => {
    const noStreamCamera: Camera = {
      ...mockCamera,
      streamUrl: "",
    };
    const onMenuClick = vi.fn();
    const { container } = render(
      <CameraCard camera={noStreamCamera} onMenuClick={onMenuClick} />
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveStyle({ display: "block" });
  });

  it("renders an img element when streamUrl is provided", () => {
    const onMenuClick = vi.fn();
    render(<CameraCard camera={mockCamera} onMenuClick={onMenuClick} />);

    const img = screen.getByAltText(`${mockCamera.name} thumbnail`);
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", mockCamera.streamUrl);
  });
});
