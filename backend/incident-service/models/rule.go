package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RulePriority is the incident priority a rule produces when it matches.
type RulePriority string

const (
	RulePriorityLow      RulePriority = "LOW"
	RulePriorityMedium   RulePriority = "MEDIUM"
	RulePriorityHigh     RulePriority = "HIGH"
	RulePriorityCritical RulePriority = "CRITICAL"
)

// DetectionType is the category of detection a rule matches against.
type DetectionType string

const (
	DetectionTypePerson  DetectionType = "PERSON_DETECTED"
	DetectionTypeWeapon  DetectionType = "WEAPON_DETECTED"
	DetectionTypeVehicle DetectionType = "VEHICLE_DETECTED"
)

// WeaponClass is the sub-classification filter for WEAPON_DETECTED rules.
type WeaponClass string

const (
	WeaponClassGun   WeaponClass = "gun"
	WeaponClassRifle WeaponClass = "rifle"
	WeaponClassKnife WeaponClass = "knife"
	WeaponClassAny   WeaponClass = "any"
)

// ZoneScope determines whether a rule targets all zones or a specific set.
type ZoneScope string

const (
	ZoneScopeAll ZoneScope = "ALL"
	ZoneScopeSet ZoneScope = "SET"
)

// Rule is an admin-configurable detection rule combining structured
// conditions (detection type, weapon class, target zones, active time
// window, always-trigger flag) with an outcome (resulting incident priority).
type Rule struct {
	ID                uuid.UUID    `gorm:"type:char(36);primaryKey" json:"id"`
	Name              string       `gorm:"size:150;not null" json:"name"`
	Enabled           bool         `gorm:"not null;default:true" json:"enabled"`
	DetectionType     DetectionType `gorm:"type:varchar(30);not null" json:"detectionType"`
	// WeaponClass is required only when DetectionType is WEAPON_DETECTED.
	WeaponClass *WeaponClass `gorm:"type:varchar(20)" json:"weaponClass,omitempty"`
	ZoneScope   ZoneScope    `gorm:"type:varchar(10);not null;default:ALL" json:"zoneScope"`
	// TargetZones holds the zones a SET-scoped rule applies to, stored via the
	// rule_target_zones child table.
	TargetZones []RuleTargetZone `gorm:"foreignKey:RuleID;constraint:OnDelete:CASCADE" json:"targetZones,omitempty"`
	// WindowStartMin and WindowEndMin express the active time window as minutes
	// since midnight (0..1439).
	WindowStartMin    int          `gorm:"not null;default:0" json:"windowStartMin"`
	WindowEndMin      int          `gorm:"not null;default:0" json:"windowEndMin"`
	AlwaysTrigger     bool         `gorm:"not null;default:false" json:"alwaysTrigger"`
	ResultingPriority RulePriority `gorm:"type:varchar(20);not null" json:"resultingPriority"`
	// IncidentType is the admin-chosen incident type the created incident takes
	// when this rule matches; a member of the Fixed_Incident_Type_Set.
	IncidentType IncidentType `gorm:"type:varchar(30);not null" json:"incidentType"`
	CreatedAt         time.Time    `json:"createdAt"`
	UpdatedAt         time.Time    `json:"updatedAt"`
}

func (r *Rule) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

// RuleTargetZone is the join/child table row associating a SET-scoped rule
// with one target zone.
type RuleTargetZone struct {
	ID     uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	RuleID uuid.UUID `gorm:"type:char(36);not null;index" json:"ruleId"`
	ZoneID uuid.UUID `gorm:"type:char(36);not null;index" json:"zoneId"`
}

func (z *RuleTargetZone) BeforeCreate(tx *gorm.DB) error {
	if z.ID == uuid.Nil {
		z.ID = uuid.New()
	}
	return nil
}
