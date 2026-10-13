package models

import (
	"testing"

	"opencode2api/internal/config"
	wire "opencode2api/internal/protocol"
)

func TestHiddenModelsExcluded(t *testing.T) {
	catalog := NewCatalog(config.TierGo, nil)
	native := map[config.Tier]map[string]wire.Protocol{
		config.TierZen: {"a-free": wire.Chat, "b-free": wire.Chat},
		config.TierGo:  {"a-free": wire.Chat, "b-free": wire.Chat},
	}
	catalog.ReplaceWithCapabilities(
		[]string{"a-free", "b-free"}, []string{"a-free", "b-free"},
		native, nil, nil,
	)
	catalog.SetHidden([]string{"b-free"})
	if !catalog.IsHidden("b-free") || catalog.IsHidden("a-free") {
		t.Fatal("IsHidden broken")
	}
	if catalog.Supported("b-free") {
		t.Fatal("hidden model must not be supported")
	}
	if _, err := catalog.Route("b-free", true, true, true); err == nil {
		t.Fatal("hidden model must not route")
	}
	ids := catalog.List()
	if len(ids) != 1 || ids[0] != "a-free" {
		t.Fatalf("List must exclude hidden, got %q", ids)
	}
	if got := catalog.ListIncludingHidden(); len(got) != 2 {
		t.Fatalf("ListIncludingHidden must keep hidden, got %q", got)
	}
	if _, err := catalog.RouteForTier("b-free", config.TierGo, false, true); err == nil {
		t.Fatal("hidden model must not route for tier")
	}
	_ = wire.Chat
}
