package rules

import (
	"testing"
	"time"

	"sentinelai/decision-engine/models"

	"pgregory.net/rapid"
)

// fixedIncidentTypes is the closed set of incident types an admin may assign
// to a rule (the Fixed_Incident_Type_Set from the design).
var fixedIncidentTypes = []string{
	"WEAPON_DETECTED",
	"INTRUSION",
	"AFTER_HOURS_PRESENCE",
	"UNAUTHORIZED_VEHICLE",
	"CROWD_OVERFLOW",
	"SUSPICIOUS_ACTIVITY",
	"OTHER",
}

// detectionTypes is the closed set of detection event types.
var detectionTypes = []string{
	"PERSON_DETECTED",
	"WEAPON_DETECTED",
	"VEHICLE_DETECTED",
}

// priorities is the closed set of resulting priorities, ordered ascending by
// rank so index+1 gives the priorityRank used by the engine.
var priorities = []string{"LOW", "MEDIUM", "HIGH", "CRITICAL"}

// rankOf returns the engine's comparable rank for a priority, mirroring
// priorityRank in engine.go.
func rankOf(p string) int {
	return priorityRank[p]
}

// genIncidentType draws a member of the Fixed_Incident_Type_Set.
func genIncidentType(t *rapid.T) string {
	return rapid.SampledFrom(fixedIncidentTypes).Draw(t, "incidentType")
}

// genPriority draws a resulting priority.
func genPriority(t *rapid.T) string {
	return rapid.SampledFrom(priorities).Draw(t, "priority")
}

// matchingRuleFor builds an enabled rule that matches the given event by using
// ZoneScope ALL and a full-day time window, with the same detection type as
// the event. For weapon events it sets a permissive "any" weapon-class filter.
func matchingRuleFor(id string, event models.DetectionEvent, priority, incidentType string) models.Rule {
	r := models.Rule{
		ID:                id,
		Name:              "rule-" + id,
		Enabled:           true,
		DetectionType:     event.Type,
		ZoneScope:         "ALL",
		WindowStartMin:    0,
		WindowEndMin:      0, // start == end => full-day window, matches any time
		ResultingPriority: priority,
		IncidentType:      incidentType,
	}
	if event.Type == "WEAPON_DETECTED" {
		any := "any"
		r.WeaponClass = &any
	}
	return r
}

// genEvent draws a valid detection event across all detection types. Weapon
// events carry a weapon class; the crafted matching rules use the "any" filter
// so the specific class is irrelevant to matching.
func genEvent(t *rapid.T) models.DetectionEvent {
	dt := rapid.SampledFrom(detectionTypes).Draw(t, "detectionType")
	event := models.DetectionEvent{
		CameraID:  rapid.StringMatching(`cam-[0-9]{1,4}`).Draw(t, "cameraId"),
		ZoneID:    rapid.StringMatching(`zone-[0-9]{1,4}`).Draw(t, "zoneId"),
		Type:      dt,
		Timestamp: time.Date(2024, 1, 2, rapid.IntRange(0, 23).Draw(t, "hour"), rapid.IntRange(0, 59).Draw(t, "minute"), 0, 0, time.UTC),
	}
	if dt == "WEAPON_DETECTED" {
		event.WeaponClass = rapid.SampledFrom([]string{"gun", "knife", "rifle"}).Draw(t, "weaponClass")
	}
	return event
}

// TestProperty8_MatchedRuleDeterminesIncidentType verifies that for any
// detection event and a single enabled rule that matches it, the decision's
// incident type equals the matched rule's incidentType regardless of the
// event's detection type.
//
// Feature: rule-incident-type, Property 8: A matched rule determines the
// incident type independent of the event.
// Validates: Requirements 4.1, 4.2
func TestProperty8_MatchedRuleDeterminesIncidentType(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		event := genEvent(t)
		incidentType := genIncidentType(t)
		priority := genPriority(t)

		rule := matchingRuleFor("r1", event, priority, incidentType)
		engine := NewEngine([]models.Rule{rule})

		decision, matched := engine.Decide(event)
		if !matched {
			t.Fatalf("expected the single crafted rule to match event %+v", event)
		}
		if decision.IncidentType != incidentType {
			t.Fatalf("decision incident type = %q, want rule incident type %q (event type %q)",
				decision.IncidentType, incidentType, event.Type)
		}
	})
}

