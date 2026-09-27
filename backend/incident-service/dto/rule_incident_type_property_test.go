package dto

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"pgregory.net/rapid"

	"sentinelai/incident-service/models"
)

// fixedIncidentTypeSet is the closed set of incident types available for
// selection and storage (the Fixed_Incident_Type_Set from the spec glossary).
var fixedIncidentTypeSet = []models.IncidentType{
	models.TypeWeaponDetected,
	models.TypeIntrusion,
	models.TypeAfterHoursPresence,
	models.TypeUnauthorizedVehicle,
	models.TypeCrowdOverflow,
	models.TypeSuspiciousActivity,
	models.TypeOther,
}

// validate returns the validator engine gin's binding uses, so tests exercise
// the exact binding tags declared on the DTOs (the source of truth for
// membership validation).
func validate() *validator.Validate {
	return binding.Validator.Engine().(*validator.Validate)
}

// isMember reports whether v is a member of the Fixed_Incident_Type_Set.
func isMember(v models.IncidentType) bool {
	for _, m := range fixedIncidentTypeSet {
		if m == v {
			return true
		}
	}
	return false
}

// incidentTypeFieldError reports whether err is a validation error that
// identifies the IncidentType field.
func incidentTypeFieldError(err error) bool {
	if err == nil {
		return false
	}
	verrs, ok := err.(validator.ValidationErrors)
	if !ok {
		// Any non-nil error at least signals rejection; but we want a
		// field-identifying error specifically.
		return strings.Contains(strings.ToLower(err.Error()), "incidenttype")
	}
	for _, fe := range verrs {
		if fe.Field() == "IncidentType" || fe.StructField() == "IncidentType" {
			return true
		}
	}
	return false
}

// genMemberIncidentType generates any member of the Fixed_Incident_Type_Set.
func genMemberIncidentType(t *rapid.T) models.IncidentType {
	idx := rapid.IntRange(0, len(fixedIncidentTypeSet)-1).Draw(t, "memberIdx")
	return fixedIncidentTypeSet[idx]
}

// genNonMemberIncidentType generates a string that is NOT a member of the
// Fixed_Incident_Type_Set (including the empty string / missing value).
func genNonMemberIncidentType(t *rapid.T) models.IncidentType {
	for {
		s := rapid.StringMatching(`[A-Z_]{0,20}`).Draw(t, "nonMember")
		if !isMember(models.IncidentType(s)) {
			return models.IncidentType(s)
		}
	}
}

// genDetectionType generates one of the three valid detection types.
func genDetectionType(t *rapid.T) models.DetectionType {
	dts := []models.DetectionType{
		models.DetectionTypePerson,
		models.DetectionTypeWeapon,
		models.DetectionTypeVehicle,
	}
	idx := rapid.IntRange(0, len(dts)-1).Draw(t, "detTypeIdx")
	return dts[idx]
}

// genValidCreateRequest builds a create request that is valid in every field
// EXCEPT IncidentType, which the caller sets. This isolates IncidentType so a
// binding failure is attributable to the incident type value.
func genValidCreateRequest(t *rapid.T) CreateRuleRequest {
	dt := genDetectionType(t)
	req := CreateRuleRequest{
		Name:              rapid.StringMatching(`[a-zA-Z0-9 ]{1,20}`).Draw(t, "name"),
		DetectionType:     dt,
		ZoneScope:         models.ZoneScopeAll,
		WindowStartMin:    rapid.IntRange(0, 1439).Draw(t, "winStart"),
		WindowEndMin:      rapid.IntRange(0, 1439).Draw(t, "winEnd"),
		ResultingPriority: genPriority(t),
	}
	if dt == models.DetectionTypeWeapon {
		wc := models.WeaponClassAny
		req.WeaponClass = &wc
	}
	return req
}

func genPriority(t *rapid.T) models.RulePriority {
	ps := []models.RulePriority{
		models.RulePriorityLow,
		models.RulePriorityMedium,
		models.RulePriorityHigh,
		models.RulePriorityCritical,
	}
	idx := rapid.IntRange(0, len(ps)-1).Draw(t, "prioIdx")
	return ps[idx]
}

