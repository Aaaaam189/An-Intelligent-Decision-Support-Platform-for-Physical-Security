package routes

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"sentinelai/incident-service/handlers"
	"sentinelai/incident-service/middleware"
	"sentinelai/incident-service/models"
	"sentinelai/incident-service/services"
)

func SetupRoutes(router *gin.Engine, db *gorm.DB, jwtSecret string) {
	ruleService := services.NewRuleService(db)
	shiftService := services.NewShiftService(db)
	incidentService := services.NewIncidentService(db)

	ruleHandler := handlers.NewRuleHandler(ruleService)
	shiftHandler := handlers.NewShiftHandler(shiftService)
	incidentHandler := handlers.NewIncidentHandler(incidentService)

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Rules — admin only, both read and write (guards don't need these)
	rules := router.Group("/rules")
	rules.Use(middleware.AuthMiddleware(jwtSecret), middleware.RequireRole(models.RoleAdmin))
	{
		rules.POST("", ruleHandler.CreateRule)
		rules.GET("", ruleHandler.GetAllRules)
		rules.GET("/:id", ruleHandler.GetRuleByID)
		rules.PUT("/:id", ruleHandler.UpdateRule)
		rules.DELETE("/:id", ruleHandler.DeleteRule)
	}

	// Shifts — admin manages, any authenticated user can view,
	// guards get a "my shifts" endpoint scoped to their own token
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
		shiftsAdmin.PUT("/:id", shiftHandler.UpdateShift)
		shiftsAdmin.DELETE("/:id", shiftHandler.DeleteShift)
	}

	// Incidents — any authenticated user can view; status updates are
	// restricted to the assigned guard or an admin (enforced in the
	// service layer); reassignment and manual creation are admin-only
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
		incidentsAdmin.POST("", incidentHandler.CreateIncident)
		incidentsAdmin.PATCH("/:id/reassign", incidentHandler.Reassign)
	}
}