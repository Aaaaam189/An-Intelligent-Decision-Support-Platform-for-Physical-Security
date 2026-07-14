package internalauth

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RequireInternalService checks for a shared secret header that only
// your own services know — this is how decision-engine (and later
// notification-worker, analytics-worker, assistant-service) authenticate
// to each other, completely separate from human JWT/RBAC.
func RequireInternalService(sharedSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("X-Internal-Service-Key")
		if key == "" || key != sharedSecret {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or missing internal service key"})
			c.Abort()
			return
		}
		c.Next()
	}
}