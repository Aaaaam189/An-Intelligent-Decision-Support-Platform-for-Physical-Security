package routes

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"sentinelai/camera-service/handlers"
	"sentinelai/camera-service/middleware"
	"sentinelai/camera-service/models"
	"sentinelai/camera-service/services"
)

func SetupRoutes(router *gin.Engine, db *gorm.DB, jwtSecret string) {
	cameraService := services.NewCameraService(db)
	zoneService := services.NewZoneService(db)

	cameraHandler := handlers.NewCameraHandler(cameraService)
	zoneHandler := handlers.NewZoneHandler(zoneService)

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Any authenticated user (admin or guard) can view cameras/zones
	viewer := router.Group("/")
	viewer.Use(middleware.AuthMiddleware(jwtSecret))
	{
		viewer.GET("/cameras", cameraHandler.GetAllCameras)
		viewer.GET("/cameras/:id", cameraHandler.GetCameraByID)
		viewer.GET("/zones", zoneHandler.GetAllZones)
		viewer.GET("/zones/:id", zoneHandler.GetZoneByID)
	}

	// Admin-only — creating, editing, deleting cameras/zones
	admin := router.Group("/")
	admin.Use(middleware.AuthMiddleware(jwtSecret), middleware.RequireRole(models.RoleAdmin))
	{
		admin.POST("/cameras", cameraHandler.CreateCamera)
		admin.PUT("/cameras/:id", cameraHandler.UpdateCamera)
		admin.DELETE("/cameras/:id", cameraHandler.DeleteCamera)

		admin.POST("/zones", zoneHandler.CreateZone)
		admin.PUT("/zones/:id", zoneHandler.UpdateZone)
		admin.DELETE("/zones/:id", zoneHandler.DeleteZone)
	}
}