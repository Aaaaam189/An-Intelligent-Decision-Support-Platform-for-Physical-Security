/**
 * Formatting utility functions for SentinelAI frontend.
 * All functions are pure and side-effect free.
 */

/**
 * Formats an ISO 8601 date string to DD/MM/YYYY format.
 * Day and month are zero-padded.
 *
 * @param isoDate - An ISO 8601 date string (e.g., "2024-03-15T10:30:00Z")
 * @returns Formatted date string in DD/MM/YYYY format
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());

  return `${day}/${month}/${year}`;
}

/**
 * Truncates a name to a maximum length with ellipsis.
 * Returns the original string unchanged if its length is within maxLength.
 * If it exceeds maxLength, returns the first (maxLength - 3) characters followed by "...".
 *
 * @param name - The string to truncate
 * @param maxLength - Maximum allowed length (default: 30)
 * @returns The original string or truncated string with ellipsis
 */
export function truncateName(name: string, maxLength: number = 30): string {
  if (name.length <= maxLength) {
    return name;
  }

  return name.slice(0, maxLength - 3) + "...";
}
