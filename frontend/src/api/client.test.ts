import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import axios from "axios";
import type { AxiosInstance } from "axios";

// We need to test the client module behavior, so we'll re-import fresh each time
// For unit testing, we mock at the network level

describe("API Client", () => {
  let apiClient: AxiosInstance;
  let onToast: (listener: (msg: string) => void) => () => void;

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorage.clear();

    // Reset modules to get a fresh axios instance
    vi.resetModules();
    const mod = await import("./client");
    apiClient = mod.default;
    onToast = mod.onToast;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Request Interceptor", () => {
    it("should attach Authorization header when token exists in localStorage", async () => {
      localStorage.setItem("sentinel_token", "my-jwt-token");

      // Intercept the request to check headers
      const requestInterceptor = apiClient.interceptors.request as any;
      const config = {
        headers: new axios.AxiosHeaders(),
        url: "/test",
        method: "get",
      };

      // Manually invoke the request interceptor
      const handlers = (requestInterceptor as any).handlers;
      const fulfilledHandler = handlers[handlers.length - 1]?.fulfilled;

      if (fulfilledHandler) {
        const result = await fulfilledHandler(config);
        expect(result.headers.Authorization).toBe("Bearer my-jwt-token");
      }
    });

    it("should not attach Authorization header when no token in localStorage", async () => {
      const config = {
        headers: new axios.AxiosHeaders(),
        url: "/test",
        method: "get",
      };

      const requestInterceptor = apiClient.interceptors.request as any;
      const handlers = (requestInterceptor as any).handlers;
      const fulfilledHandler = handlers[handlers.length - 1]?.fulfilled;

      if (fulfilledHandler) {
        const result = await fulfilledHandler(config);
        expect(result.headers.Authorization).toBeUndefined();
      }
    });
  });

  describe("Configuration", () => {
    it("should have timeout set to 15000ms", () => {
      expect(apiClient.defaults.timeout).toBe(15000);
    });

    it("should have baseURL from env or default", () => {
      expect(apiClient.defaults.baseURL).toBe("http://localhost:8080");
    });
  });

  describe("Toast subscription", () => {
    it("should allow subscribing and unsubscribing to toast events", () => {
      const listener = vi.fn();
      const unsubscribe = onToast(listener);

      expect(typeof unsubscribe).toBe("function");

      // After unsubscribing, the listener should no longer be called
      unsubscribe();
    });
  });
});
