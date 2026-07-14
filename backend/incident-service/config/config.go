package config

import "github.com/spf13/viper"


type Config struct {
	DBHost             string
	DBPort             string
	DBUser             string
	DBPassword         string
	DBName             string
	JWTSecret          string
	InternalServiceKey string
	ServerPort         string
	RabbitMQURL        string
	ExchangeName       string
}

func Load() Config {
	viper.SetConfigFile(".env")
	viper.AutomaticEnv()
	_ = viper.ReadInConfig()

	viper.SetDefault("SERVER_PORT", "8084")

	return Config{
		DBHost:     viper.GetString("DB_HOST"),
		DBPort:     viper.GetString("DB_PORT"),
		DBUser:     viper.GetString("DB_USER"),
		DBPassword: viper.GetString("DB_PASSWORD"),
		DBName:     viper.GetString("DB_NAME"),
		JWTSecret:  viper.GetString("JWT_SECRET"),
		InternalServiceKey: viper.GetString("INTERNAL_SERVICE_KEY"),
		ServerPort: viper.GetString("SERVER_PORT"),
		RabbitMQURL:  viper.GetString("RABBITMQ_URL"),
		ExchangeName: viper.GetString("EXCHANGE_NAME"),
	}
}