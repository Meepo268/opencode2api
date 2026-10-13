package gateway

import (
	"context"

	"errors"
	"strings"

	"time"

	"opencode2api/internal/config"
	"opencode2api/internal/models"
)

func (m *RuntimeManager) AvailabilitySnapshot() []models.Availability {
	items := []models.Availability{}
	r := m.current.Load()
	if r == nil {
		return items
	}
	hidden := make(map[string]bool, len(r.gateway.cfg.Models.Hidden))
	for _, model := range r.gateway.cfg.Models.Hidden {
		hidden[model] = true
	}
	for _, model := range r.gateway.catalog.ListIncludingHidden() {
		if !r.gateway.catalog.IsFreeModel(model) {
			continue
		}
		item := r.availability.Get(model)
		item.Hidden = hidden[model] || r.gateway.catalog.IsHidden(model)
		if item.Hidden {
			// Hidden free models stay visible here so the operator can unhide
			// them; they are excluded from discovery, routing and probing.
			item.Disabled = false
		}
		items = append(items, item)
	}
	return items
}

func (m *RuntimeManager) RestoreModel(model string) error {
	m.updateMu.Lock()
	defer m.updateMu.Unlock()
	r := m.current.Load()
	if r == nil {
		return errors.New("gateway runtime is unavailable")
	}
	for _, item := range m.AvailabilitySnapshot() {
		if item.Model == model {
			return r.availability.Restore(model, time.Now().UTC())
		}
	}
	return errors.New("unknown free model")
}

// SetManualModel switches a free model between manual and automatic control.
// Manual models stay enabled and are excluded from automatic probing.
func (m *RuntimeManager) SetManualModel(model string, manual bool) error {
	m.updateMu.Lock()
	defer m.updateMu.Unlock()
	r := m.current.Load()
	if r == nil {
		return errors.New("gateway runtime is unavailable")
	}
	for _, item := range m.AvailabilitySnapshot() {
		if item.Model == model {
			return r.availability.SetManual(model, manual, time.Now().UTC())
		}
	}
	return errors.New("unknown free model")
}

// SetHiddenModel adds or removes a model ID from models.hidden. Hidden IDs
// need not exist in the current catalog; unknown IDs are kept so a model that
// appears later stays hidden.
func (m *RuntimeManager) SetHiddenModel(model string, hidden bool) error {
	model = strings.TrimSpace(model)
	if model == "" {
		return errors.New("model is required")
	}
	_, err := m.Update(func(cfg *config.Config) error {
		kept := make([]string, 0, len(cfg.Models.Hidden)+1)
		for _, existing := range cfg.Models.Hidden {
			if existing == model {
				continue
			}
			kept = append(kept, existing)
		}
		if hidden {
			kept = append(kept, model)
		}
		cfg.Models.Hidden = kept
		return nil
	})
	return err
}

func (m *RuntimeManager) startAvailabilityChecks() {
	ctx, cancel := context.WithCancel(m.root)
	m.availabilityCancel = cancel
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			m.checkFreeModels(ctx)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (m *RuntimeManager) checkFreeModels(ctx context.Context) {
	for _, item := range m.AvailabilitySnapshot() {
		if ctx.Err() != nil {
			return
		}
		if item.Hidden {
			continue
		}
		r := m.current.Load()
		if r == nil {
			return
		}
		item = r.availability.Get(item.Model)
		if item.Manual {
			continue
		}
		if time.Now().Before(item.NextCheck) {
			continue
		}
		result := r.gateway.probeFreeModel(ctx, item.Model)
		if !result.attempted || ctx.Err() != nil {
			continue
		}
		// Config changes may replace credentials or endpoints during a probe.
		m.updateMu.Lock()
		if m.current.Load() == r {
			if err := r.availability.Record(item.Model, item.Generation, result.success, result.reason, result.channel, time.Now().UTC(), result.effort); err != nil {
				m.logger.Warn("model availability state save failed", "error", err)
			}
			m.logger.Info("free model availability checked", "component", "models", "event", "availability_checked", "model", item.Model, "available", result.success, "reason", result.reason, "channel", result.channel, "proxy", result.proxy)
		}
		m.updateMu.Unlock()
	}
}

// ProbeResult is the JSON view of a manual one-off free-model probe.
type ProbeResult struct {
	Model     string `json:"model"`
	Attempted bool   `json:"attempted"`
	Success   bool   `json:"success"`
	Reason    string `json:"reason"`
	Channel   string `json:"channel"`
	Proxy     string `json:"proxy,omitempty"`
	Recorded  bool   `json:"recorded"`
}

// ProbeNow runs a one-off probe for a model without waiting for the minutely
// scheduler. Hidden models are rejected outright; manual models are probed
// for display but their result is never recorded (manual records are frozen
// by design). The caller blocks up to ~80s.
func (m *RuntimeManager) ProbeNow(model string) (ProbeResult, error) {
	model = strings.TrimSpace(model)
	if model == "" {
		return ProbeResult{}, errors.New("model is required")
	}
	r := m.current.Load()
	if r == nil {
		return ProbeResult{}, errors.New("gateway runtime is unavailable")
	}
	if r.gateway.cfg.IsHiddenModel(model) || r.gateway.catalog.IsHidden(model) {
		return ProbeResult{}, errors.New("model is hidden")
	}
	item := r.availability.Get(model)
	ctx, cancel := context.WithTimeout(m.root, 80*time.Second)
	defer cancel()
	result := r.gateway.probeFreeModel(ctx, model)
	out := ProbeResult{
		Model: model, Attempted: result.attempted,
		Success: result.success, Reason: result.reason, Channel: result.channel,
		Proxy: result.proxy,
	}
	if !result.attempted {
		return out, nil
	}
	m.updateMu.Lock()
	defer m.updateMu.Unlock()
	if m.current.Load() != r {
		return out, nil
	}
	// Re-read: a concurrent save may have switched the model to manual.
	item = r.availability.Get(model)
	if item.Manual {
		return out, nil
	}
	if err := r.availability.Record(model, item.Generation, result.success, result.reason, result.channel, time.Now().UTC(), result.effort); err != nil {
		return out, err
	}
	out.Recorded = true
	m.logger.Info("manual model probe finished", "component", "models", "event", "manual_probe", "model", model, "available", result.success, "reason", result.reason, "channel", result.channel, "proxy", result.proxy)
	return out, nil
}
