package internalauth

import "net/http"

// AttachInternalKey adds the shared secret header to an outgoing
// request — the client-side counterpart to RequireInternalService.
func AttachInternalKey(req *http.Request, sharedSecret string) {
	req.Header.Set("X-Internal-Service-Key", sharedSecret)
}