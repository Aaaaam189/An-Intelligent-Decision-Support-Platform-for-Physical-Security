package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// FallbackResponse mirrors the exact JSON shape your Spring fallback returned.
func FallbackResponse(c *gin.Context, err error) {
	c.JSON(http.StatusServiceUnavailable, gin.H{
		"message": "The service is temporarily unavailable. Please try again later.",
		"error":   err.Error(),
		"status":  http.StatusServiceUnavailable,
	})
}