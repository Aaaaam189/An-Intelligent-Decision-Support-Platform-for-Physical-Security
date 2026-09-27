//go:build integration

// Integration test for the rule incident-type backfill against a real MariaDB
// instance.
//
// This test is gated behind the `integration` build tag so the default
// `go test ./...` (which does not set the tag) never compiles or runs it. Even
// when the tag is set, the test skips gracefully unless a MariaDB DSN is
// provided via the INCIDENT_TEST_DB_DSN environment variable, so it is safe to
// run in environments without a live database.
//
// Run it with, for example:
//
//	set INCIDENT_TEST_DB_DSN=root:pass@tcp(127.0.0.1:3306)/incident_test?charset=utf8mb4&parseTime=True&loc=Local
//	go test -tags=integration ./db/...
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
package db

import (
	"os"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"sentinelai/incident-service/models"
)

// testDB opens a connection to the MariaDB test instance described by
// INCIDENT_TEST_DB_DSN, skipping the test when the variable is absent so the
// suite degrades to a no-op rather than failing when no DB is reachable.
func testDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("INCIDENT_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("INCIDENT_TEST_DB_DSN not set; skipping MariaDB backfill integration test")
	}

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to connect to MariaDB test instance: %v", err)
	}

	if err := db.AutoMigrate(&models.Rule{}, &models.RuleTargetZone{}); err != nil {
		t.Fatalf("failed to migrate rules table: %v", err)
	}

	return db
}

// seedRule inserts a rule with the given detection type and a raw incident_type
// value (empty string simulates a pre-existing, un-backfilled row). It bypasses
// the model's not-null default by writing the column directly so we can exercise
// the "unset" path the backfill targets.
func seedRule(t *testing.T, db *gorm.DB, name string, detectionType models.DetectionType, incidentType string) uuid.UUID {
	t.Helper()

	id := uuid.New()
	err := db.Exec(
		"INSERT INTO rules (id, name, enabled, detection_type, zone_scope, window_start_min, window_end_min, always_trigger, resulting_priority, incident_type, created_at, updated_at) "+
			"VALUES (?, ?, ?, ?, 'ALL', 0, 0, 0, 'HIGH', ?, NOW(), NOW())",
		id.String(), name, true, string(detectionType), incidentType,
	).Error
	if err != nil {
		t.Fatalf("failed to seed rule %q: %v", name, err)
	}
	return id
}

// storedIncidentType reads back the incident_type column for a rule id.
func storedIncidentType(t *testing.T, db *gorm.DB, id uuid.UUID) string {
	t.Helper()

	var got string
	err := db.Raw("SELECT incident_type FROM rules WHERE id = ?", id.String()).Scan(&got).Error
	if err != nil {
		t.Fatalf("failed to read incident_type for %s: %v", id, err)
	}
	return got
}

// TestBackfillRuleIncidentType_MariaDB seeds rows across all three detection
// types and verifies the backfill SQL executes against MariaDB, populates the
// mapped incident types, leaves an already-set row untouched, and is idempotent
// across a second run.
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
func TestBackfillRuleIncidentType_MariaDB(t *testing.T) {
	db := testDB(t)

	// Isolate this test's rows from anything else in the shared table.
	weaponName := "it-weapon-" + uuid.NewString()
	personName := "it-person-" + uuid.NewString()
	vehicleName := "it-vehicle-" + uuid.NewString()
	presetName := "it-preset-" + uuid.NewString()

	ids := []uuid.UUID{}
	weaponID := seedRule(t, db, weaponName, models.DetectionTypeWeapon, "")
	personID := seedRule(t, db, personName, models.DetectionTypePerson, "")
	vehicleID := seedRule(t, db, vehicleName, models.DetectionTypeVehicle, "")
	// A rule whose incident_type is already set to a non-mapped member; the
	// backfill must leave it unchanged (idempotency / already-set protection).
	presetID := seedRule(t, db, presetName, models.DetectionTypePerson, string(models.TypeSuspiciousActivity))
	ids = append(ids, weaponID, personID, vehicleID, presetID)

	t.Cleanup(func() {
		for _, id := range ids {
			db.Exec("DELETE FROM rules WHERE id = ?", id.String())
		}
	})

	// First run: the SQL should execute and populate the mapped values.
	if err := BackfillRuleIncidentType(db); err != nil {
		t.Fatalf("BackfillRuleIncidentType returned error: %v", err)
	}

	assertType := func(label string, id uuid.UUID, want models.IncidentType) {
		if got := storedIncidentType(t, db, id); got != string(want) {
			t.Errorf("%s: incident_type = %q, want %q", label, got, want)
		}
	}

	// Requirements 3.1, 3.2, 3.3: each detection type maps to its designated type.
	assertType("WEAPON_DETECTED", weaponID, models.TypeWeaponDetected)
	assertType("PERSON_DETECTED", personID, models.TypeIntrusion)
	assertType("VEHICLE_DETECTED", vehicleID, models.TypeUnauthorizedVehicle)
	// Already-set row must remain its original value, not be overwritten.
	assertType("preset (already set)", presetID, models.TypeSuspiciousActivity)

	// Requirement 3.4: every seeded rule now has a non-empty, valid member.
	valid := map[string]bool{
		string(models.TypeWeaponDetected):      true,
		string(models.TypeIntrusion):           true,
		string(models.TypeAfterHoursPresence):  true,
		string(models.TypeUnauthorizedVehicle): true,
		string(models.TypeCrowdOverflow):       true,
		string(models.TypeSuspiciousActivity):  true,
		string(models.TypeOther):               true,
	}
	for _, id := range ids {
		got := storedIncidentType(t, db, id)
		if got == "" {
			t.Errorf("rule %s left with empty incident_type after backfill", id)
		}
		if !valid[got] {
			t.Errorf("rule %s has incident_type %q outside the Fixed_Incident_Type_Set", id, got)
		}
	}

	// Second run: idempotency. Capture values, re-run, and confirm nothing changed.
	before := map[uuid.UUID]string{}
	for _, id := range ids {
		before[id] = storedIncidentType(t, db, id)
	}

	if err := BackfillRuleIncidentType(db); err != nil {
		t.Fatalf("second BackfillRuleIncidentType returned error: %v", err)
	}

	for _, id := range ids {
		if got := storedIncidentType(t, db, id); got != before[id] {
			t.Errorf("rule %s changed on re-run: was %q, now %q (backfill not idempotent)", id, before[id], got)
		}
	}
}
