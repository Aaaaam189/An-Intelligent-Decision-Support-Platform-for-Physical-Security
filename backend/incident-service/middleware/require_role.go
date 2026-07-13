package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"sentinelai/incident-service/models"
)

func RequireRole(role models.AppRole) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRole, exists := c.Get("role")
		if !exists || userRole != string(role) {
			c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			c.Abort()
			return
		}
		c.Next()
	}
}