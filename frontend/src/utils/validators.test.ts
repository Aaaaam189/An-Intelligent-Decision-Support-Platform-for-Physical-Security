import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validateVerificationCode,
  validatePasswordPair,
  validateCameraForm,
} from "./validators";

describe("validateEmail", () => {
  it("accepts a valid email", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  it("accepts email with subdomain", () => {
    expect(validateEmail("user@mail.example.com")).toBe(true);
  });

  it("rejects email without @", () => {
    expect(validateEmail("userexample.com")).toBe(false);
  });

  it("rejects email with multiple @", () => {
    expect(validateEmail("user@@example.com")).toBe(false);
    expect(validateEmail("us@er@example.com")).toBe(false);
  });

  it("rejects email with empty local part", () => {
    expect(validateEmail("@example.com")).toBe(false);
  });

  it("rejects email with empty domain part", () => {
    expect(validateEmail("user@")).toBe(false);
  });

  it("rejects email without dot in domain", () => {
    expect(validateEmail("user@example")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateEmail("")).toBe(false);
  });
});

describe("validateVerificationCode", () => {
  it("accepts exactly 6 numeric digits", () => {
    expect(validateVerificationCode("123456")).toBe(true);
    expect(validateVerificationCode("000000")).toBe(true);
  });

  it("rejects codes shorter than 6 digits", () => {
    expect(validateVerificationCode("12345")).toBe(false);
  });

  it("rejects codes longer than 6 digits", () => {
    expect(validateVerificationCode("1234567")).toBe(false);
  });

  it("rejects codes with non-digit characters", () => {
    expect(validateVerificationCode("12345a")).toBe(false);
    expect(validateVerificationCode("abcdef")).toBe(false);
    expect(validateVerificationCode("12 456")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateVerificationCode("")).toBe(false);
  });
});

describe("validatePasswordPair", () => {
  it("accepts matching passwords with valid length", () => {
    const result = validatePasswordPair("password123", "password123");
    expect(result).toEqual({ valid: true });
  });

  it("accepts password at minimum length (8 chars)", () => {
    const result = validatePasswordPair("12345678", "12345678");
    expect(result).toEqual({ valid: true });
  });

  it("accepts password at maximum length (128 chars)", () => {
    const longPassword = "a".repeat(128);
    const result = validatePasswordPair(longPassword, longPassword);
    expect(result).toEqual({ valid: true });
  });

  it("returns passwords_do_not_match error when passwords differ", () => {
    const result = validatePasswordPair("password123", "password456");
    expect(result).toEqual({
      valid: false,
      error: "passwords_do_not_match",
    });
  });

  it("returns password_length error when password is too short", () => {
    const result = validatePasswordPair("short", "short");
    expect(result).toEqual({ valid: false, error: "password_length" });
  });

  it("returns password_length error when password is too long", () => {
    const longPassword = "a".repeat(129);
    const result = validatePasswordPair(longPassword, longPassword);
    expect(result).toEqual({ valid: false, error: "password_length" });
  });

  it("returns passwords_do_not_match when passwords differ even with invalid length", () => {
    const result = validatePasswordPair("short", "other");
    expect(result).toEqual({
      valid: false,
      error: "passwords_do_not_match",
    });
  });
});

describe("validateCameraForm", () => {
  it("returns empty errors for valid fields", () => {
    const result = validateCameraForm({
      name: "Camera 1",
      location: "Building A",
      zoneId: "zone-123",
      streamUrl: "rtsp://example.com/stream",
    });
    expect(result).toEqual({});
  });

  it("returns error for empty name", () => {
    const result = validateCameraForm({
      name: "",
      location: "Building A",
      zoneId: "zone-123",
      streamUrl: "rtsp://example.com/stream",
    });
    expect(result.name).toBeDefined();
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("returns error for whitespace-only fields", () => {
    const result = validateCameraForm({
      name: "   ",
      location: "\t",
      zoneId: " \n ",
      streamUrl: "  ",
    });
    expect(result.name).toBeDefined();
    expect(result.location).toBeDefined();
    expect(result.zoneId).toBeDefined();
    expect(result.streamUrl).toBeDefined();
    expect(Object.keys(result)).toHaveLength(4);
  });

  it("returns errors only for empty fields", () => {
    const result = validateCameraForm({
      name: "Camera 1",
      location: "",
      zoneId: "zone-123",
      streamUrl: "",
    });
    expect(result.name).toBeUndefined();
    expect(result.location).toBeDefined();
    expect(result.zoneId).toBeUndefined();
    expect(result.streamUrl).toBeDefined();
    expect(Object.keys(result)).toHaveLength(2);
  });
});
