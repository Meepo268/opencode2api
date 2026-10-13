package gateway

import (
	"testing"
)

func testTransports(names []string, healthy []bool) *transportPool {
	p := &transportPool{items: make([]*proxyTransport, 0, len(names))}
	for i, name := range names {
		proxy := &proxyTransport{index: i, name: name}
		if i < len(healthy) {
			proxy.healthy.Store(healthy[i])
		} else {
			proxy.healthy.Store(true)
		}
		p.items = append(p.items, proxy)
	}
	return p
}

func TestAllowedProxySetAndOrder(t *testing.T) {
	transports := testTransports([]string{"direct", "http://us1:7890", "http://us2:7890"}, nil)
	allow := allowedProxySet(transports, []string{"http://us2:7890", "direct"})
	if len(allow) != 2 || !allow[0] || !allow[2] || allow[1] {
		t.Fatalf("allow set broken, got %v", allow)
	}
	ordered := allowedProxiesInOrder(transports, []string{"http://us2:7890", "direct"})
	if len(ordered) != 2 || ordered[0].name != "http://us2:7890" || ordered[1].name != "direct" {
		t.Fatalf("order not preserved, got %v", ordered)
	}
	if got := allowedProxySet(transports, []string{"http://missing:1"}); len(got) != 0 {
		t.Fatalf("unknown proxies should be dropped, got %v", got)
	}
}

func TestPickAllowedProxyHealthyFirst(t *testing.T) {
	transports := testTransports(
		[]string{"direct", "http://us1:7890", "http://us2:7890"},
		[]bool{false, true, true},
	)
	allowed := allowedProxiesInOrder(transports, []string{"direct", "http://us1:7890", "http://us2:7890"})
	// Start offset points at unhealthy direct; must skip to a healthy one.
	if got := pickAllowedProxy(allowed, 0, 0); got == nil || got.name == "direct" {
		t.Fatalf("should skip unhealthy, got %v", got)
	}
	single := allowed[:1]
	if got := pickAllowedProxy(single, 0, 5); got != single[0] {
		t.Fatal("single-element pool must return itself")
	}
	allDown := testTransports([]string{"a", "b"}, []bool{false, false})
	downAllowed := allowedProxiesInOrder(allDown, []string{"a", "b"})
	if got := pickAllowedProxy(downAllowed, 0, 1); got == nil {
		t.Fatal("all-unhealthy pool must still return one for recovery")
	}
}

func TestProxyAffinityOffsetStable(t *testing.T) {
	first := proxyAffinityOffset("session-A\x00model-X", 3)
	second := proxyAffinityOffset("session-A\x00model-X", 3)
	if first != second {
		t.Fatal("affinity offset must be stable")
	}
	if got := proxyAffinityOffset("anything", 0); got != 0 {
		t.Fatal("zero size must return 0")
	}
}

func TestAnonymousCursorNextAllowed(t *testing.T) {
	transports := testTransports([]string{"direct", "http://us1:7890"}, nil)
	pool := &anonymousPool{nodes: []*anonymousNode{
		{proxy: transports.items[0]},
		{proxy: transports.items[1]},
	}}
	cursor := anonymousCursor{pool: pool, start: 0}
	allow := map[int]bool{1: true}
	node := cursor.NextAllowed(allow)
	if node == nil || node.proxy.index != 1 {
		t.Fatalf("should only return allowed proxy, got %v", node)
	}
	if node := cursor.NextAllowed(allow); node != nil {
		t.Fatal("single-pass cursor must exhaust after one allowed hit")
	}
	// Nil allow means no restriction.
	fresh := anonymousCursor{pool: pool, start: 0}
	if node := fresh.NextAllowed(nil); node == nil {
		t.Fatal("nil allow must behave like Next")
	}
}
