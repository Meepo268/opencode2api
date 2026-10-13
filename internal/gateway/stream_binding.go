package gateway

import (
	"context"
	"errors"

	"opencode2api/internal/config"
	wire "opencode2api/internal/protocol"
)

// servingBinding records which key/proxy served the winning upstream attempt
// so a mid-stream break can cool exactly that exit. HTTP status is already
// 200 and partial bytes are already flushed at that point, so a retry is
// impossible; the next best thing is making sure the client's next turn
// ("继续") is not glued back onto the same flaky exit by session affinity.
//
// It travels on the request context from the attempt loops (which know the
// concrete node/proxy) to the streaming handlers (which only see the
// response). Streaming is the only reader.
type servingBinding struct {
	tier  config.Tier
	proxy *proxyTransport
	nodes *nodePool
	node  *upstreamNode
	anon  *anonymousNode
}

type servingBindingKey struct{}

func withServingBinding(ctx context.Context) (context.Context, *servingBinding) {
	holder := &servingBinding{}
	return context.WithValue(ctx, servingBindingKey{}, holder), holder
}

func bindingFrom(ctx context.Context) *servingBinding {
	holder, _ := ctx.Value(servingBindingKey{}).(*servingBinding)
	return holder
}

func noteServingBinding(ctx context.Context, tier config.Tier, nodes *nodePool, node *upstreamNode, anon *anonymousNode, proxy *proxyTransport) {
	holder := bindingFrom(ctx)
	if holder == nil || proxy == nil {
		return
	}
	holder.tier = tier
	holder.proxy = proxy
	holder.nodes = nodes
	holder.node = node
	holder.anon = anon
}

// coolServingBinding cools the exit that served a stream which then broke
// mid-flight. One MarkFailure is a single short cooldown (one rung of the
// exponential backoff), just enough to steer the immediate retry elsewhere.
//
// It deliberately does nothing for: a nil error, an expired request budget
// (blame is unknowable), an upstream-sent error envelope (the exit behaved
// correctly), a gone client, and diagnostic requests (which must never touch
// production cooldowns).
func (g *Gateway) coolServingBinding(ctx context.Context, streamErr error, anonymous bool) {
	if streamErr == nil || ctx.Err() != nil {
		return
	}
	if wire.UpstreamSignaledError(streamErr) {
		return
	}
	var clientGone *wire.ClientWriteError
	if errors.As(streamErr, &clientGone) {
		return
	}
	if isDiagnosticRequest(ctx) {
		return
	}
	holder := bindingFrom(ctx)
	if holder == nil || holder.proxy == nil {
		return
	}
	if anonymous {
		if holder.anon != nil && g.anonymous != nil {
			g.anonymous.MarkFailure(holder.anon, nil, streamErr)
		}
	} else if holder.nodes != nil && holder.node != nil {
		holder.nodes.MarkFailure(holder.node, nil, streamErr)
	}
	// Neutral route check only: headers already proved the route once, so a
	// mid-stream break alone must not evict the proxy. Real transport-class
	// failures observed here would still move keys away via the normal path.
	g.verifyProxyAfterError(ctx, holder.proxy, 0)
	g.logger.Debug("cooled the exit serving a broken stream",
		"component", "upstream", "event", "stream_exit_cooled",
		"tier", holder.tier, "proxy", config.RedactURL(holder.proxy.name))
}
