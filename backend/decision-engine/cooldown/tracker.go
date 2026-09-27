// Package cooldown implements a per-zone, per-detection-type de-duplication
// window for the decision-engine. It suppresses repeated incident creation for
// the same ongoing situation (same zone + detection type) within a
// configurable Cooldown_Window (Requirement 4).
package cooldown

import (
	"sync"
	"time"
)

// key identifies a cooldown bucket by camera, zone and detection type. A single
// composite map key keeps lookups O(1) and avoids nested maps. Including the
// camera keeps each camera's situations independent, so two cameras (even in
// the same zone) don't suppress each other's incidents.
type key struct {
	cameraID      string
	zoneID        string
	detectionType string
}

// Tracker maintains a Cooldown_Window keyed by (cameraId, zoneId, detectionType)
// mapping to the time the last incident was recorded for that combination
// (Requirement 4.1). It is safe for concurrent use by multiple goroutines.
type Tracker struct {
	mu   sync.Mutex
	last map[key]time.Time
	ttl  time.Duration
	// now is injectable for deterministic testing; defaults to time.Now.
	now func() time.Time
}

// NewTracker creates a Tracker whose Cooldown_Window lasts for the given TTL
// (Requirement 4.4, the admin-configurable duration derived from
// COOLDOWN_SECONDS). A non-positive TTL disables suppression entirely.
func NewTracker(ttl time.Duration) *Tracker {
	return &Tracker{
		last: make(map[key]time.Time),
		ttl:  ttl,
		now:  time.Now,
	}
}

// NewTrackerSeconds is a convenience constructor building a Tracker from a
// cooldown duration expressed in seconds (matching COOLDOWN_SECONDS config).
func NewTrackerSeconds(seconds int) *Tracker {
	return NewTracker(time.Duration(seconds) * time.Second)
}

// ShouldSuppress reports whether an incident for the given zone and detection
// type should be suppressed because a matching incident was already recorded
// within the active Cooldown_Window (Requirement 4.3). It returns false when no
// prior incident is tracked, when the window has elapsed, or when the TTL is
// non-positive.
func (t *Tracker) ShouldSuppress(cameraID, zoneID, detectionType string) bool {
	if t.ttl <= 0 {
		return false
	}

	k := key{cameraID: cameraID, zoneID: zoneID, detectionType: detectionType}

	t.mu.Lock()
	defer t.mu.Unlock()

	last, ok := t.last[k]
	if !ok {
		return false
	}

	// Suppress only while within the window: now - last < ttl.
	return t.now().Sub(last) < t.ttl
}

// Record starts (or restarts) the Cooldown_Window for the given zone and
// detection type by storing the current time as the last-incident-time
// (Requirement 4.2). Callers invoke this after an incident is successfully
// created.
func (t *Tracker) Record(cameraID, zoneID, detectionType string) {
	k := key{cameraID: cameraID, zoneID: zoneID, detectionType: detectionType}

	t.mu.Lock()
	defer t.mu.Unlock()

	t.last[k] = t.now()
}
