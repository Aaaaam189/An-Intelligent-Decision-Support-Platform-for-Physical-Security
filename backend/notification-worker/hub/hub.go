package hub

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Hub tracks every currently-connected dashboard and lets the RabbitMQ
// consumer broadcast a message to all of them at once. Think of it as
// the in-memory equivalent of a Spring SimpMessagingTemplate for STOMP
// broadcasts — except here we're managing the connection list by hand.
type Hub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]bool
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*websocket.Conn]bool)}
}

func (h *Hub) Register(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[conn] = true
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, conn)
	conn.Close()
}

// Broadcast sends the same message to every connected client. If a
// client's connection has gone stale, we drop it instead of letting
// one bad connection break the loop for everyone else.
func (h *Hub) Broadcast(message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for conn := range h.clients {
		if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Printf("failed to send to client, dropping: %v", err)
			conn.Close()
			delete(h.clients, conn)
		}
	}
}