// TestProperty9_HighestPriorityWins verifies that for any set of enabled rules
// matching a single detection event, the decision's priority is the maximum
// resulting priority under CRITICAL > HIGH > MEDIUM > LOW.
//
// Feature: rule-incident-type, Property 9: The highest matched priority wins.
// Validates: Requirements 4.3
func TestProperty9_HighestPriorityWins(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		event := genEvent(t)
		n := rapid.IntRange(1, 8).Draw(t, "numRules")

		rulePriorities := make([]string, n)
		snapshot := make([]models.Rule, n)
		for i := 0; i < n; i++ {
			p := genPriority(t)
			rulePriorities[i] = p
			snapshot[i] = matchingRuleFor(rapid.StringMatching(`r[0-9]{1,4}`).Draw(t, "ruleId"), event, p, genIncidentType(t))
		}

		// Compute the expected max rank independently.
		expectedRank := 0
		for _, p := range rulePriorities {
			if r := rankOf(p); r > expectedRank {
				expectedRank = r
			}
		}

		engine := NewEngine(snapshot)
		decision, matched := engine.Decide(event)
		if !matched {
			t.Fatalf("expected at least one crafted rule to match event %+v", event)
		}
		if got := rankOf(decision.Priority); got != expectedRank {
			t.Fatalf("decision priority %q (rank %d), want rank %d among %v",
				decision.Priority, got, expectedRank, rulePriorities)
		}
	})
}

// TestProperty10_IncidentTypeFollowsWinningRule verifies that for any set of
// matching rules, the decision's incident type equals that of the rule that
// produced the winning (highest) priority. To make the winner well-defined the
// generator guarantees exactly one rule holds the strictly highest priority.
//
// Feature: rule-incident-type, Property 10: Incident type follows the
// winning-priority rule.
// Validates: Requirements 4.4
func TestProperty10_IncidentTypeFollowsWinningRule(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		event := genEvent(t)
		n := rapid.IntRange(1, 8).Draw(t, "numRules")

		// The unique winner gets CRITICAL; all others are drawn strictly below
		// CRITICAL so the highest priority is held by exactly one rule.
		winnerIdx := rapid.IntRange(0, n-1).Draw(t, "winnerIdx")
		winnerType := genIncidentType(t)

		snapshot := make([]models.Rule, n)
		for i := 0; i < n; i++ {
			id := rapid.StringMatching(`r[0-9]{1,4}`).Draw(t, "ruleId")
			if i == winnerIdx {
				snapshot[i] = matchingRuleFor(id, event, "CRITICAL", winnerType)
				continue
			}
			// Strictly lower priority: LOW, MEDIUM, or HIGH.
			p := rapid.SampledFrom([]string{"LOW", "MEDIUM", "HIGH"}).Draw(t, "loserPriority")
			snapshot[i] = matchingRuleFor(id, event, p, genIncidentType(t))
		}

		engine := NewEngine(snapshot)
		decision, matched := engine.Decide(event)
		if !matched {
			t.Fatalf("expected at least one crafted rule to match event %+v", event)
		}
		if decision.Priority != "CRITICAL" {
			t.Fatalf("expected winning priority CRITICAL, got %q", decision.Priority)
		}
		if decision.IncidentType != winnerType {
			t.Fatalf("decision incident type = %q, want winning rule's type %q",
				decision.IncidentType, winnerType)
		}
	})
}

