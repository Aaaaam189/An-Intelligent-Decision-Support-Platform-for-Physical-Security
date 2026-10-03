package db

import (
	"fmt"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"sentinelai/incident-service/config"
	"sentinelai/incident-service/models"
)

func Connect(cfg config.Config) *gorm.DB {
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName,
	)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		panic("failed to connect to database: " + err.Error())
	}

	err = db.AutoMigrate(
		&models.Rule{},
		&models.RuleTargetZone{},
		&models.Shift{},
		&models.Incident{},
		&models.IncidentEvent{},
		&models.AssistanceRequest{},
		&models.AvailabilityAlert{},
	)
	if err != nil {
		panic("failed to migrate database: " + err.Error())
	}

	if err := BackfillRuleIncidentType(db); err != nil {
		panic("failed to backfill rule incident types: " + err.Error())
	}

	return db
}
