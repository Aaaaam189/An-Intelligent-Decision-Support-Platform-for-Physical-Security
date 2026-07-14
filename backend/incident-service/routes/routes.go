package routes

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"sentinelai/incident-service/handlers"
	"sentinelai/incident-service/middleware"
	"sentinelai/incident-service/models"
	"sentinelai/incident-service/services"
	"sentinelai/shared/internalauth"
)

func SetupRoutes(router *gin.Engine, db *gorm.DB, jwtSecret, internalKey string, incidentService *services.IncidentService) {
	ruleService := services.NewRuleService(db)
	shiftService := services.NewShiftService(db)

	ruleHandler := handlers.NewRuleHandler(ruleService)
	shiftHandler := handlers.NewShiftHandler(shiftService)
	incidentHandler := handlers.NewIncidentHandler(incidentService)

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	rules := router.Group("/rules")
	rules.Use(middleware.AuthMiddleware(jwtSecret), middleware.RequireRole(models.RoleAdmin))
	{
		rules.POST("", ruleHandler.CreateRule)
		rules.GET("", ruleHandler.GetAllRules)
		rules.GET("/:id", ruleHandler.GetRuleByID)
		rules.PUT("/:id", ruleHandler.UpdateRule)
		rules.DELETE("/:id", ruleHandler.DeleteRule)
	}

	shiftsAuth := router.Group("/shifts")
	shiftsAuth.Use(middleware.AuthMiddleware(jwtSecret))
	{
		shiftsAuth.GET("/mine", shiftHandler.GetMyShifts)
		shiftsAuth.GET("", shiftHandler.GetAllShifts)
		shiftsAuth.GET("/:id", shiftHandler.GetShiftByID)
	}

	shiftsAdmin := router.Group("/shifts")
	shiftsAdmin.Use(middleware.AuthMiddleware(jwtSecret), middleware.RequireRole(models.RoleAdmin))
	{
		shiftsAdmin.POST("", shiftHandler.CreateShift)
		shiftsAdmin.POST("/batch", shiftHandler.CreateShiftBatch)
		shiftsAdmin.PUT("/:id", shiftHandler.UpdateShift)
		shiftsAdmin.DELETE("/:id", shiftHandler.DeleteShift)
	}

	incidentsAuth := router.Group("/incidents")
	incidentsAuth.Use(middleware.AuthMiddleware(jwtSecret))
	{
		incidentsAuth.GET("", incidentHandler.GetAllIncidents)
		incidentsAuth.GET("/:id", incidentHandler.GetIncidentByID)
		incidentsAuth.PATCH("/:id/status", incidentHandler.UpdateStatus)
	}

	incidentsAdmin := router.Group("/incidents")
	incidentsAdmin.Use(middleware.AuthMiddleware(jwtSecret), middleware.RequireRole(models.RoleAdmin))
	{
		incidentsAdmin.PATCH("/:id/reassign", incidentHandler.Reassign)
	}

	// Internal — only other services can call this, using the shared
	// secret instead of a human JWT. This is what decision-engine uses.
	internal := router.Group("/internal/incidents")
	internal.Use(internalauth.RequireInternalService(internalKey))
	{
		internal.POST("", incidentHandler.CreateIncident)
	}
}