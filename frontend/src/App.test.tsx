import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("redirects unauthenticated users to login page", () => {
    render(<App />);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("redirects authenticated users to cameras page", () => {
    localStorage.setItem("sentinel_token", "test-token");
    localStorage.setItem("sentinel_role", "ADMIN");
    render(<App />);
    expect(screen.getByText("SentinelAI")).toBeInTheDocument();
    // Cameras page renders a loading spinner while fetching data
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});
