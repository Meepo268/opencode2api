package gateway

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"
)

// This file implements the content-refusal detour: when the primary model
// refuses on content-policy grounds, the session is steered to its
// model_fallback target for a few rounds before the primary is probed again.
//
// Three serving shapes are handled, because a refusal can surface anywhere:
// non-streaming bodies are fully buffered, so detection is structural and
// the same request falls back; streaming refusals before the first byte
// leave nothing flushed downstream, so they fall back just as cleanly; a
// refusal after the flush cannot be retracted (bytes already sent cannot be
// unsent, and splicing a second model's answer behind a partial one risks
// duplicate tool calls), so the current turn ends and only the session is
// armed for the next request.

// refusalRoundsCap bounds the session detour; refusalTTL bounds the store.
const (
	refusalStoreCap = 4096
	refusalTTL      = 2 * time.Hour
)

// detectContentRefusal reports whether a buffered upstream response body
// refuses on content-policy grounds. It walks decoded JSON and only honors
// refusal signals in their structural positions, so conversation text that
// merely mentions filters can never match:
//
//   - error.code is content_policy_blocked or content_filter (error envelope)
//   - any finish_reason / stop_reason equals content_filter (chat, anthropic,
//     and transcoded streaming events collapsed to a document)
//   - any incomplete_details.reason equals content_filter (responses); other
//     incomplete reasons such as max_output_tokens must NOT match.
func detectContentRefusal(body []byte) bool {
	var v any
	if err := json.Unmarshal(body, &v); err != nil {
		return false
	}
	return walkRefusal(v)
}

func walkRefusal(v any) bool {
	switch t := v.(type) {
	case map[string]any:
		if s, ok := t["finish_reason"].(string); ok && s == "content_filter" {
			return true
		}
		if s, ok := t["stop_reason"].(string); ok && s == "content_filter" {
			return true
		}
		if m, ok := t["incomplete_details"].(map[string]any); ok {
			if s, ok := m["reason"].(string); ok && s == "content_filter" {
				return true
			}
		}
		if m, ok := t["error"].(map[string]any); ok {
			if s, ok := m["code"].(string); ok && (s == "content_policy_blocked" || s == "content_filter") {
				return true
			}
		}
		for _, child := range t {
			if walkRefusal(child) {
				return true
			}
		}
	case []any:
		for _, child := range t {
			if walkRefusal(child) {
				return true
			}
		}
	}
	return false
}

// firstEventRefusal inspects one buffered SSE event (including the "data: "
// framing lines) for the same refusal signals. It is used before the first
// byte is flushed downstream, when falling back is still seamless.
func firstEventRefusal(event []byte) bool {
	for _, line := range bytes.Split(event, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if !bytes.HasPrefix(line, []byte("data:")) {
			continue
		}
		payload := bytes.TrimSpace(line[len("data:"):])
		if len(payload) == 0 || string(payload) == "[DONE]" {
			continue
		}
		var v any
		if err := json.Unmarshal(payload, &v); err != nil {
			continue
		}
		if walkRefusal(v) {
			return true
		}
	}
	return false
}

// streamRefusalProbe reports whether raw stream bytes carry a refusal signal.
// Wire encoding may use compact or spaced JSON, so both spacings are probed.
// This is only ever used to arm the NEXT request after the flush; a false
// positive merely steers a few rounds to the fallback model, which then
// probes back automatically.
func streamRefusalProbe(chunk []byte) bool {
	markers := []string{
		`"finish_reason":"content_filter"`, `"finish_reason": "content_filter"`,
		`"stop_reason":"content_filter"`, `"stop_reason": "content_filter"`,
		`"reason":"content_filter"`, `"reason": "content_filter"`,
		`"content_policy_blocked"`,
	}
	for _, marker := range markers {
		if bytes.Contains(chunk, []byte(marker)) {
			return true
		}
	}
	return false
}

// refusalState is one session's detour: requests for `from` are served by
// `to` for `remaining` more rounds, then the primary is probed again
// (remaining == 0 marks a probe round already in flight). Recording `from`
// keeps an explicit request for another model from being hijacked into `to`.
type refusalState struct {
	from      string
	to        string
	remaining int
	updated   time.Time
}

// refusalStore is a bounded session-to-detour map with lazy expiry. Only
// refusal-driven routing is recorded; all other sessions route normally.
type refusalStore struct {
	mu    sync.Mutex
	items map[string]refusalState
}

func newRefusalStore() *refusalStore {
	return &refusalStore{items: make(map[string]refusalState)}
}

