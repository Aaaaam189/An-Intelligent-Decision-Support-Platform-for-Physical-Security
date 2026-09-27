package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/models"
	"sentinelai/shared/internalauth"
)

// TestEnabledRulesEndpointIncludesIncidentType is an httptest-based integration
// test for the internal enabled-rules endpoint. It wires the real gin route
// (GET /internal/rules/enabled) behind the real internal-service auth
// middleware and serializes rules through the production dto.ToRuleResponse
// path, so the assertion exercises the same JSON encoding the decision-engine
// consumes.
//
// It is the end-to-end complement to Property 13 (the enabled-rules payload
// carries each rule's incident type) and validates Requirement 5.1.
//
// The test uses an in-memory rule set rather than a live database so the
// default `go test ./...` runs without a DB or DSN. The route registration and
// response serialization mirror routes.SetupRoutes / RuleHandler.GetEnabledRules
// exactly.
func TestEnabledRulesEndpointIncludesIncidentType(t *testing.T) {
	gin.SetMode(gin.TestMode)

	const internalKey = "test-internal-key"

	// A representative set of enabled rules, one per incident type across
	// different detection types, so we confirm incidentType is carried through
	// for every returned rule regardless of detection type.
	weaponClass := models.WeaponClassGun
	rules := []models.Rule{
		{
			ID:                uuid.New(),
			Name:              "weapon rule",
			Enabled:           true,
			DetectionType:     models.DetectionTypeWeapon,
			WeaponClass:       &weaponClass,
			ZoneScope:         models.ZoneScopeAll,
			ResultingPriority: models.RulePriorityCritical,
			IncidentType:      models.TypeWeaponDetected,
		},
		{
			ID:                uuid.New(),
			Name:              "person rule",
			Enabled:           true,
			DetectionType:     models.DetectionTypePerson,
			ZoneScope:         models.ZoneScopeAll,
			ResultingPriority: models.RulePriorityHigh,
			IncidentType:      models.TypeIntrusion,
		},
		{
			ID:                uuid.New(),
			Name:              "vehicle rule",
			Enabled:           true,
			DetectionType:     models.DetectionTypeVehicle,
			ZoneScope:         models.ZoneScopeAll,
			ResultingPriority: models.RulePriorityMedium,
			IncidentType:      models.TypeUnauthorizedVehicle,
		},
	}

	// Build the enabled-rules handler over the in-memory set, mirroring
	// RuleHandler.GetEnabledRules: map each rule through dto.ToRuleResponse and
	// return HTTP 200 with the JSON array.
	enabledRulesHandler := func(c *gin.Context) {
		response := make([]dto.RuleResponse, 0, len(rules))
		for _, r := range rules {
			response = append(response, dto.ToRuleResponse(r))
		}
		c.JSON(http.StatusOK, response)
	}

	// Register the route exactly as production does: under /internal/rules,
	// guarded by RequireInternalService.
	router := gin.New()
	internalRules := router.Group("/internal/rules")
	internalRules.Use(internalauth.RequireInternalService(internalKey))
	internalRules.GET("/enabled", enabledRulesHandler)

	// Missing the internal key must be rejected (confirms we exercise the real
	// internal route wiring rather than an unguarded handler).
	t.Run("rejects request without internal key", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/internal/rules/enabled", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 without internal key, got %d", rec.Code)
		}
	})

	t.Run("includes incidentType for each returned rule", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/internal/rules/enabled", nil)
		req.Header.Set("X-Internal-Service-Key", internalKey)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d (body: %s)", rec.Code, rec.Body.String())
		}

		// Decode into a generic []map so we assert the wire-level JSON key
		// "incidentType" is present (not just a Go struct field).
		var raw []map[string]json.RawMessage
		if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
			t.Fatalf("failed to decode response body: %v (body: %s)", err, rec.Body.String())
		}

		if len(raw) != len(rules) {
			t.Fatalf("expected %d rules in response, got %d", len(rules), len(raw))
		}

		for i, entry := range raw {
			rawType, ok := entry["incidentType"]
			if !ok {
				t.Errorf("rule[%d] missing incidentType key in JSON body", i)
				continue
			}

			var incidentType string
			if err := json.Unmarshal(rawType, &incidentType); err != nil {
				t.Errorf("rule[%d] incidentType is not a JSON string: %v", i, err)
				continue
			}

			want := string(rules[i].IncidentType)
			if incidentType != want {
				t.Errorf("rule[%d] incidentType = %q, want %q", i, incidentType, want)
			}

			if !isFixedIncidentType(models.IncidentType(incidentType)) {
				t.Errorf("rule[%d] incidentType %q is not a member of the Fixed_Incident_Type_Set", i, incidentType)
			}
		}
	})
}

// isFixedIncidentType reports whether v is a member of the
// Fixed_Incident_Type_Set defined by the feature.
func isFixedIncidentType(v models.IncidentType) bool {
	switch v {
	case models.TypeWeaponDetected,
		models.TypeIntrusion,
		models.TypeAfterHoursPresence,
		models.TypeUnauthorizedVehicle,
		models.TypeCrowdOverflow,
		models.TypeSuspiciousActivity,
		models.TypeOther:
		return true
	default:
		return false
	}
}
