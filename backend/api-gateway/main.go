package main

import (
	"github.com/gin-gonic/gin"

	"sentinelai/api-gateway/config"
	"sentinelai/api-gateway/proxy"
)

func main() {
	cfg := config.Load()

	router := gin.Default()
	router.Use(config.CorsMiddleware(cfg))

	// Every route below strips exactly "/api" — nothing more, nothing
	// service-specific. Each downstream service owns its own prefix
	// internally (/auth/..., /cameras/..., /zones/...), so the gateway
	// never needs special-casing per service.
	router.Any("/api/auth", proxy.NewProxy(cfg.AuthServiceURL, "/api"))
	router.Any("/api/auth/*proxyPath", proxy.NewProxy(cfg.AuthServiceURL, "/api"))

	router.Any("/api/cameras", proxy.NewProxy(cfg.CameraServiceURL, "/api"))
	router.Any("/api/cameras/*proxyPath", proxy.NewProxy(cfg.CameraServiceURL, "/api"))

	router.Any("/api/zones", proxy.NewProxy(cfg.CameraServiceURL, "/api"))
	router.Any("/api/zones/*proxyPath", proxy.NewProxy(cfg.CameraServiceURL, "/api"))

	router.Any("/api/incidents", proxy.NewProxy(cfg.IncidentServiceURL, "/api"))
	router.Any("/api/incidents/*proxyPath", proxy.NewProxy(cfg.IncidentServiceURL, "/api"))

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "gateway ok"})
	})

	router.Run(":" + cfg.GatewayPort)
}