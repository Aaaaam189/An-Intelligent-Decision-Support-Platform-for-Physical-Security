package client

import "time"

// MaxRetryAttempts is the maximum number of incident-creation attempts the
// decision-engine makes before routing the message to the dead-letter
// destination (Requirement 3.9).
const MaxRetryAttempts = 5

// maxBackoffSeconds caps the delay between retry attempts (Requirement 3.9).
const maxBackoffSeconds = 30

// backoffDelay returns the delay to wait before retry attempt n, where attempt
// numbering starts at 1. The delay doubles from 1 second (2^(n-1)) and is
// capped at 30 seconds, producing the schedule 1s, 2s, 4s, 8s, 16s for
// attempts 1..5 (Requirement 3.9).
//
// Attempts less than or equal to 1 return the base delay of 1 second so the
// function is total over all inputs and never returns a negative or zero
// duration for a valid retry step.
func backoffDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}

	// Compute 2^(attempt-1) using integer shifts, guarding against overflow by
	// clamping to the cap as soon as the exponent exceeds the cap.
	seconds := maxBackoffSeconds
	shift := attempt - 1
	if shift < 5 { // 2^5 = 32 already exceeds the 30s cap
		if v := 1 << shift; v < maxBackoffSeconds {
			seconds = v
		}
	}

	return time.Duration(seconds) * time.Second
}
