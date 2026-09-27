package rules

import "time"

// minutesInDay is the number of minutes in a 24-hour day. Valid
// window bounds and times-of-day are in the range [0, minutesInDay).
const minutesInDay = 24 * 60

// minuteOfDay converts a time to its minute-of-day in the range
// [0, 1439], counting minutes since midnight in the time's own location.
func minuteOfDay(t time.Time) int {
	return t.Hour()*60 + t.Minute()
}

// timeWindowMatches reports whether an event's time-of-day falls within a
// rule's active time window, following the semantics from the design:
//
//   - startMin == endMin: the window covers the full 24-hour day, so any
//     time matches (Requirement 2.5).
//   - startMin < endMin: the window is a same-day interval and matches when
//     startMin <= t < endMin (Requirement 3.10).
//   - startMin > endMin: the window spans midnight and matches when
//     t >= startMin || t <= endMin (Requirements 2.6, 3.10).
//
// tMin is the event's minute-of-day (minutes since midnight, 0..1439).
func timeWindowMatches(startMin, endMin, tMin int) bool {
	switch {
	case startMin == endMin:
		return true
	case startMin < endMin:
		return tMin >= startMin && tMin < endMin
	default: // startMin > endMin, spans midnight
		return tMin >= startMin || tMin <= endMin
	}
}

// eventTimeWindowMatches is a convenience wrapper that derives the
// event's minute-of-day from a timestamp before applying the window
// semantics of timeWindowMatches.
func eventTimeWindowMatches(startMin, endMin int, t time.Time) bool {
	return timeWindowMatches(startMin, endMin, minuteOfDay(t))
}