// genStoredRule builds an arbitrary already-stored rule with a member
// IncidentType, across detection types / zone scopes / windows.
func genStoredRule(t *rapid.T) models.Rule {
	dt := genDetectionType(t)
	rule := models.Rule{
		ID:                uuid.New(),
		Name:              rapid.StringMatching(`[a-zA-Z0-9 ]{1,20}`).Draw(t, "sName"),
		Enabled:           true,
		DetectionType:     dt,
		ZoneScope:         models.ZoneScopeAll,
		WindowStartMin:    rapid.IntRange(0, 1439).Draw(t, "sWinStart"),
		WindowEndMin:      rapid.IntRange(0, 1439).Draw(t, "sWinEnd"),
		ResultingPriority: genPriority(t),
		IncidentType:      genMemberIncidentType(t),
	}
	if dt == models.DetectionTypeWeapon {
		wc := models.WeaponClassAny
		rule.WeaponClass = &wc
	}
	return rule
}

// Feature: rule-incident-type, Property 1: Creation rejects non-members and accepts members
//
// For any candidate incidentType value, a rule creation request is accepted only
// when the value is a member of the Fixed_Incident_Type_Set, and is otherwise
// rejected with a validation error identifying the incidentType field.
//
// Validates: Requirements 1.2, 1.3
func TestProperty1_CreationMembershipValidation(t *testing.T) {
	v := validate()
	rapid.Check(t, func(t *rapid.T) {
		req := genValidCreateRequest(t)

		// Randomly choose a member or a non-member (incl. empty) value.
		useMember := rapid.Bool().Draw(t, "useMember")
		if useMember {
			req.IncidentType = genMemberIncidentType(t)
		} else {
			req.IncidentType = genNonMemberIncidentType(t)
		}

		err := v.Struct(req)

		if isMember(req.IncidentType) {
			if err != nil {
				// Only fail if the incidentType field is the offender.
				if incidentTypeFieldError(err) {
					t.Fatalf("member value %q was rejected on incidentType: %v", req.IncidentType, err)
				}
			}
		} else {
			if err == nil {
				t.Fatalf("non-member value %q was accepted", req.IncidentType)
			}
			if !incidentTypeFieldError(err) {
				t.Fatalf("non-member value %q rejected but error did not identify incidentType: %v", req.IncidentType, err)
			}
		}
	})
}

// Feature: rule-incident-type, Property 2: Creation stores the chosen incident type
//
// For any rule creation request whose incidentType is a member of the
// Fixed_Incident_Type_Set, the stored rule's incidentType equals the submitted
// value.
//
// Validates: Requirements 1.4
func TestProperty2_CreationStoresIncidentType(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		req := genValidCreateRequest(t)
		req.IncidentType = genMemberIncidentType(t)

		rule := NewRuleFromCreateRequest(req)

		if rule.IncidentType != req.IncidentType {
			t.Fatalf("stored incidentType %q != submitted %q", rule.IncidentType, req.IncidentType)
		}
	})
}

// Feature: rule-incident-type, Property 3: Update applies a member and rejects a non-member
//
// For any stored rule and any rule update request that includes an incidentType
// value, the value is applied when it is a member of the Fixed_Incident_Type_Set
// (the stored value becomes the submitted value), and otherwise the request is
// rejected with a validation error identifying the incidentType field and the
// stored value is left unchanged.
//
// Validates: Requirements 1.5
func TestProperty3_UpdateAppliesMemberRejectsNonMember(t *testing.T) {
	v := validate()
	rapid.Check(t, func(t *rapid.T) {
		stored := genStoredRule(t)
		original := stored.IncidentType

		useMember := rapid.Bool().Draw(t, "useMember")
		var candidate models.IncidentType
		if useMember {
			candidate = genMemberIncidentType(t)
		} else {
			candidate = genNonMemberIncidentType(t)
		}

		req := UpdateRuleRequest{IncidentType: &candidate}
		err := v.Struct(req)

		if isMember(candidate) {
			// Member: binding passes and the value is applied.
			if err != nil && incidentTypeFieldError(err) {
				t.Fatalf("member update value %q rejected on incidentType: %v", candidate, err)
			}
			ApplyUpdateRequest(&stored, req)
			if stored.IncidentType != candidate {
				t.Fatalf("member update not applied: got %q want %q", stored.IncidentType, candidate)
			}
		} else {
			// Non-member: binding must reject, identifying the field, and the
			// stored value is left unchanged (update is not applied).
			if err == nil {
				t.Fatalf("non-member update value %q was accepted", candidate)
			}
			if !incidentTypeFieldError(err) {
				t.Fatalf("non-member update %q rejected but error did not identify incidentType: %v", candidate, err)
			}
			if stored.IncidentType != original {
				t.Fatalf("stored value changed on rejected update: got %q want %q", stored.IncidentType, original)
			}
		}
	})
}

