package routes

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"sentinelai/auth-service/handlers"
	"sentinelai/auth-service/middleware"
	"sentinelai/auth-service/models"
	"sentinelai/auth-service/services"
	"sentinelai/auth-service/utils"
)

func SetupRoutes(router *gin.Engine, db *gorm.DB, jwtSecret string, smtpCfg utils.SMTPConfig) {
	userService := services.NewUserService(db)
	authService := services.NewAuthService(db, jwtSecret, smtpCfg)

	userHandler := handlers.NewUserHandler(userService)
	authHandler := handlers.NewAuthHandler(authService)

	// Public routes — no token required
	router.POST("/login", authHandler.Login)
	router.POST("/auth/forgot-password", authHandler.ForgotPassword)
	router.POST("/auth/verify-reset-code", authHandler.VerifyResetCode)
	router.POST("/auth/reset-password", authHandler.ResetPassword)
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Any authenticated user (admin or guard)
	authenticated := router.Group("/auth")
	authenticated.Use(middleware.AuthMiddleware(jwtSecret))
	{
		authenticated.PUT("/change-password", authHandler.ChangePassword)
	}

	// Admin-only user management
	admin := router.Group("/users")
	admin.Use(middleware.AuthMiddleware(jwtSecret), middleware.RequireRole(models.RoleAdmin))
	{
		admin.POST("", userHandler.CreateUser)
		admin.DELETE("/:id", userHandler.DeleteUser)
	}
}