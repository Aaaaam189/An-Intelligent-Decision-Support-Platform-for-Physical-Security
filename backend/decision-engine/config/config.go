package config

import "github.com/spf13/viper"

type Config struct {
	RabbitMQURL        string
	IncidentServiceURL string
	ExchangeName       string
	QueueName          string
	RoutingKey         string
	InternalServiceKey string
	CooldownSeconds    int
	RulePollSeconds    int
}

// defaultCooldownSeconds is used when COOLDOWN_SECONDS is unset or non-positive.
const defaultCooldownSeconds = 300

// defaultRulePollSeconds is the interval at which the decision-engine polls
// incident-service for the enabled rule set when RULE_POLL_SECONDS is unset
// or non-positive. A short interval keeps rule-cache staleness bounded so
// rule changes take effect without a service restart (Requirement 9.5).
const defaultRulePollSeconds = 10

func Load() Config {
	viper.SetConfigFile(".env")
	viper.AutomaticEnv()
	_ = viper.ReadInConfig()

	viper.SetDefault("COOLDOWN_SECONDS", defaultCooldownSeconds)
	viper.SetDefault("RULE_POLL_SECONDS", defaultRulePollSeconds)

	cooldownSeconds := viper.GetInt("COOLDOWN_SECONDS")
	if cooldownSeconds <= 0 {
		cooldownSeconds = defaultCooldownSeconds
	}

	rulePollSeconds := viper.GetInt("RULE_POLL_SECONDS")
	if rulePollSeconds <= 0 {
		rulePollSeconds = defaultRulePollSeconds
	}

	return Config{
		RabbitMQURL:        viper.GetString("RABBITMQ_URL"),
		IncidentServiceURL: viper.GetString("INCIDENT_SERVICE_URL"),
		ExchangeName:       viper.GetString("EXCHANGE_NAME"),
		QueueName:          viper.GetString("QUEUE_NAME"),
		RoutingKey:         viper.GetString("ROUTING_KEY"),
		InternalServiceKey: viper.GetString("INTERNAL_SERVICE_KEY"),
		CooldownSeconds:    cooldownSeconds,
		RulePollSeconds:    rulePollSeconds,
	}
}