package config

import "github.com/spf13/viper"

type Config struct {
	GatewayPort string

	CorsAllowedOrigins    string
	CorsAllowedMethods    string
	CorsAllowedHeaders    string
	CorsAllowCredentials  bool

	AuthServiceURL     string
	CameraServiceURL   string
	IncidentServiceURL string
}

func Load() Config {
	viper.SetConfigFile(".env")
	viper.AutomaticEnv()
	_ = viper.ReadInConfig()

	viper.SetDefault("GATEWAY_PORT", "8080")

	return Config{
		GatewayPort: viper.GetString("GATEWAY_PORT"),

		CorsAllowedOrigins:   viper.GetString("CORS_ALLOWED_ORIGINS"),
		CorsAllowedMethods:   viper.GetString("CORS_ALLOWED_METHODS"),
		CorsAllowedHeaders:   viper.GetString("CORS_ALLOWED_HEADERS"),
		CorsAllowCredentials: viper.GetBool("CORS_ALLOW_CREDENTIALS"),

		AuthServiceURL:     viper.GetString("AUTH_SERVICE_URL"),
		CameraServiceURL:   viper.GetString("CAMERA_SERVICE_URL"),
		IncidentServiceURL: viper.GetString("INCIDENT_SERVICE_URL"),
	}
}