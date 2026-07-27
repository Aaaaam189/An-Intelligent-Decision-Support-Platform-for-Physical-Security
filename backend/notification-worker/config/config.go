package config

import "github.com/spf13/viper"

type Config struct {
	RabbitMQURL  string
	ExchangeName string
	QueueName    string
	ServerPort   string
	JWTSecret    string
}

func Load() Config {
	viper.SetConfigFile(".env")
	viper.AutomaticEnv()
	_ = viper.ReadInConfig()

	viper.SetDefault("SERVER_PORT", "8085")

	return Config{
		RabbitMQURL:  viper.GetString("RABBITMQ_URL"),
		ExchangeName: viper.GetString("EXCHANGE_NAME"),
		QueueName:    viper.GetString("QUEUE_NAME"),
		ServerPort:   viper.GetString("SERVER_PORT"),
		JWTSecret:    viper.GetString("JWT_SECRET"),
	}
}