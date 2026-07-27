package config

import "github.com/spf13/viper"

type Config struct {
	DBHost       string
	DBPort       string
	DBUser       string
	DBPassword   string
	DBName       string
	JWTSecret    string
	RabbitMQURL  string
	ExchangeName string
	QueueName    string
	ServerPort   string
}

func Load() Config {
	viper.SetConfigFile(".env")
	viper.AutomaticEnv()
	_ = viper.ReadInConfig()

	viper.SetDefault("SERVER_PORT", "8086")

	return Config{
		DBHost:       viper.GetString("DB_HOST"),
		DBPort:       viper.GetString("DB_PORT"),
		DBUser:       viper.GetString("DB_USER"),
		DBPassword:   viper.GetString("DB_PASSWORD"),
		DBName:       viper.GetString("DB_NAME"),
		JWTSecret:    viper.GetString("JWT_SECRET"),
		RabbitMQURL:  viper.GetString("RABBITMQ_URL"),
		ExchangeName: viper.GetString("EXCHANGE_NAME"),
		QueueName:    viper.GetString("QUEUE_NAME"),
		ServerPort: viper.GetString("SERVER_PORT"),
	}
}