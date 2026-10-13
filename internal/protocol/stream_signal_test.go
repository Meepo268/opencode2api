package protocol

import (
	"errors"
	"io"
	"testing"
)

func TestUpstreamSignaledError(t *testing.T) {
	if !UpstreamSignaledError(errStreamUpstreamFailure) {
		t.Fatal("sentinel must classify as upstream-signaled")
	}
	if UpstreamSignaledError(io.ErrUnexpectedEOF) {
		t.Fatal("connection break must not classify as upstream-signaled")
	}
	if UpstreamSignaledError(errors.New("boom")) {
		t.Fatal("generic error must not classify as upstream-signaled")
	}
	if UpstreamSignaledError(nil) {
		t.Fatal("nil must not classify as upstream-signaled")
	}
}
