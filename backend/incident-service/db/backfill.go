package db

import (
	"gorm.io/gorm"

	"sentinelai/incident-service/models"
)

// BackfillIncidentTypeFor maps a rule's detection type to the incident type
// assigned to pre-existing rules during the backfill, per the
// Detection_Type_Backfill_Map:
//
//	WEAPON_DETECTED  -> WEAPON_DETECTED
//	PERSON_DETECTED  -> INTRUSION
//	VEHICLE_DETECTED -> UNAUTHORIZED_VEHICLE
//
// It is a pure function so it can be property-tested directly. Any detection
// type outside the known set falls back to OTHER so that no rule is left
// without a valid member of the Fixed_Incident_Type_Set.
func BackfillIncidentTypeFor(detectionType models.DetectionType) models.IncidentType {
	switch detectionType {
	case models.DetectionTypeWeapon:
		return models.TypeWeaponDetected
	case models.DetectionTypePerson:
		return models.TypeIntrusion
	case models.DetectionTypeVehicle:
		return models.TypeUnauthorizedVehicle
	default:
		return models.TypeOther
	}
}

// BackfillRuleIncidentType assigns an incident type to every pre-existing rule
// whose incident_type is unset (NULL or empty), based on its detection type.
//
// Each UPDATE targets only rows where incident_type IS NULL OR incident_type =
// '' so that re-running the backfill is idempotent (already-set rows are left
// untouched). The statements use MariaDB-compatible SQL.
func BackfillRuleIncidentType(db *gorm.DB) error {
	statements := []struct {
		detectionType models.DetectionType
		incidentType  models.IncidentType
	}{
		{models.DetectionTypeWeapon, BackfillIncidentTypeFor(models.DetectionTypeWeapon)},
		{models.DetectionTypePerson, BackfillIncidentTypeFor(models.DetectionTypePerson)},
		{models.DetectionTypeVehicle, BackfillIncidentTypeFor(models.DetectionTypeVehicle)},
	}

	for _, s := range statements {
		err := db.Exec(
			"UPDATE rules SET incident_type = ? WHERE detection_type = ? AND (incident_type IS NULL OR incident_type = '')",
			string(s.incidentType), string(s.detectionType),
		).Error
		if err != nil {
			return err
		}
	}

	return nil
}
