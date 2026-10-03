package main

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"

	"sentinelai/notification-worker/config"
	"sentinelai/notification-worker/consumer"
	"sentinelai/notification-worker/hub"
	"sentinelai/shared/rabbitmq"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // fine for dev; tighten later
}

func main() {
	cfg := config.Load()

	conn, ch := rabbitmq.Connect(cfg.RabbitMQURL)
	defer conn.Close()
	defer ch.Close()

	rabbitmq.DeclareExchange(ch, cfg.ExchangeName)

	// One queue, many bindings — every routing key this worker cares about
	// lands in the same queue; the consumer inspects the routing key to decide
	// who each message should be delivered to (a specific guard, a role, or a
	// broadcast fallback).
	for _, key := range []string{
		// Legacy/broadcast keys retained for backward compatibility.
		"incident.created",
		"alert.critical_unassigned",
		// Targeted notification + alert keys (detection-rule-engine).
		"notification.incident_assigned",
		"notification.incident_resolved",
		"notification.incident_unassigned",
		"notification.incident_escalated",
		"notification.assistance",
		"alert.availability_created",
	} {
		rabbitmq.DeclareAndBindQueue(ch, cfg.ExchangeName, cfg.QueueName, key)
	}

	h := hub.NewHub()
	go consumer.Start(ch, cfg.QueueName, h)

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Parse the JWT once, both to authenticate the connection and to
		// pull out the user ID + role so the hub can target this client.
		identity, err := hub.ParseIdentity(token, cfg.JWTSecret)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		wsConn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("upgrade failed: %v", err)
			return
		}

		h.Register(wsConn, identity)
		log.Printf("client connected (userId=%s role=%s)", identity.UserID, identity.Role)

		// Keep reading (and discarding) so we notice when the client
		// disconnects — WebSockets need this loop even if the client
		// never actually sends anything back to us.
		for {
			if _, _, err := wsConn.ReadMessage(); err != nil {
				h.Unregister(wsConn)
				log.Println("client disconnected")
				break
			}
		}
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	log.Println("notification-worker started")
	log.Fatal(http.ListenAndServe(":"+cfg.ServerPort, nil))
}