// Feature: rule-incident-type, Property 4: Update omitting incident type preserves the stored value
//
// For any stored rule and any rule update request that omits the incidentType
// field, the stored incidentType value after the update equals the value before
// the update.
//
// Validates: Requirements 1.6
func TestProperty4_UpdateOmitPreservesStoredValue(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		stored := genStoredRule(t)
		original := stored.IncidentType

		// Update omits incidentType (nil pointer). Other fields may or may not
		// be present; vary one to ensure ApplyUpdateRequest still runs.
		req := UpdateRuleRequest{IncidentType: nil}
		if rapid.Bool().Draw(t, "setName") {
			n := rapid.StringMatching(`[a-zA-Z0-9 ]{1,20}`).Draw(t, "uName")
			req.Name = &n
		}

		ApplyUpdateRequest(&stored, req)

		if stored.IncidentType != original {
			t.Fatalf("incidentType changed on omitted-field update: got %q want %q", stored.IncidentType, original)
		}
	})
}

// Feature: rule-incident-type, Property 5: Incident type selection is independent of detection type
//
// For any detection type and any member of the Fixed_Incident_Type_Set, a rule
// pairing that detection type with that incident type is accepted (no cross-field
// constraint couples incidentType to detectionType).
//
// Validates: Requirements 2.1
func TestProperty5_IncidentTypeIndependentOfDetectionType(t *testing.T) {
	v := validate()
	rapid.Check(t, func(t *rapid.T) {
		req := genValidCreateRequest(t)
		req.IncidentType = genMemberIncidentType(t)

		err := v.Struct(req)
		if err != nil && incidentTypeFieldError(err) {
			t.Fatalf("pairing detectionType=%q with member incidentType=%q was rejected on incidentType: %v",
				req.DetectionType, req.IncidentType, err)
		}
	})
}

// Feature: rule-incident-type, Property 13: The enabled-rules payload carries each rule's incident type
//
// For any enabled rule, its serialized enabled-rules response includes an
// incidentType value equal to the rule's stored incidentType.
//
// Validates: Requirements 5.1
func TestProperty13_EnabledRulesPayloadCarriesIncidentType(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		rule := genStoredRule(t)

		resp := ToRuleResponse(rule)

		// The response DTO carries the value.
		if resp.IncidentType != rule.IncidentType {
			t.Fatalf("RuleResponse.IncidentType %q != rule %q", resp.IncidentType, rule.IncidentType)
		}

		// The JSON serialization exposes it under the "incidentType" key with
		// the stored value.
		raw, err := json.Marshal(resp)
		if err != nil {
			t.Fatalf("marshal RuleResponse: %v", err)
		}
		var decoded map[string]json.RawMessage
		if err := json.Unmarshal(raw, &decoded); err != nil {
			t.Fatalf("unmarshal RuleResponse: %v", err)
		}
		field, ok := decoded["incidentType"]
		if !ok {
			t.Fatalf("serialized enabled-rules response missing incidentType key: %s", raw)
		}
		var got string
		if err := json.Unmarshal(field, &got); err != nil {
			t.Fatalf("decode incidentType value: %v", err)
		}
		if got != string(rule.IncidentType) {
			t.Fatalf("serialized incidentType %q != stored %q", got, rule.IncidentType)
		}
	})
}
