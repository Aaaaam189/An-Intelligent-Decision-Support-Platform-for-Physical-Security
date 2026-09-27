package services

import (
	"os"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"pgregory.net/rapid"

	"sentinelai/incident-service/dto"
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

// roundTripDB opens a connection to the MariaDB test instance described by
// INCIDENT_TEST_DB_DSN and migrates the tables CreateIncident touches. The
// create/read round trip needs a real store to be a genuine persistence check,
// and CreateIncident is built on MariaDB (its auto-assign path uses
// MariaDB-specific SQL), so this test targets MariaDB rather than an in-memory
// engine.
//
// When INCIDENT_TEST_DB_DSN is not set the test skips gracefully, so the
// default `go test ./...` (run without a database) still passes. Provide the
// DSN to exercise the property, for example:
//
//	set INCIDENT_TEST_DB_DSN=root:pass@tcp(127.0.0.1:3306)/incident_test?charset=utf8mb4&parseTime=True&loc=Local
//	go test ./services/...
func roundTripDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("INCIDENT_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("INCIDENT_TEST_DB_DSN not set; skipping incident create/read round-trip property test")
	}

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to connect to MariaDB test instance: %v", err)
	}

	if err := db.AutoMigrate(&models.Shift{}, &models.Incident{}); err != nil {
		t.Fatalf("failed to migrate incident tables: %v", err)
	}
	return db
}

// genMemberIncidentType generates any member of the Fixed_Incident_Type_Set.
func genMemberIncidentType(t *rapid.T) models.IncidentType {
	idx := rapid.IntRange(0, len(fixedIncidentTypeSet)-1).Draw(t, "memberIdx")
	return fixedIncidentTypeSet[idx]
}

func isFixedIncidentType(v models.IncidentType) bool {
	for _, m := range fixedIncidentTypeSet {
		if m == v {
			return true
		}
	}
	return false
}

// Feature: rule-incident-type, Property 15: Incident creation persists the given incident type (create/read round trip)
//
// For any member of the Fixed_Incident_Type_Set, creating an incident with that
// Incident_Type persists it such that reading the incident back yields the same
// Incident_Type.
//
// The test drives the real IncidentService.CreateIncident (which writes the
// incident to the store) and then IncidentService.GetIncidentByID (which reads
// it back from the store), so it exercises the actual persistence path rather
// than an in-memory struct copy. Because no shift covers the incident's
// (freshly random) zone, CreateIncident takes the unassigned-persist branch.
//
// Validates: Requirements 6.2
func TestProperty15_IncidentCreatePersistsIncidentType(t *testing.T) {
	db := roundTripDB(t)
	// No RabbitMQ channel is wired, so the service's publish calls are no-ops.
	svc := NewIncidentService(db, nil, "")

	// Track created incidents so we can clean up rows this test inserts.
	var createdIDs []uuid.UUID
	t.Cleanup(func() {
		for _, id := range createdIDs {
			db.Exec("DELETE FROM incidents WHERE id = ?", id.String())
		}
	})

	rapid.Check(t, func(t *rapid.T) {
		incidentType := genMemberIncidentType(t)

		req := dto.CreateIncidentRequest{
			CameraID:  uuid.New(),
			ZoneID:    uuid.New(),
			Type:      incidentType,
			Priority:  models.PriorityHigh,
			RiskScore: rapid.Float64Range(0.01, 100).Draw(t, "riskScore"),
		}

		created, err := svc.CreateIncident(req)
		if err != nil {
			t.Fatalf("CreateIncident(%q) failed: %v", incidentType, err)
		}
		if created == nil {
			t.Fatalf("CreateIncident(%q) returned nil incident", incidentType)
		}
		createdIDs = append(createdIDs, created.ID)

		// Read the incident back from the store by its persisted id.
		readBack, err := svc.GetIncidentByID(created.ID.String())
		if err != nil {
			t.Fatalf("GetIncidentByID(%s) failed: %v", created.ID, err)
		}

		if readBack.Type != incidentType {
			t.Fatalf("persisted incident type = %q, want %q", readBack.Type, incidentType)
		}
		if !isFixedIncidentType(readBack.Type) {
			t.Fatalf("persisted incident type %q is not a member of the Fixed_Incident_Type_Set", readBack.Type)
		}
	})
}
