package config

import (
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CorsMiddleware is the direct equivalent of your CorsWebFilter bean —
// same idea, same settings, just built with Gin's CORS middleware
// instead of Spring's CorsWebFilter + UrlBasedCorsConfigurationSource.
func CorsMiddleware(cfg Config) gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins:     strings.Split(cfg.CorsAllowedOrigins, ","),
		AllowMethods:     strings.Split(cfg.CorsAllowedMethods, ","),
		AllowHeaders:     strings.Split(cfg.CorsAllowedHeaders, ","),
		AllowCredentials: cfg.CorsAllowCredentials,
		MaxAge:           12 * time.Hour,
	})
}