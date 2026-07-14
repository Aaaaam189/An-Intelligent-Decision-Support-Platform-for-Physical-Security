package config

import "github.com/spf13/viper"

type Config struct {
	RabbitMQURL         string
	IncidentServiceURL  string
	ExchangeName        string
	QueueName            string
	RoutingKey           string
	InternalServiceKey  string
}

func Load() Config {
	viper.SetConfigFile(".env")
	viper.AutomaticEnv()
	_ = viper.ReadInConfig()

	return Config{
		RabbitMQURL:        viper.GetString("RABBITMQ_URL"),
		IncidentServiceURL: viper.GetString("INCIDENT_SERVICE_URL"),
		ExchangeName:       viper.GetString("EXCHANGE_NAME"),
		QueueName:          viper.GetString("QUEUE_NAME"),
		RoutingKey:         viper.GetString("ROUTING_KEY"),
		InternalServiceKey: viper.GetString("INTERNAL_SERVICE_KEY"),
	}
}