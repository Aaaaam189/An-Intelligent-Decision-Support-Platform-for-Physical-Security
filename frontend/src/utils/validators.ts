/**
 * Form validation utility functions for SentinelAI frontend.
 * All functions are pure and side-effect free.
 */

/**
 * Validates that an email address has a valid format.
 * Accepts if it contains exactly one "@" with non-empty local and domain parts,
 * and the domain contains at least one ".".
 */
export function validateEmail(email: string): boolean {
  const atIndex = email.indexOf("@");
  const lastAtIndex = email.lastIndexOf("@");

  // Must contain exactly one "@"
  if (atIndex === -1 || atIndex !== lastAtIndex) {
    return false;
  }

  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1);

  // Local part must be non-empty
  if (localPart.length === 0) {
    return false;
  }

  // Domain part must be non-empty and contain at least one "."
  if (domainPart.length === 0 || !domainPart.includes(".")) {
    return false;
  }

  return true;
}

/**
 * Validates that a verification code is exactly 6 numeric digits.
 */
export function validateVerificationCode(code: string): boolean {
  return code.length === 6 && /^\d{6}$/.test(code);
}

/**
 * Result of password pair validation.
 */
export interface PasswordValidationResult {
  valid: boolean;
  error?: "passwords_do_not_match" | "password_length";
}

/**
 * Validates a password pair for matching and length constraints.
 * - Passwords must be identical.
 * - Password length must be between 8 and 128 characters inclusive.
 * If strings differ, returns "passwords_do_not_match" error.
 * If length is outside [8, 128], returns "password_length" error.
 */
export function validatePasswordPair(
  password: string,
  confirm: string
): PasswordValidationResult {
  if (password !== confirm) {
    return { valid: false, error: "passwords_do_not_match" };
  }

  if (password.length < 8 || password.length > 128) {
    return { valid: false, error: "password_length" };
  }

  return { valid: true };
}

/**
 * Fields required for camera form validation.
 */
export interface CameraFormFields {
  name: string;
  location: string;
  zoneId: string;
  streamUrl: string;
}

/**
 * Validates camera form fields.
 * Returns an error record with an entry for each field that is empty or whitespace-only.
 * An empty record means all fields are valid.
 */
export function validateCameraForm(
  fields: CameraFormFields
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!fields.name || fields.name.trim().length === 0) {
    errors.name = "Name is required";
  }

  if (!fields.location || fields.location.trim().length === 0) {
    errors.location = "Location is required";
  }

  if (!fields.zoneId || fields.zoneId.trim().length === 0) {
    errors.zoneId = "Zone is required";
  }

  if (!fields.streamUrl || fields.streamUrl.trim().length === 0) {
    errors.streamUrl = "Stream URL is required";
  }

  return errors;
}
