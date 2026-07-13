package main

import (
	"github.com/gin-gonic/gin"

	"sentinelai/camera-service/config"
	"sentinelai/camera-service/db"
	"sentinelai/camera-service/routes"
)

func main() {
	cfg := config.Load()
	database := db.Connect(cfg)

	router := gin.Default()
	routes.SetupRoutes(router, database, cfg.JWTSecret)

	router.Run(":" + cfg.ServerPort)
}