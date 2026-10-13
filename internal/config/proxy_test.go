package config

import (
	"strings"
	"testing"
)

func testProxyConfig(proxies []string, byModel map[string][]string) Config {
	cfg := Config{
		Proxies:      append([]string(nil), proxies...),
		ProxyByModel: byModel,
		Retry:        RetryConfig{MaxAttempts: 3, TimeoutSeconds: 30},
	}
	cfg.effectiveProxies = append([]string(nil), proxies...)
	if len(cfg.effectiveProxies) == 0 {
		cfg.effectiveProxies = []string{"direct"}
	}
	return cfg
}

func TestNormalizeProxyByModelRejectsUnknown(t *testing.T) {
	cfg := testProxyConfig(
		[]string{"direct", "http://us1:7890"},
		map[string][]string{"A": {"http://us1:7890/"}},
	)
	if err := normalizeProxyByModel(&cfg); err == nil {
		t.Fatal("expected error for trailing-slash proxy, got nil")
	} else if !strings.Contains(err.Error(), "unknown proxy") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNormalizeProxyByModelAcceptsFingerprint(t *testing.T) {
	raw := "http://user:pass@us1:7890"
	cfg := testProxyConfig(
		[]string{"direct", raw},
		map[string][]string{"A": {Fingerprint(raw)}},
	)
	if err := normalizeProxyByModel(&cfg); err != nil {
		t.Fatalf("fingerprint should resolve, got: %v", err)
	}
	got := cfg.ProxyByModel["A"]
	if len(got) != 1 || got[0] != raw {
		t.Fatalf("fingerprint did not resolve to raw, got %q", got)
	}
}

func TestProxyAllowlistWildcardFallback(t *testing.T) {
	cfg := testProxyConfig(
		[]string{"direct", "http://us1:7890"},
		map[string][]string{
			"*": {"direct"},
			"A": {"http://us1:7890"},
		},
	)
	if err := normalizeProxyByModel(&cfg); err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if got := cfg.ProxyAllowlistFor("A"); len(got) != 1 || got[0] != "http://us1:7890" {
		t.Fatalf("exact match broken, got %q", got)
	}
	if got := cfg.ProxyAllowlistFor("unknown-model"); len(got) != 1 || got[0] != "direct" {
		t.Fatalf("wildcard fallback broken, got %q", got)
	}
	global := testProxyConfig([]string{"direct", "http://us1:7890"}, nil)
	if got := global.ProxyAllowlistFor("anything"); len(got) != 2 {
		t.Fatalf("global fallback broken, got %q", got)
	}
	// Mutating the result must not mutate the config.
	got := cfg.ProxyAllowlistFor("A")
	got[0] = "mutated"
	if cfg.ProxyByModel["A"][0] == "mutated" {
		t.Fatal("ProxyAllowlistFor must return a copy")
	}
}

func TestNormalizeModelFallbackCycle(t *testing.T) {
	cfg := Config{ModelFallback: map[string]string{"A": "B", "B": "A"}}
	if err := normalizeModelFallback(&cfg); err == nil {
		t.Fatal("expected 2-cycle error, got nil")
	}
	cfg = Config{ModelFallback: map[string]string{"A": "B", "B": "C", "C": "A"}}
	if err := normalizeModelFallback(&cfg); err == nil {
		t.Fatal("expected 3-cycle error, got nil")
	}
	cfg = Config{ModelFallback: map[string]string{"A": "A"}}
	if err := normalizeModelFallback(&cfg); err == nil {
		t.Fatal("expected self-reference error, got nil")
	}
	cfg = Config{ModelFallback: map[string]string{"A": "C"}}
	if err := normalizeModelFallback(&cfg); err != nil {
		t.Fatalf("valid fallback rejected: %v", err)
	}
	if got := cfg.FallbackFor("A"); got != "C" {
		t.Fatalf("FallbackFor broken, got %q", got)
	}
	if got := cfg.FallbackFor("missing"); got != "" {
		t.Fatalf("missing fallback should be empty, got %q", got)
	}
}

func TestEffectiveProxyAttempts(t *testing.T) {
	cfg := Config{Retry: RetryConfig{MaxAttempts: 3}}
	if got := cfg.EffectiveProxyAttempts(); got != 3 {
		t.Fatalf("0 should follow retry.max_attempts, got %d", got)
	}
	cfg.ProxyRetry.MaxAttempts = 5
	if got := cfg.EffectiveProxyAttempts(); got != 5 {
		t.Fatalf("explicit override broken, got %d", got)
	}
	bad := Config{ProxyRetry: ProxyRetryConfig{MaxAttempts: 11}}
	if err := normalizeProxyRetry(&bad); err == nil {
		t.Fatal("expected max_attempts range error, got nil")
	}
}

func TestNormalizeHidden(t *testing.T) {
	cfg := Config{}
	cfg.Models.Hidden = []string{" b ", "", "b", "a"}
	normalizeHidden(&cfg)
	if len(cfg.Models.Hidden) != 2 || cfg.Models.Hidden[0] != "b" || cfg.Models.Hidden[1] != "a" {
		t.Fatalf("hidden normalize broken, got %q", cfg.Models.Hidden)
	}
	if !cfg.IsHiddenModel("a") || cfg.IsHiddenModel("missing") {
		t.Fatal("IsHiddenModel broken")
	}
}
