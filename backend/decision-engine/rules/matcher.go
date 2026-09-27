package rules

import (
	"sentinelai/decision-engine/models"
)

// weaponClassAny is the sentinel weapon-class filter value that matches any
// weapon class carried by a WEAPON_DETECTED event (Requirement 3.8).
const weaponClassAny = "any"

// zoneScopeAll is the zone-scope value marking a rule as targeting every
// zone, so its zone condition is satisfied by any event zone (Requirement
// 3.7).
const zoneScopeAll = "ALL"

// detectionTypeWeapon is the detection type for weapon events; only weapon
// rules honour the weapon-class filter and the always-trigger bypass.
const detectionTypeWeapon = "WEAPON_DETECTED"

// ruleMatches reports whether a single rule matches a detection event by
// applying AND logic across every applicable condition (Requirement 2.10):
// the rule matches only if every condition is simultaneously satisfied.
//
// The conditions are:
//
//   - Detection type: the event's type must equal the rule's detection type.
//   - Weapon class (weapon rules only): the event's weaponClass must equal
//     the rule's filter, or the filter must be "any" (Requirement 3.8).
//   - Zone: the event's zoneId must be one of the rule's target zones, or the
//     rule must target all zones (ZoneScope == "ALL") (Requirement 3.7).
//   - Time window: the event's timestamp must fall within the rule's active
//     time window, reusing the pure helpers in timewindow.go (Requirement
//     3.10).
//
// As an exception, a weapon rule (DetectionType == WEAPON_DETECTED) whose
// AlwaysTrigger flag is set bypasses the zone and time-window conditions and
// matches on detection type and weapon class alone (Requirements 2.8, 3.5).
// The detection-type and weapon-class conditions are never bypassed.
//
// ruleMatches is a pure function with no side effects. It does not consider
// the rule's Enabled flag; callers are responsible for excluding disabled
// rules from evaluation.
func ruleMatches(rule models.Rule, event models.DetectionEvent) bool {
	// Detection-type condition (always applies).
	if rule.DetectionType != event.Type {
		return false
	}

	// Weapon-class condition (weapon rules only, always applies).
	if rule.DetectionType == detectionTypeWeapon && !weaponClassMatches(rule, event) {
		return false
	}

	// A weapon rule with AlwaysTrigger set bypasses the zone and
	// time-window conditions once the type and weapon-class conditions
	// above are satisfied.
	if rule.DetectionType == detectionTypeWeapon && rule.AlwaysTrigger {
		return true
	}

	// Zone condition.
	if !zoneMatches(rule, event) {
		return false
	}

	// Time-window condition.
	if !eventTimeWindowMatches(rule.WindowStartMin, rule.WindowEndMin, event.Timestamp) {
		return false
	}

	return true
}

// weaponClassMatches reports whether the event's weapon class satisfies the
// rule's weapon-class filter. The filter is satisfied when it is "any" or
// when it equals the event's weaponClass (Requirement 3.8). A weapon rule
// with no filter set (nil) is treated as not matching, since a weapon rule is
// expected to carry a filter.
func weaponClassMatches(rule models.Rule, event models.DetectionEvent) bool {
	if rule.WeaponClass == nil {
		return false
	}
	filter := *rule.WeaponClass
	return filter == weaponClassAny || filter == event.WeaponClass
}

// zoneMatches reports whether the event's zone satisfies the rule's zone
// condition. An "ALL" scope matches any zone (Requirement 3.7); otherwise the
// event's zoneId must appear in the rule's target zones.
func zoneMatches(rule models.Rule, event models.DetectionEvent) bool {
	if rule.ZoneScope == zoneScopeAll {
		return true
	}
	for _, z := range rule.TargetZones {
		if z == event.ZoneID {
			return true
		}
	}
	return false
}
