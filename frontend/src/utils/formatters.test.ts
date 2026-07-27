import { describe, it, expect } from "vitest";
import { formatDate, truncateName } from "./formatters";

describe("formatDate", () => {
  it("formats an ISO date to DD/MM/YYYY", () => {
    expect(formatDate("2024-03-15T10:30:00Z")).toBe("15/03/2024");
  });

  it("zero-pads single-digit days and months", () => {
    expect(formatDate("2024-01-05T00:00:00Z")).toBe("05/01/2024");
  });

  it("handles December 31st correctly", () => {
    expect(formatDate("2023-12-31T23:59:59Z")).toBe("31/12/2023");
  });

  it("handles January 1st correctly", () => {
    expect(formatDate("2024-01-01T00:00:00Z")).toBe("01/01/2024");
  });

  it("handles date-only ISO string", () => {
    expect(formatDate("2022-06-20")).toBe("20/06/2022");
  });

  it("handles leap year date", () => {
    expect(formatDate("2024-02-29T12:00:00Z")).toBe("29/02/2024");
  });
});

describe("truncateName", () => {
  it("returns original string when length is 30 or less", () => {
    expect(truncateName("Short name")).toBe("Short name");
    expect(truncateName("Exactly thirty characters!!!")).toBe(
      "Exactly thirty characters!!!"
    );
  });

  it("returns original string when length is exactly 30", () => {
    const thirtyChars = "a".repeat(30);
    expect(truncateName(thirtyChars)).toBe(thirtyChars);
  });

  it("truncates and adds ellipsis when length exceeds 30", () => {
    const longName = "This is a very long camera name that exceeds thirty characters";
    const result = truncateName(longName);
    expect(result).toBe("This is a very long camera ...");
    expect(result.length).toBe(30);
  });

  it("produces exactly 30 characters for any string longer than 30", () => {
    const name = "a".repeat(50);
    const result = truncateName(name);
    expect(result.length).toBe(30);
    expect(result).toBe("a".repeat(27) + "...");
  });

  it("handles empty string", () => {
    expect(truncateName("")).toBe("");
  });

  it("respects custom maxLength parameter", () => {
    const result = truncateName("Hello World", 8);
    expect(result).toBe("Hello...");
    expect(result.length).toBe(8);
  });

  it("does not truncate when string equals custom maxLength", () => {
    expect(truncateName("Hello", 5)).toBe("Hello");
  });
});
