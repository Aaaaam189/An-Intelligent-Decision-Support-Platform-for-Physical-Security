package proxy

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"

	"sentinelai/api-gateway/handlers"
)

// NewProxy builds a reverse proxy that strips a path prefix before
// forwarding — e.g. "/api/auth/login" becomes "/login" on the way
// to auth-service, since auth-service itself has no idea it's behind
// a gateway.
func NewProxy(targetURL string, stripPrefix string) gin.HandlerFunc {
	target, err := url.Parse(targetURL)
	if err != nil {
		log.Fatalf("invalid target URL %s: %v", targetURL, err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Path = strings.TrimPrefix(req.URL.Path, stripPrefix)
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		c := gin.CreateTestContextOnly(w, gin.Default())
		c.Request = r
		handlers.FallbackResponse(c, err)
	}

	return func(c *gin.Context) {
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}