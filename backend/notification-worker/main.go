package main

import (
	"log"
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"

	"sentinelai/notification-worker/config"
	"sentinelai/notification-worker/consumer"
	"sentinelai/notification-worker/hub"
	"sentinelai/shared/rabbitmq"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // fine for dev; tighten later
}

func verifyToken(tokenString, secret string) bool {
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	return err == nil && token.Valid
}

func main() {
	cfg := config.Load()

	conn, ch := rabbitmq.Connect(cfg.RabbitMQURL)
	defer conn.Close()
	defer ch.Close()

	rabbitmq.DeclareExchange(ch, cfg.ExchangeName)

	// One queue, two bindings — both incident.created and
	// alert.critical_unassigned land in the same queue, since this
	// worker's only job is "forward everything to the dashboard."
	rabbitmq.DeclareAndBindQueue(ch, cfg.ExchangeName, cfg.QueueName, "incident.created")
	rabbitmq.DeclareAndBindQueue(ch, cfg.ExchangeName, cfg.QueueName, "alert.critical_unassigned")

	h := hub.NewHub()
	go consumer.Start(ch, cfg.QueueName, h)

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" || !verifyToken(token, cfg.JWTSecret) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		wsConn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("upgrade failed: %v", err)
			return
		}

		h.Register(wsConn)
		log.Println("client connected")

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