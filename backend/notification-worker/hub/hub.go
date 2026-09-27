package hub

import (
	"errors"
	"log"
	"strings"
	"sync"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

// Identity captures who is behind a websocket connection, extracted from the
// JWT presented at connect time. It lets the hub deliver a message to a
// specific guard (by user ID) or to everyone in a role (e.g. all supervisors)
// instead of blasting every connected dashboard.
type Identity struct {
	UserID string
	Role   string
}

// Client pairs a websocket connection with the identity of the user behind it.
type Client struct {
	Conn     *websocket.Conn
	Identity Identity
}

// Hub tracks every currently-connected dashboard and lets the RabbitMQ
// consumer deliver a message to all of them, to a single user, or to a role.
// Think of it as the in-memory equivalent of a Spring SimpMessagingTemplate —
// except here we're managing the connection list (and its identity indexes)
// by hand.
//
// Three views over the same set of connections are kept in sync under one
// mutex:
//   - clients: every connection (used for broadcast fallback)
//   - byUser:  connections grouped by user ID (a user may have >1 tab open)
//   - byRole:  connections grouped by role (e.g. ADMIN, SUPERVISOR, GUARD)
type Hub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]*Client
	byUser  map[string]map[*websocket.Conn]*Client
	byRole  map[string]map[*websocket.Conn]*Client
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[*websocket.Conn]*Client),
		byUser:  make(map[string]map[*websocket.Conn]*Client),
		byRole:  make(map[string]map[*websocket.Conn]*Client),
	}
}

// ParseIdentity extracts the user ID and role from a signed JWT. It reuses the
// same claim names the auth-service issues (`userId`, `role`) so identity is
// consistent across services.
func ParseIdentity(tokenString, secret string) (Identity, error) {
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return Identity{}, errors.New("invalid or expired token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return Identity{}, errors.New("invalid token claims")
	}

	userID, _ := claims["userId"].(string)
	role, _ := claims["role"].(string)

	return Identity{
		UserID: userID,
		Role:   strings.ToUpper(role),
	}, nil
}

// Register adds a connection and indexes it by the user's identity so it can
// later be targeted individually or by role.
func (h *Hub) Register(conn *websocket.Conn, identity Identity) {
	h.mu.Lock()
	defer h.mu.Unlock()

	client := &Client{Conn: conn, Identity: identity}
	h.clients[conn] = client

	if identity.UserID != "" {
		if h.byUser[identity.UserID] == nil {
			h.byUser[identity.UserID] = make(map[*websocket.Conn]*Client)
		}
		h.byUser[identity.UserID][conn] = client
	}

	if identity.Role != "" {
		if h.byRole[identity.Role] == nil {
			h.byRole[identity.Role] = make(map[*websocket.Conn]*Client)
		}
		h.byRole[identity.Role][conn] = client
	}
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.removeLocked(conn)
	conn.Close()
}

// removeLocked drops a connection from every index. Callers must hold h.mu.
func (h *Hub) removeLocked(conn *websocket.Conn) {
	client, ok := h.clients[conn]
	if !ok {
		return
	}
	delete(h.clients, conn)

	if id := client.Identity.UserID; id != "" {
		if conns := h.byUser[id]; conns != nil {
			delete(conns, conn)
			if len(conns) == 0 {
				delete(h.byUser, id)
			}
		}
	}

	if role := client.Identity.Role; role != "" {
		if conns := h.byRole[role]; conns != nil {
			delete(conns, conn)
			if len(conns) == 0 {
				delete(h.byRole, role)
			}
		}
	}
}

// Broadcast sends the same message to every connected client. It remains the
// fallback path for messages that don't target a specific recipient. If a
// client's connection has gone stale, we drop it instead of letting one bad
// connection break the loop for everyone else.
func (h *Hub) Broadcast(message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for conn := range h.clients {
		h.writeLocked(conn, message)
	}
}

// SendToUser delivers a message to every connection belonging to a single
// user ID (a user may have multiple tabs/devices open).
func (h *Hub) SendToUser(userID string, message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for conn := range h.byUser[userID] {
		h.writeLocked(conn, message)
	}
}

// SendToRole delivers a message to every connection whose user holds the given
// role (case-insensitive). Useful for "notify all supervisors/admins" flows.
func (h *Hub) SendToRole(role string, message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for conn := range h.byRole[strings.ToUpper(role)] {
		h.writeLocked(conn, message)
	}
}

// writeLocked writes a message to one connection, dropping it on failure.
// Callers must hold h.mu.
func (h *Hub) writeLocked(conn *websocket.Conn, message []byte) {
	if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
		log.Printf("failed to send to client, dropping: %v", err)
		h.removeLocked(conn)
		conn.Close()
	}
}
