import { describe, it, expect } from "vitest";
import { extractRoleFromJWT } from "./jwt";

/** Helper to create a valid JWT-shaped token with a given payload */
function createToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const signature = "fake-signature";
  return `${header}.${body}.${signature}`;
}

describe("extractRoleFromJWT", () => {
  it('returns "ADMIN" for a token with role ADMIN', () => {
    const token = createToken({ role: "ADMIN", sub: "user-1" });
    expect(extractRoleFromJWT(token)).toBe("ADMIN");
  });

  it('returns "SECURITY_GUARD" for a token with role SECURITY_GUARD', () => {
    const token = createToken({ role: "SECURITY_GUARD", sub: "user-2" });
    expect(extractRoleFromJWT(token)).toBe("SECURITY_GUARD");
  });

  it("throws for a token with an invalid role", () => {
    const token = createToken({ role: "VIEWER", sub: "user-3" });
    expect(() => extractRoleFromJWT(token)).toThrow();
  });

  it("throws for a token with missing role field", () => {
    const token = createToken({ sub: "user-4" });
    expect(() => extractRoleFromJWT(token)).toThrow();
  });

  it("throws for a token with non-string role", () => {
    const token = createToken({ role: 123 });
    expect(() => extractRoleFromJWT(token)).toThrow();
  });

  it("throws for an invalid token structure (less than 3 parts)", () => {
    expect(() => extractRoleFromJWT("onlyonepart")).toThrow(
      "Invalid JWT token structure"
    );
    expect(() => extractRoleFromJWT("two.parts")).toThrow(
      "Invalid JWT token structure"
    );
  });

  it("throws for a token with invalid base64 payload", () => {
    expect(() =>
      extractRoleFromJWT("header.!!!invalid-base64!!!.signature")
    ).toThrow();
  });

  it("throws for a token with non-JSON payload", () => {
    const notJson = btoa("this is not json");
    expect(() =>
      extractRoleFromJWT(`header.${notJson}.signature`)
    ).toThrow();
  });

  it("handles base64url encoding (- and _ characters)", () => {
    // Manually create a base64url-encoded payload
    const payload = { role: "ADMIN", sub: "user-with-special-chars" };
    const header = btoa(JSON.stringify({ alg: "HS256" }));
    const body = btoa(JSON.stringify(payload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const token = `${header}.${body}.sig`;
    expect(extractRoleFromJWT(token)).toBe("ADMIN");
  });
});
