// Package rulecache provides a hot-reloadable, in-memory cache of the enabled
// detection rules the decision-engine evaluates against.
//
// The cache polls the incident-service internal endpoint
// GET /internal/rules/enabled on a fixed interval and atomically swaps the
// in-memory snapshot on each successful poll. Evaluation reads the snapshot
// through a read lock, so reads never block on a refresh (write). Because the
// snapshot is replaced wholesale under the lock, detection events consumed
// after a refresh are evaluated against the updated rule set without a service
// restart (Requirement 9.5).
package rulecache

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"sentinelai/decision-engine/models"
	"sentinelai/shared/internalauth"
)

// httpTimeout bounds each poll request so a slow or unresponsive
// incident-service cannot stall the refresh loop indefinitely.
const httpTimeout = 5 * time.Second

// Cache holds an atomically swappable snapshot of the enabled rules and knows
// how to refresh it from the incident-service internal endpoint.
type Cache struct {
	baseURL     string
	internalKey string
	interval    time.Duration
	httpClient  *http.Client

	mu       sync.RWMutex
	snapshot []models.Rule
}

// New builds a rule cache that polls baseURL + "/internal/rules/enabled" every
// pollSeconds seconds, attaching internalKey as the internal-service header on
// each request. A non-positive pollSeconds falls back to a 10s interval.
func New(baseURL, internalKey string, pollSeconds int) *Cache {
	if pollSeconds <= 0 {
		pollSeconds = 10
	}
	return &Cache{
		baseURL:     baseURL,
		internalKey: internalKey,
		interval:    time.Duration(pollSeconds) * time.Second,
		httpClient:  &http.Client{Timeout: httpTimeout},
		snapshot:    []models.Rule{},
	}
}

// Snapshot returns the current set of enabled rules for evaluation. The
// returned slice is a copy, so callers may read it freely without holding the
// lock and without risk of a concurrent refresh mutating it underneath them.
func (c *Cache) Snapshot() []models.Rule {
	c.mu.RLock()
	defer c.mu.RUnlock()

	out := make([]models.Rule, len(c.snapshot))
	copy(out, c.snapshot)
	return out
}

// Refresh performs a single poll of the enabled-rules endpoint and atomically
// swaps the in-memory snapshot on success. On any error the existing snapshot
// is left untouched so evaluation continues against the last known-good rule
// set.
func (c *Cache) Refresh(ctx context.Context) error {
	rules, err := c.fetch(ctx)
	if err != nil {
		return err
	}
	c.store(rules)
	return nil
}

// Start performs an initial refresh and then keeps the snapshot up to date by
// polling on the configured interval until ctx is cancelled. It is intended to
// be run in its own goroutine. Poll failures are logged and retried on the next
// tick; they never tear down the loop.
func (c *Cache) Start(ctx context.Context) {
	if err := c.Refresh(ctx); err != nil {
		log.Printf("rulecache: initial refresh failed: %v", err)
	}

	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.Refresh(ctx); err != nil {
				log.Printf("rulecache: refresh failed: %v", err)
			}
		}
	}
}

// fetch retrieves and decodes the enabled rules from the incident-service.
func (c *Cache) fetch(ctx context.Context) ([]models.Rule, error) {
	url := c.baseURL + "/internal/rules/enabled"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	internalauth.AttachInternalKey(req, c.internalKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("incident-service returned status %d for enabled rules", resp.StatusCode)
	}

	var rules []models.Rule
	if err := json.NewDecoder(resp.Body).Decode(&rules); err != nil {
		return nil, fmt.Errorf("decoding enabled rules: %w", err)
	}
	return rules, nil
}

// store atomically replaces the current snapshot under the write lock.
func (c *Cache) store(rules []models.Rule) {
	if rules == nil {
		rules = []models.Rule{}
	}
	c.mu.Lock()
	c.snapshot = rules
	c.mu.Unlock()
}
