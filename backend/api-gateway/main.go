package main

import (
	"github.com/gin-gonic/gin"

	"sentinelai/api-gateway/config"
	"sentinelai/api-gateway/proxy"
)

func main() {
	cfg := config.Load()

	router := gin.Default()
	router.Use(config.CorsMiddleware(cfg)) // global CORS, same as "/**" in your CorsConfig

	// Each of these is one "route" from your GatewayConfig — a path
	// prefix mapped to a downstream service's base URL.
	router.Any("/api/auth/*proxyPath", proxy.NewProxy(cfg.AuthServiceURL, "/api/auth"))
	router.Any("/api/cameras/*proxyPath", proxy.NewProxy(cfg.CameraServiceURL, "/api/cameras"))
	router.Any("/api/incidents/*proxyPath", proxy.NewProxy(cfg.IncidentServiceURL, "/api/incidents"))

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "gateway ok"})
	})

	router.Run(":" + cfg.GatewayPort)
}