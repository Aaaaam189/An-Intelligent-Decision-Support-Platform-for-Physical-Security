import type { UserRole } from "../types/auth.types";

/**
 * Extracts and validates the role from a JWT token payload.
 *
 * Decodes the JWT payload (base64url), parses it as JSON, and validates
 * that the "role" field is either "ADMIN" or "SECURITY_GUARD".
 *
 * @param token - A JWT token string (header.payload.signature)
 * @returns The validated role ("ADMIN" or "SECURITY_GUARD")
 * @throws Error if the token structure is invalid, payload cannot be decoded,
 *         or the role field is missing/invalid.
 */
export function extractRoleFromJWT(token: string): UserRole {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid JWT token structure");
  }

  const payloadBase64 = parts[1];

  let payloadJson: string;
  try {
    // Handle base64url encoding (replace - with + and _ with /)
    const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    payloadJson = atob(base64);
  } catch {
    throw new Error("Failed to decode JWT payload");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error("Failed to parse JWT payload as JSON");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("JWT payload is not a valid object");
  }

  const role = (payload as Record<string, unknown>).role;

  if (role !== "ADMIN" && role !== "SECURITY_GUARD") {
    throw new Error(
      "Invalid or missing role in JWT payload. Expected 'ADMIN' or 'SECURITY_GUARD'"
    );
  }

  return role as UserRole;
}
