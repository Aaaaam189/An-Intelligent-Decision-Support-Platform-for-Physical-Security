package db

import (
	"fmt"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"sentinelai/analytics-worker/config"
	"sentinelai/analytics-worker/models"
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

	if err := db.AutoMigrate(
		&models.IncidentStat{},
		&models.CriticalAlert{},
		&models.AvailabilityAlert{},
	); err != nil {
		panic("failed to migrate database: " + err.Error())
	}

	return db
}