// TestProperty11_TiesBrokenByEvaluationOrder verifies that when two or more
// matched rules tie for the highest resulting priority, the decision's incident
// type is that of the first tied rule in evaluation order, and the selection is
// stable across repeated evaluations.
//
// Feature: rule-incident-type, Property 11: Ties are broken deterministically
// by evaluation order.
// Validates: Requirements 4.5
func TestProperty11_TiesBrokenByEvaluationOrder(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		event := genEvent(t)

		// Pick the tied top priority and how many rules share it (>= 2).
		topPriority := genPriority(t)
		numTied := rapid.IntRange(2, 5).Draw(t, "numTied")
		// Optionally add strictly-lower-priority rules interleaved before/after.
		numLowerBefore := rapid.IntRange(0, 3).Draw(t, "numLowerBefore")
		numLowerAfter := rapid.IntRange(0, 3).Draw(t, "numLowerAfter")

		lowerPriorities := lowerThan(topPriority)

		var snapshot []models.Rule
		addLower := func(count int) {
			for i := 0; i < count; i++ {
				if len(lowerPriorities) == 0 {
					// topPriority is LOW; nothing strictly lower, skip.
					return
				}
				p := rapid.SampledFrom(lowerPriorities).Draw(t, "lowerPriority")
				snapshot = append(snapshot, matchingRuleFor(rapid.StringMatching(`lo[0-9]{1,4}`).Draw(t, "loId"), event, p, genIncidentType(t)))
			}
		}

		addLower(numLowerBefore)

		// The tied rules; the first of these in evaluation order should win.
		firstTiedType := ""
		for i := 0; i < numTied; i++ {
			it := genIncidentType(t)
			if i == 0 {
				firstTiedType = it
			}
			snapshot = append(snapshot, matchingRuleFor(rapid.StringMatching(`t[0-9]{1,4}`).Draw(t, "tiedId"), event, topPriority, it))
		}

		addLower(numLowerAfter)

		engine := NewEngine(snapshot)

		decision, matched := engine.Decide(event)
		if !matched {
			t.Fatalf("expected at least one crafted rule to match event %+v", event)
		}
		if decision.Priority != topPriority {
			t.Fatalf("expected winning priority %q, got %q", topPriority, decision.Priority)
		}
		if decision.IncidentType != firstTiedType {
			t.Fatalf("decision incident type = %q, want first tied rule's type %q",
				decision.IncidentType, firstTiedType)
		}

		// Stability: repeated evaluations produce the same incident type.
		for rep := 0; rep < 5; rep++ {
			d2, m2 := engine.Decide(event)
			if !m2 || d2.IncidentType != firstTiedType || d2.Priority != topPriority {
				t.Fatalf("repeat %d: unstable decision matched=%v type=%q priority=%q, want type=%q priority=%q",
					rep, m2, d2.IncidentType, d2.Priority, firstTiedType, topPriority)
			}
		}
	})
}

// lowerThan returns the priorities strictly below p in rank order.
func lowerThan(p string) []string {
	target := rankOf(p)
	var out []string
	for _, cand := range priorities {
		if rankOf(cand) < target {
			out = append(out, cand)
		}
	}
	return out
}

// TestProperty12_NoMatchNoIncident verifies that for any event with no matching
// enabled rule, Decide returns matched=false and requests no incident.
//
// Feature: rule-incident-type, Property 12: No match produces no incident.
// Validates: Requirements 4.6
func TestProperty12_NoMatchNoIncident(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		event := genEvent(t)

		n := rapid.IntRange(0, 6).Draw(t, "numRules")
		snapshot := make([]models.Rule, 0, n)
		for i := 0; i < n; i++ {
			// Force non-match by one of two mutually independent means:
			//  - a rule for a different detection type, or
			//  - an otherwise-matching rule that is disabled.
			nonMatchKind := rapid.SampledFrom([]string{"otherType", "disabled"}).Draw(t, "nonMatchKind")
			rule := matchingRuleFor(rapid.StringMatching(`n[0-9]{1,4}`).Draw(t, "nId"), event, genPriority(t), genIncidentType(t))
			switch nonMatchKind {
			case "otherType":
				rule.DetectionType = otherDetectionType(event.Type)
				// Clear weapon filter so we don't accidentally create a weapon
				// rule mismatch quirk; a differing detection type alone blocks
				// the match.
				rule.WeaponClass = nil
			case "disabled":
				rule.Enabled = false
			}
			snapshot = append(snapshot, rule)
		}

		engine := NewEngine(snapshot)
		decision, matched := engine.Decide(event)
		if matched {
			t.Fatalf("expected no match, but got matched decision %+v for event %+v", decision, event)
		}
		if decision != (Decision{}) {
			t.Fatalf("expected zero-value Decision on no match, got %+v", decision)
		}
	})
}

// otherDetectionType returns a detection type different from the given one so a
// rule built for it cannot match the event on detection type.
func otherDetectionType(t string) string {
	for _, dt := range detectionTypes {
		if dt != t {
			return dt
		}
	}
	return t
}
