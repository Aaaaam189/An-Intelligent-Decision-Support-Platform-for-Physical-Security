package rules

import (
	"sentinelai/decision-engine/models"
)

type Decision struct {
	IncidentType string
	Priority     string
	RiskScore    float64
}

// Evaluate applies simple, explicit logic per event type. This stands
// in for full dynamic rule parsing — good enough to prove the whole
// pipeline (event -> decision -> incident -> assignment) works end to
// end, and easy to swap for real rule parsing later without touching
// anything else in this service.
func Evaluate(event models.DetectionEvent) Decision {
	hour := event.Timestamp.Hour()
	afterHours := hour < 6 || hour >= 22

	switch event.Type {
	case "FACE_MATCH_MULTI_CAMERA":
		return Decision{
			IncidentType: "MULTI_CAMERA_MATCH",
			Priority:     "HIGH",
			RiskScore:    0.75,
		}

	case "CROWD_COUNT":
		count := 0
		if v, ok := event.Metadata["count"].(float64); ok {
			count = int(v)
		}
		if count > 20 {
			return Decision{IncidentType: "CROWD_OVERFLOW", Priority: "HIGH", RiskScore: 0.8}
		}
		return Decision{IncidentType: "CROWD_OVERFLOW", Priority: "MEDIUM", RiskScore: 0.5}

	case "PERSON_DETECTED":
		if afterHours {
			return Decision{IncidentType: "RESTRICTED_ZONE_BREACH", Priority: "CRITICAL", RiskScore: 0.9}
		}
		return Decision{IncidentType: "SUSPICIOUS_ACTIVITY", Priority: "LOW", RiskScore: 0.3}

	default:
		return Decision{IncidentType: "OTHER", Priority: "LOW", RiskScore: 0.2}
	}
}