package main

import (
	"log"
	"time"

	"sentinelai/shared/rabbitmq"
)

func main() {
	conn, ch := rabbitmq.Connect("amqp://guest:guest@localhost:5672/")
	defer conn.Close()
	defer ch.Close()

	rabbitmq.DeclareExchange(ch, "sentinelai.events")

	event := map[string]interface{}{
		"cameraId":  "f42fe995-bb54-4f4f-8085-6d555a2d5de7",
		"zoneId":    "71846101-5071-40d5-8cf9-50122371dede",
		"type":      "PERSON_DETECTED",
		"timestamp": time.Now().Format(time.RFC3339),
	}

	err := rabbitmq.Publish(ch, "sentinelai.events", "detection.person", event)
	if err != nil {
		log.Fatalf("failed to publish: %v", err)
	}

	log.Println("fake detection event published")
}