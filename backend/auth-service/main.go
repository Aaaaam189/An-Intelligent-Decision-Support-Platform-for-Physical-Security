package main

import (
	"github.com/gin-gonic/gin"

	"sentinelai/auth-service/config"
	"sentinelai/auth-service/db"
	"sentinelai/auth-service/routes"
	"sentinelai/auth-service/utils"
)

func main() {
	cfg := config.Load()
	database := db.Connect(cfg)

	smtpCfg := utils.SMTPConfig{
		Host: cfg.SMTPHost,
		Port: cfg.SMTPPort,
		User: cfg.SMTPUser,
		Pass: cfg.SMTPPass,
		From: cfg.SMTPFrom,
	}

	router := gin.Default()
	routes.SetupRoutes(router, database, cfg.JWTSecret, smtpCfg)
	router.Run(":" + cfg.ServerPort)
}