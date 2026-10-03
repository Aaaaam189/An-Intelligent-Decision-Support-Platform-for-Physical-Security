package consumer

import (
	"encoding/json"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"

	"sentinelai/notification-worker/hub"
)

// Routing keys this worker knows how to target. Anything not listed here falls
// back to a broadcast so no message is ever silently dropped.
const (
	keyIncidentAssigned    = "notification.incident_assigned"
	keyIncidentResolved    = "notification.incident_resolved"
	keyIncidentUnassigned  = "notification.incident_unassigned"
	keyIncidentEscalated   = "notification.incident_escalated"
	keyAssistance          = "notification.assistance"
	keyAvailabilityCreated = "alert.availability_created"
)

// Roles used when a message targets a class of users rather than an individual.
// Kept uppercase to match hub.Identity.Role (the hub upper-cases on connect).
const (
	roleAdmin       = "ADMIN"
	roleSupervisor  = "SUPERVISOR"
	roleCoordinator = "COORDINATOR"
)

// notificationPayload is the superset of fields the incident-service attaches
// to the targeted notification/alert events (see the design's event-contract
// table). Each routing key only populates the fields relevant to it, so the
// rest stay at their zero value and are simply ignored.
type notificationPayload struct {
	// assignedGuardId — the guard an incident was handed to
	// (notification.incident_assigned).
	AssignedGuardID string `json:"assignedGuardId"`
	// resolverId — the guard who resolved the incident, excluded from the
	// team notification (notification.incident_resolved).
	ResolverID string `json:"resolverId"`
	// recipientGuardIds — explicit list of guards to notify. Used by
	// notification.incident_resolved (the team) and notification.assistance
	// (the available guards), computed on the incident-service side.
	RecipientGuardIDs []string `json:"recipientGuardIds"`
}

// Start consumes from the worker's queue and routes each message to the right
// recipients based on its routing key, using the identity-aware hub. Messages
// with an unrecognised routing key fall back to a broadcast.
func Start(ch *amqp.Channel, queueName string, h *hub.Hub) {
	msgs, err := ch.Consume(
		queueName,
		"",
		false, // manual ack
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		log.Fatalf("failed to start consuming: %v", err)
	}

	log.Println("notification-worker: waiting for events...")

	for msg := range msgs {
		log.Printf("received event, routing key=%s", msg.RoutingKey)
		route(h, msg.RoutingKey, msg.Body)
		msg.Ack(false)
	}
}

// route dispatches a single message to its intended recipients. It is split
// out from Start so the routing decision is easy to unit-test in isolation.
func route(h *hub.Hub, routingKey string, body []byte) {
	switch routingKey {
	case keyIncidentAssigned:
		// Deliver only to the assigned guard (Req 5.2).
		p := parsePayload(routingKey, body)
		if p.AssignedGuardID != "" {
			h.SendToUser(p.AssignedGuardID, body)
			return
		}
		log.Printf("%s: no assignedGuardId in payload, dropping", routingKey)

	case keyIncidentResolved:
		// Deliver to the remaining team guards, excluding the resolver (Req 5.4).
		p := parsePayload(routingKey, body)
		sent := false
		for _, guardID := range p.RecipientGuardIDs {
			if guardID == "" || guardID == p.ResolverID {
				continue
			}
			h.SendToUser(guardID, body)
			sent = true
		}
		if !sent {
			log.Printf("%s: no team recipients (excluding resolver), nothing delivered", routingKey)
		}

	case keyIncidentUnassigned:
		// Escalate to supervisors and on-duty coordinators (Req 5.6).
		h.SendToRole(roleSupervisor, body)
		h.SendToRole(roleCoordinator, body)

	case keyIncidentEscalated:
		// An existing incident became more serious (for example a weapon
		// appeared during an intrusion). Tell the assigned guard; when nobody
		// is assigned, escalate to supervisors and coordinators. Admins always
		// get it so the dashboard banner reflects the escalation.
		p := parsePayload(routingKey, body)
		if p.AssignedGuardID != "" {
			h.SendToUser(p.AssignedGuardID, body)
		} else {
			h.SendToRole(roleSupervisor, body)
			h.SendToRole(roleCoordinator, body)
		}
		h.SendToRole(roleAdmin, body)

	case keyAssistance:
		// Notify every available guard the incident-service selected (Req 6.3).
		p := parsePayload(routingKey, body)
		sent := false
		for _, guardID := range p.RecipientGuardIDs {
			if guardID == "" {
				continue
			}
			h.SendToUser(guardID, body)
			sent = true
		}
		if !sent {
			log.Printf("%s: no available guards to notify", routingKey)
		}

	case keyAvailabilityCreated:
		// Alert every connected admin or supervisor (Req 7.3).
		h.SendToRole(roleAdmin, body)
		h.SendToRole(roleSupervisor, body)

	default:
		// Unknown routing key — fall back to broadcast so nothing is lost.
		log.Printf("no targeted route for routing key=%s, broadcasting", routingKey)
		h.Broadcast(body)
	}
}

// parsePayload decodes the targeting fields from a message body. A decode
// failure is logged and yields an empty payload; the caller decides what to do
// with missing targets (typically drop, since a broadcast could leak an alert
// to the wrong users).
func parsePayload(routingKey string, body []byte) notificationPayload {
	var p notificationPayload
	if err := json.Unmarshal(body, &p); err != nil {
		log.Printf("%s: failed to parse payload: %v", routingKey, err)
	}
	return p
}
