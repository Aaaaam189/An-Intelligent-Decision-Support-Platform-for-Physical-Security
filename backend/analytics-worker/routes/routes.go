package routes

import (
	"github.com/gin-gonic/gin"

	"sentinelai/analytics-worker/handlers"
	"sentinelai/analytics-worker/middleware"
	"sentinelai/analytics-worker/models"
	"sentinelai/analytics-worker/services"
)

func SetupRoutes(router *gin.Engine, analyticsService *services.AnalyticsService, jwtSecret string) {
	analyticsHandler := handlers.NewAnalyticsHandler(analyticsService)

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	admin := router.Group("/analytics")
	admin.Use(middleware.AuthMiddleware(jwtSecret), middleware.RequireRole(models.RoleAdmin))
	{
		admin.GET("/summary", analyticsHandler.GetSummary)
		admin.GET("/today", analyticsHandler.GetToday)
		admin.GET("/alerts", analyticsHandler.GetAlerts)
	}
}