package rules

import (
	"sync"

	"sentinelai/decision-engine/models"
)

type Decision struct {
	IncidentType string
	Priority     string
	RiskScore    float64
	// RuleID is the identifier of the rule that matched and produced this
	// decision, when the decision originates from a configured rule. It is
	// empty for decisions not backed by a specific rule. The incident client
	// forwards it to incident-service so the created incident links back to
	// the matched rule (Requirement 3.4).
	RuleID string
}

// priorityRank maps a resulting priority to a comparable rank so the engine
// can select the single highest priority across matched rules. Higher rank
// wins, giving the ordering CRITICAL > HIGH > MEDIUM > LOW (Requirement 3.6).
// An unknown/empty priority ranks below every valid priority so it is never
// selected over a real one.
var priorityRank = map[string]int{
	"LOW":      1,
	"MEDIUM":   2,
	"HIGH":     3,
	"CRITICAL": 4,
}

// Engine evaluates detection events against a snapshot of configured rules.
//
// The engine holds the current rule-set snapshot behind a read-write mutex so
// evaluation (a read) never blocks while the snapshot is being swapped by the
// rule cache (a write). The hot-reloadable rule cache feeds new snapshots via
// SetRules without requiring a service restart (Requirement 9.5).
//
// Only enabled rules participate in evaluation; disabled rules are excluded
// (Requirement 3.2).
type Engine struct {
	mu    sync.RWMutex
	rules []models.Rule
}

// NewEngine returns an Engine seeded with the given rule snapshot. Passing nil
// yields an engine with no rules, which matches nothing until SetRules is
// called.
func NewEngine(snapshot []models.Rule) *Engine {
	e := &Engine{}
	e.SetRules(snapshot)
	return e
}

// SetRules atomically replaces the engine's rule snapshot. The caller retains
// ownership of the passed slice; the engine copies the slice header so a later
// mutation of the caller's slice does not affect the stored snapshot. This is
// invoked by the rule cache on each successful refresh so subsequent
// evaluations use the updated rule set (Requirement 9.5).
func (e *Engine) SetRules(snapshot []models.Rule) {
	cp := make([]models.Rule, len(snapshot))
	copy(cp, snapshot)

	e.mu.Lock()
	e.rules = cp
	e.mu.Unlock()
}

// Evaluate applies every enabled rule in the current snapshot to the event
// using AND-combined matching, and selects the single highest resulting
// priority across all matched rules.
//
// Disabled rules never contribute to a match (Requirement 3.2). When no
// enabled rule matches, Evaluate reports matched=false so the caller creates
// no incident (Requirement 4.6). When one or more enabled rules match,
// Evaluate reports matched=true, the highest resulting priority among the
// matched rules where CRITICAL > HIGH > MEDIUM > LOW (Requirement 4.3), the
// incidentType of the rule that produced that winning priority (Requirements
// 4.4, 4.5), and the ID of that same rule. Selection uses strict > on rank so
// the first rule reaching the highest rank in evaluation order keeps it,
// giving deterministic tie-breaking by evaluation order (Requirement 4.5).
// The caller then requests creation of exactly one incident at that priority
// with that incident type (Requirements 4.1, 4.2, 4.3).
//
// Evaluate is safe for concurrent use.
func (e *Engine) Evaluate(event models.DetectionEvent) (matched bool, priority string, incidentType string, ruleID string) {
	e.mu.RLock()
	snapshot := e.rules
	e.mu.RUnlock()

	bestRank := 0
	for i := range snapshot {
		rule := snapshot[i]
		if !rule.Enabled {
			continue
		}
		if !ruleMatches(rule, event) {
			continue
		}

		matched = true
		if rank := priorityRank[rule.ResultingPriority]; rank > bestRank {
			bestRank = rank
			priority = rule.ResultingPriority
			incidentType = rule.IncidentType
			ruleID = rule.ID
		}
	}

	return matched, priority, incidentType, ruleID
}

// Decide evaluates the event and returns a Decision suitable for the incident
// client. When no enabled rule matches, it returns matched=false and a
// zero-value Decision so the caller can skip incident creation (Requirement
// 4.6). When a rule matches, it returns matched=true and a Decision carrying
// the winning priority, the winning rule's incidentType, and matched rule ID
// (Requirements 4.1, 4.2, 4.3, 4.4). The IncidentType comes from the rule that
// produced the winning priority rather than being derived from the detection
// event type.
func (e *Engine) Decide(event models.DetectionEvent) (Decision, bool) {
	matched, priority, incidentType, ruleID := e.Evaluate(event)
	if !matched {
		return Decision{}, false
	}

	return Decision{
		IncidentType: incidentType,
		Priority:     priority,
		RiskScore:    riskScoreForPriority(priority),
		RuleID:       ruleID,
	}, true
}

// riskScoreForPriority provides a coarse risk score aligned with the winning
// priority so downstream consumers that read RiskScore keep a sensible value.
func riskScoreForPriority(priority string) float64 {
	switch priority {
	case "CRITICAL":
		return 0.95
	case "HIGH":
		return 0.75
	case "MEDIUM":
		return 0.5
	case "LOW":
		return 0.25
	default:
		return 0.0
	}
}
