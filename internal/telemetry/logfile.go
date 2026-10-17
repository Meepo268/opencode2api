package telemetry

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// logFileLimit caps the on-disk log before it is rotated to a single backup.
// One backup is kept so an operator comparing "before/after a fix" still has
// the previous run, without letting a debug-level service fill the disk.
const logFileLimit = 32 << 20 // 32 MiB

// LogFile mirrors the structured JSON log stream to disk. It is safe for
// concurrent use and can be enabled, retargeted or disabled at runtime by a
// configuration reload.
//
// The bytes written here are the same redacted JSON records that go to
// stdout, so the file never contains configured secrets. It does contain
// request metadata (models, latency, proxy names), and it contains
// conversation content when logging.dump_request_bodies is enabled.
type LogFile struct {
	mu   sync.Mutex
	file *os.File
	path string
	size int64
	// onError is invoked when a write or an open fails. Logging must never
	// take the service down, so failures are reported once and then ignored
	// until the next successful rotation.
	onError func(error)
}

// NewLogFile creates a disabled sink. Call Apply with a path to enable it.
func NewLogFile() *LogFile {
	return &LogFile{}
}

// SetErrorReporter installs the callback used to surface sink problems.
func (l *LogFile) SetErrorReporter(report func(error)) {
	l.mu.Lock()
	l.onError = report
	l.mu.Unlock()
}

// Apply enables, retargets or disables the sink. An empty path closes the
// current file and returns nil. Enabling twice with the same path is a no-op
// that keeps the existing file handle, so appending continues across a
// configuration save.
func (l *LogFile) Apply(path string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if path == "" || path == l.path {
		if path == "" {
			l.closeLocked()
		}
		return nil
	}
	l.closeLocked()

	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return fmt.Errorf("create log directory %s: %w", dir, err)
		}
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return fmt.Errorf("open log file %s: %w", path, err)
	}
	var size int64
	if info, statErr := file.Stat(); statErr == nil {
		size = info.Size()
	}
	l.file, l.path, l.size = file, path, size
	return nil
}

// Path reports the active sink path ("" when disabled).
func (l *LogFile) Path() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.path
}

// Close releases the file handle. Safe to call when disabled.
func (l *LogFile) Close() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.closeLocked()
}

func (l *LogFile) closeLocked() {
	if l.file != nil {
		_ = l.file.Close()
		l.file = nil
	}
	l.path, l.size = "", 0
}

// Write implements io.Writer for the JSON handler. It never returns an error
// to slog: a broken sink must not break request handling. Rotation renames
// the active file to path+".1" and reopens, keeping exactly one backup.
func (l *LogFile) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file == nil {
		// Consume the bytes so the caller's count stays correct.
		return len(p), nil
	}
	n, err := l.file.Write(p)
	l.size += int64(n)
	if err == nil && l.size >= logFileLimit {
		l.rotateLocked()
	}
	return n, err
}

// rotateLocked moves the active file aside and starts a fresh one. A failed
// rotation is not fatal: the handle stays open and keeps appending.
func (l *LogFile) rotateLocked() {
	path := l.path
	if path == "" {
		return
	}
	backup := path + ".1"
	_ = l.file.Close()
	l.file = nil
	if err := os.Rename(path, backup); err != nil {
		// Reopen the original path and keep going.
		if file, reopenErr := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); reopenErr == nil {
			l.file = file
			l.reportLocked(fmt.Errorf("log rotation rename failed, continuing in place: %w", err))
		} else {
			l.reportLocked(fmt.Errorf("log rotation failed, file logging disabled: %w", reopenErr))
			l.path, l.size = "", 0
			return
		}
	} else {
		file, reopenErr := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if reopenErr != nil {
			l.reportLocked(fmt.Errorf("log reopen after rotation failed, file logging disabled: %w", reopenErr))
			l.path, l.size = "", 0
			return
		}
		l.file = file
	}
	l.size = 0
}

func (l *LogFile) reportLocked(err error) {
	if l.onError != nil {
		l.onError(err)
	}
}
