package gateway

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"
)

func testSlog() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func testBindingContext() (context.Context, *servingBinding) {
	return withServingBinding(context.Background())
}

func TestNoteAndCoolKeyNode(t *testing.T) {
	transports := testTransports([]string{"direct", "http://us1:7890"}, nil)
	nodes, err := newNodePool([]string{"key-A"}, transports, 15*time.Second)
	if err != nil {
		t.Fatalf("newNodePool: %v", err)
	}
	ctx, _ := testBindingContext()
	cursor := nodes.CursorFor("session-1")
	node := cursor.Next()
	if node == nil {
		t.Fatal("expected a node")
	}
	proxy := transports.items[1]
	// Block the neutral post-failure route check: it would dial out through
	// a nil test client. Production always has a real client here.
	proxy.checking.Store(true)
	noteServingBinding(ctx, "go", nodes, node, nil, proxy)
	g := &Gateway{goNodes: nodes, transports: transports, logger: testSlog()}
	before := node.cooldownUntil.Load()
	g.coolServingBinding(ctx, errors.New("boom"), false)
	if got := node.cooldownUntil.Load(); got <= before || got <= time.Now().UnixNano() {
		t.Fatalf("key node was not cooled: before=%d after=%d", before, got)
	}
}

func TestCoolSkipsNilError(t *testing.T) {
	transports := testTransports([]string{"direct"}, nil)
	nodes, err := newNodePool([]string{"key-A"}, transports, 15*time.Second)
	if err != nil {
		t.Fatalf("newNodePool: %v", err)
	}
	ctx, _ := testBindingContext()
	keyCursor := nodes.Cursor()
	node := keyCursor.Next()
	noteServingBinding(ctx, "zen", nodes, node, nil, transports.items[0])
	g := &Gateway{zenNodes: nodes, transports: transports, logger: testSlog()}
	// Nil errors must never cool; the sentinel (upstream-sent error) case is
	// covered by TestUpstreamSignaledError plus the guard in coolServingBinding.
	before := node.cooldownUntil.Load()
	g.coolServingBinding(ctx, nil, false)
	if got := node.cooldownUntil.Load(); got != before {
		t.Fatal("nil error must not cool")
	}
}

func TestCoolSkipsDiagnosticAndExpired(t *testing.T) {
	transports := testTransports([]string{"direct"}, nil)
	nodes, err := newNodePool([]string{"key-A"}, transports, 15*time.Second)
	if err != nil {
		t.Fatalf("newNodePool: %v", err)
	}
	nodeCursor := nodes.Cursor()
	node := nodeCursor.Next()
	diagCtx, _ := withServingBinding(WithDiagnosticRequest(context.Background()))
	noteServingBinding(diagCtx, "zen", nodes, node, nil, transports.items[0])
	g := &Gateway{zenNodes: nodes, transports: transports, logger: testSlog()}
	before := node.cooldownUntil.Load()
	g.coolServingBinding(diagCtx, errors.New("boom"), false)
	if got := node.cooldownUntil.Load(); got != before {
		t.Fatal("diagnostic request must not touch production cooldowns")
	}
	expired, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	expired, _ = withServingBinding(expired)
	noteServingBinding(expired, "zen", nodes, node, nil, transports.items[0])
	g.coolServingBinding(expired, errors.New("boom"), false)
	if got := node.cooldownUntil.Load(); got != before {
		t.Fatal("expired budget must not cool")
	}
}

func TestCoolAnonymousNode(t *testing.T) {
	transports := testTransports([]string{"direct", "http://us1:7890"}, nil)
	pool := &anonymousPool{
		nodes:    []*anonymousNode{{proxy: transports.items[0]}, {proxy: transports.items[1]}},
		cooldown: 15 * time.Second,
	}
	ctx, _ := testBindingContext()
	cursor := pool.CursorFor("session-1")
	node := cursor.Next()
	if node == nil {
		t.Fatal("expected an anonymous node")
	}
	// See above: keep the neutral route check out of unit tests.
	node.proxy.checking.Store(true)
	noteServingBinding(ctx, "zen", nil, nil, node, node.proxy)
	g := &Gateway{anonymous: pool, transports: transports, logger: testSlog()}
	before := node.cooldownUntil.Load()
	g.coolServingBinding(ctx, errors.New("boom"), true)
	if got := node.cooldownUntil.Load(); got <= before || got <= time.Now().UnixNano() {
		t.Fatal("anonymous node was not cooled")
	}
}