// armed returns the detour for a session, sweeping one expired entry per
// read so the map cannot grow without bound.
func (s *refusalStore) armed(session string) (refusalState, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, ok := s.items[session]
	if !ok {
		return refusalState{}, false
	}
	if time.Since(st.updated) > refusalTTL {
		delete(s.items, session)
		return refusalState{}, false
	}
	return st, true
}

// arm starts (or restarts) a detour of rounds fallback rounds for requests
// naming from.
func (s *refusalStore) arm(session, from, to string, rounds int) {
	if session == "" || from == "" || to == "" || rounds <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.items) >= refusalStoreCap {
		var oldest string
		var oldestAt time.Time
		first := true
		for k, v := range s.items {
			if first || v.updated.Before(oldestAt) {
				oldest, oldestAt, first = k, v.updated, false
			}
		}
		delete(s.items, oldest)
	}
	s.items[session] = refusalState{from: from, to: to, remaining: rounds, updated: time.Now()}
}

// consumed burns one fallback round after it was served.
func (s *refusalStore) consumed(session string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, ok := s.items[session]
	if !ok {
		return
	}
	if st.remaining > 0 {
		st.remaining--
	}
	st.updated = time.Now()
	s.items[session] = st
}

// clear drops the detour once the primary answers cleanly again.
func (s *refusalStore) clear(session string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.items, session)
}

// matchRefusalDetour reports whether this request's model is the recorded
// refusing primary whose current mapping still points at the recorded
// fallback. An explicit request for any other model — including the
// fallback itself — must never be hijacked into st.to.
func matchRefusalDetour(model string, st refusalState, fallbackFor func(string) string) (string, bool) {
	if model == "" || model != st.from {
		return "", false
	}
	want := fallbackFor(model)
	if want == "" || want != st.to {
		return "", false
	}
	return want, true
}

// refusalPeekCap bounds how much of a streaming body is buffered while
// waiting for the first SSE event boundary.
const refusalPeekCap = 32 << 10

// replayCloser replays buffered bytes before the live body. Close closes the
// underlying body so connections are still reused.
type replayCloser struct {
	io.Reader
	io.Closer
}

// peekFirstEvent buffers one SSE event (up to the first blank line, or
// refusalPeekCap bytes) and returns the buffered event plus a replay reader
// that yields the same bytes again followed by the remainder.
func peekFirstEvent(rc io.ReadCloser) ([]byte, io.ReadCloser, error) {
	buf := make([]byte, 0, 4096)
	tmp := make([]byte, 4096)
	for len(buf) < refusalPeekCap {
		n, err := rc.Read(tmp)
		if n > 0 {
			buf = append(buf, tmp[:n]...)
			if bytes.Contains(buf, []byte("\n\n")) || bytes.Contains(buf, []byte("\r\n\r\n")) {
				break
			}
			if len(buf) >= refusalPeekCap {
				break
			}
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			replay := &replayCloser{Reader: io.MultiReader(bytes.NewReader(append([]byte(nil), buf...)), rc), Closer: rc}
			return buf, replay, err
		}
	}
	replay := &replayCloser{Reader: io.MultiReader(bytes.NewReader(append([]byte(nil), buf...)), rc), Closer: rc}
	return buf, replay, nil
}

// sniffWriter passes bytes through while flagging refusal markers. It
// implements http.Flusher when the underlying writer does so streaming
// helpers that assert Flusher keep working.
type sniffWriter struct {
	w       http.ResponseWriter
	tripped bool
	enabled bool
}

func (s *sniffWriter) Header() http.Header { return s.w.Header() }

func (s *sniffWriter) Write(p []byte) (int, error) {
	if !s.tripped && s.enabled && streamRefusalProbe(p) {
		s.tripped = true
	}
	return s.w.Write(p)
}

func (s *sniffWriter) WriteHeader(status int) { s.w.WriteHeader(status) }

func (s *sniffWriter) Flush() {
	if f, ok := s.w.(http.Flusher); ok {
		f.Flush()
	}
}

// armRefusal starts a session detour from the refusing primary toward the
// fallback model. Rounds of 0 keeps only the current-turn fallback with no
// stickiness.
func (g *Gateway) armRefusal(session, from, to string) {
	rounds := g.cfg.ContentRefusal.Rounds
	if session == "" || from == "" || to == "" || rounds <= 0 {
		return
	}
	g.refusals.arm(session, from, to, rounds)
	g.logger.Info("content refusal armed", "component", "upstream", "event", "refusal_armed", "session", session, "from_model", from, "to_model", to, "rounds", rounds)
}
