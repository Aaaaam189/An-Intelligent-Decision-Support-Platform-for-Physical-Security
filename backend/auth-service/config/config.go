package config

import "github.com/spf13/viper"

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	JWTSecret  string
	ServerPort string
	SMTPHost   string
	SMTPPort   string
	SMTPUser   string
	SMTPPass   string
	SMTPFrom   string
}

func Load() Config {
	viper.SetConfigFile(".env")
	viper.AutomaticEnv()
	_ = viper.ReadInConfig()

	return Config{
		DBHost:     viper.GetString("DB_HOST"),
		DBPort:     viper.GetString("DB_PORT"),
		DBUser:     viper.GetString("DB_USER"),
		DBPassword: viper.GetString("DB_PASSWORD"),
		DBName:     viper.GetString("DB_NAME"),
		JWTSecret:  viper.GetString("JWT_SECRET"),
		ServerPort: viper.GetString("SERVER_PORT"),
		SMTPHost:   viper.GetString("SMTP_HOST"),
		SMTPPort:   viper.GetString("SMTP_PORT"),
		SMTPUser:   viper.GetString("SMTP_USER"),
		SMTPPass:   viper.GetString("SMTP_PASS"),
		SMTPFrom:   viper.GetString("SMTP_FROM"),
	}
}