// Interface language handling for the management console.
//
// The console ships with Simplified Chinese as its original language. That copy
// stays in index.html and the page modules and is used whenever the active
// locale has no entry in DICTIONARY, so switching languages never rewrites the
// originals.
//
// Usage from markup (static text is re-applied on every switch):
//   <h2 data-i18n="config.title">…original…</h2>
//   <input data-i18n-attr="placeholder:logs.search" />
// Usage from a page module:
//   import { t } from "../i18n.js";
//   t("配置已保存", "toast.config.saved")
//   t(`${n} 个`, "apikeys.count", n)
const STORAGE_KEY = "opencode2api.ui.lang";
const DEFAULT_LOCALE = "zh-CN";
const FLAGS = { "zh-CN": "🇨🇳", en: "🇺🇸", vi: "🇻🇳" };
const SUPPORTED = ["zh-CN", "en", "vi"];
const LABELS = { "zh-CN": "简体中文", en: "English", vi: "Tiếng Việt" };
const DATE_LOCALES = { "zh-CN": "zh-CN", en: "en-US", vi: "vi-VN" };
const listeners = [];
// Snapshot of the authored copy, so switching back restores it untouched.
const originals = new WeakMap();

const DICTIONARY = {
    en: {
      "doc.title": "opencode2api · Operations Handbook",
      "lang.label": "Language",

      "login.eyebrow": "Admin operations handbook / 2026",
      "login.headline": "Bring protocols, routing, and runtime state onto one desk.",
      "login.intro":
        "A local control plane with no external frontend. Configure, verify, connect, then keep the Gateway easy to explain.",
      "login.restricted": "Restricted console",
      "login.title": "Admin sign-in",
      "login.username": "Username",
      "login.password": "Password",
      "login.submit": "Enter the Operations Handbook",

      "sidebar.kicker": "Operations console",
      "sidebar.title": "Operations Handbook",
      "nav.overview": "Operations desk",
      "nav.guide": "First run",
      "nav.access": "Integration handbook",
      "nav.usage": "Token usage",
      "nav.playground": "Playground",
      "nav.diagnostics": "Routing diagnostics",
      "nav.config": "Configuration center",
      "nav.logs": "Event log",
      "nav.account": "Account security",
      "nav.model-quotas": "Models and quotas",
      "nav.api-keys": "API Key management",
      "nav.rotation": "Model rotation",
      "nav.availability": "Free model availability",
      "nav.group.runtime": "Runtime",
      "nav.group.integration": "Integration",
      "nav.group.models": "Models",
      "nav.group.system": "System",
      "overview.tab.summary": "Summary",
      "overview.tab.usage": "Usage",
      "overview.checklist.title": "Readiness checks",
      "overview.checklist.caption": "State comes from the current configuration and live resources.",
      "diagnostics.tab.playground": "Request test",
      "diagnostics.tab.ledger": "Request ledger",
      "diagnostics.tab.logs": "Event stream",
      "diagnostics.tab.route": "Routing and eligibility",
      "quotas.tab.quota": "Plan quota",
      "quotas.tab.free": "Free models",
      "config.tab.service": "Service",
      "config.tab.keys": "Secrets and anonymous",
      "config.tab.proxies": "Proxies",
      "config.tab.upstream": "Upstream and models",
      "config.tab.reasoning": "Reasoning and performance",
      "config.tab.logging": "Logging",
      "usage.hour": "Last 60 minutes",

      "topbar.refresh": "Refresh now",
      "topbar.logout": "Sign out",

      "page.availability.title": "Free model availability",
      "page.availability.sub": "Probed hourly; user-controlled models are not affected.",
      "page.rotation.title": "Model rotation",
      "page.rotation.sub": "Shared current model, failover on error, and attempt history.",
      "page.overview.title": "Operations desk",
      "page.overview.sub": "The last hour, process totals, and current resources.",
      "page.guide.title": "First run",
      "page.guide.sub": "Six checkpoints from configuration to your first request.",
      "page.access.title": "Integration handbook",
      "page.access.sub": "Chat, Responses, Anthropic, and SDK examples.",
      "page.usage.title": "Token usage",
      "page.usage.sub": "Coverage, per-minute trend, model ranking, and Tier distribution.",
      "page.playground.title": "Playground",
      "page.playground.sub": "Three input protocols sharing real Gateway routing and diagnostics.",
      "page.diagnostics.title": "Routing diagnostics",
      "page.diagnostics.sub": "Metadata, model eligibility, and each upstream attempt.",
      "page.config.title": "Configuration center",
      "page.config.sub": "Validate, then save atomically and hot-apply the fields that can change.",
      "page.logs.title": "Event log",
      "page.logs.sub": "Structured SSE data from the in-process ring buffer.",
      "page.account.title": "Account security",
      "page.account.sub": "A successful update revokes every admin session.",
      "page.model-quotas.title": "Models and quotas",
      "page.model-quotas.sub": "Available models, remaining shared plan quota, and reset times.",
      "page.api-keys.title": "API Key management",
      "page.api-keys.sub": "A separate access key for each caller.",

      "availability.title": "Probe free models",
      "availability.refresh": "Refresh status",
      "availability.desc":
        "Probes models whose metadata name contains free or whose price is 0 and that have not been excluded. The anonymous channel is tried first, and a Zen Key only after that; a model is disabled once it is genuinely broken and retried after 24 hours. Transient errors do not add extra disabled models: an enabled model is retried after 1 hour, and a disabled one keeps its old reason and is retried after 24 hours. When a model is re-enabled or switched to manual control it stays enabled and is no longer probed automatically; when it switches back to automatic, the next scheduler tick schedules the probe. System One uses its own dedicated 1+1 decision question set. With the effort set to auto, the highest probed and verified effort is shown. Hidden models are not listed in /v1/models and are never routed; they stay in the table so they can be unhidden here or from the routing table, but they are no longer probed.",
      "availability.col.model": "Model",
      "availability.col.state": "State",
      "availability.col.channel": "Channel / result",
      "availability.col.control": "Control",
      "availability.col.effort": "Verified reasoning effort",
      "availability.col.checked": "Last probe",
      "availability.col.next": "Next probe",
      "availability.col.action": "Action",

      "overview.requests": "Requests in the last hour",
      "overview.success": "Success rate",
      "overview.p95": "P95 latency",
      "overview.active": "Active / streaming",
      "overview.hour": "Last 60 minutes",
      "overview.http2xx": "HTTP 2xx–3xx",
      "overview.endToEnd": "End-to-end milliseconds",
      "overview.concurrent": "Concurrent requests",
      "overview.proxy.title": "Proxy nodes",
      "overview.proxy.caption": "These are proxy nodes; they are not described as exit IPs.",
      "overview.proxy.col.node": "Node",
      "overview.proxy.col.health": "Health",
      "overview.proxy.col.binding": "Binding",
      "overview.keys.title": "Key pool",
      "overview.keys.caption": "Only the last 5 characters of a key and its cooldown state are shown.",
      "overview.keys.col.tail": "Key tail",
      "overview.keys.col.tier": "Tier",
      "overview.keys.col.state": "State",
      "overview.distribution.title": "Request distribution",
      "overview.distribution.caption":
        "Aggregated over the last hour by endpoint, model, Tier, and status code.",

      "guide.title": "6-step deployment check",
      "guide.caption":
        "State is read from the current configuration and live resources; nothing is written to browser storage.",
      "guide.step.login": "Sign in to the admin console",
      "guide.step.login.desc": "The current session has been verified by the server.",
      "guide.step.serverkey": "Configure a Server Key",
      "guide.step.serverkey.desc": "Clients use the Server Key to reach the Gateway.",
      "guide.step.upstream": "Pick an upstream channel",
      "guide.step.upstream.desc": "At least one Zen / Go Key, or the anonymous channel enabled.",
      "guide.step.proxy": "Check the proxies",
      "guide.step.proxy.desc": "At least one proxy node is still healthy.",
      "guide.step.models": "Wait for the model catalog",
      "guide.step.access": "Copy an integration example",
      "guide.step.access.desc": "Open the Integration handbook and replace the model and YOUR_API_KEY.",
      "guide.done": "✓ Ready",
      "guide.todo": "○ Needs work",

      "access.base": "Base address",
      "access.protocols": "Three protocols",
      "access.sdk": "SDK example",
      "access.notes": "Integration notes",
      "access.base.title": "Base address",
      "access.base.caption": "The examples never contain a real Server Key.",
      "access.base.label": "Derived API Base",
      "access.model.label": "Example model",
      "access.protocols.title": "Three protocol endpoints",
      "access.sdk.title": "Python and JavaScript",
      "access.notes.title": "Notes for integration",
      "access.notes.auth": "OpenAI-compatible clients use <code>Authorization: Bearer YOUR_API_KEY</code>.",
      "access.notes.anthropic":
        "Anthropic clients can use <code>x-api-key</code> with the <code>/v1/messages</code> path.",
      "access.notes.stream":
        "Streaming requests keep the events of the original protocol; the Gateway converts when the protocols differ.",
      "access.notes.listen":
        "If the listener is bound to <code>0.0.0.0</code>, the examples use the current browser's hostname.",

      "usage.coverage": "Usage coverage",
      "usage.coverage.note": "Requests reporting token or reasoning usage",
      "usage.total": "Total tokens",
      "usage.cached": "Cached tokens",
      "usage.cached.note": "Cache hits reported by the upstream",
      "usage.reasoning": "Reasoning tokens",
      "usage.reasoning.note": "Reasoning usage reported by the upstream",
      "usage.trend.title": "Per-minute token trend",
      "usage.trend.caption": "Last 60 minutes; hover to see input, output, and total.",
      "usage.models.title": "Model ranking",
      "usage.models.caption": "Sorted by total_tokens.",
      "usage.models.col.model": "Model",
      "usage.models.col.input": "Input",
      "usage.models.col.output": "Output",
      "usage.models.col.total": "Total",
      "usage.tiers.title": "Tier distribution",
      "usage.tiers.caption": "Where Zen / Go tokens are going.",
      "usage.trend.peak": "Peak {0} tokens / minute · last {1} minutes",
      "usage.trend.empty": "No trend data yet",

      "playground.title": "Three-protocol request bench",
      "playground.caption": "The server forces non-streaming and routes through the real Gateway.",
      "playground.protocol": "Input protocol",
      "playground.model": "Model",
      "playground.key": "Upstream Key",
      "playground.key.auto": "Automatic routing (anonymous / Tier fallback / Key rotation)",
      "playground.key.caption":
        "When a specific key is chosen, only that key is tried: no switch to another key, another Tier, or the anonymous channel, and no change to the key's cooldown state or the proxy's health.",
      "playground.request": "Request JSON",
      "playground.reset": "Reset sample",
      "playground.run": "Send diagnostic request",
      "playground.result.title": "Diagnostic result",
      "playground.result.idle": "No request sent yet.",
      "playground.output": "Raw protocol response",

      "diagnostics.metadata.title": "Model metadata",
      "diagnostics.metadata.caption":
        "Status of the OpenCode price cache from models.dev; a price of 0 or a name containing free is enough to qualify for the anonymous channel.",
      "diagnostics.last.title": "Latest playground run",
      "diagnostics.last.caption":
        "Only the last run is retained in the current admin process.",
      "diagnostics.models.title": "Model routing table",
      "diagnostics.models.caption":
        "Explicit protocol, anonymous eligibility source, and how cost is determined.",
      "diagnostics.models.filter": "Filter models",
      "diagnostics.models.col.model": "Model",
      "diagnostics.models.col.protocol": "Native protocol",
      "diagnostics.models.col.route": "Route",
      "diagnostics.models.col.eligibility": "Anonymous eligibility",
      "diagnostics.models.col.source": "Evaluation source",
      "diagnostics.models.col.cost": "Input / output cost",
      "diagnostics.models.col.actions": "Actions",
      "diagnostics.models.hide": "Hide from clients",
      "diagnostics.models.hiddenRoute": "Hidden — not routed",
      "diagnostics.requests.title": "Request routing",
      "diagnostics.requests.caption":
        "The key tail or anonymous channel actually used per request; only the 100 most recent records are shown.",
      "diagnostics.attempts.title": "Upstream attempts",
      "diagnostics.attempts.caption":
        "Key tail, anonymous channel, and proxy node are masked; only the 100 most recent records are shown.",
      "diagnostics.col.time": "Time",
      "diagnostics.col.model": "Model",
      "diagnostics.col.tier": "Tier",
      "diagnostics.col.channel": "Channel",
      "diagnostics.col.tail": "Key tail",
      "diagnostics.col.attempts": "Attempts",
      "diagnostics.col.state": "State",
      "diagnostics.col.duration": "Duration",
      "diagnostics.col.proxy": "Proxy node",

      "config.server.title": "Server and admin console",
      "config.server.caption": "Listen addresses require a restart after saving.",
      "config.server.prefer": "Preferred Tier for authentication keys",
      "config.server.prefer.go": "Go (fall back to Zen on error)",
      "config.server.prefer.zen": "Zen (fall back to Go on error)",
      "config.server.session": "Session TTL (minutes)",
      "config.server.enabled": "Enable WebUI (restart required after change)",
      "config.secrets.title": "Secrets and anonymous channel",
      "config.secrets.caption":
        "Sensitive values are masked by default; a cleared value only takes effect after saving.",
      "config.secrets.reveal": "Reveal after re-verification",
      "config.secrets.anonymous": "Enable the Zen anonymous channel",
      "config.secrets.anonymousPriority": "Anonymous first: try the anonymous channel, then the keys",
      "config.secrets.anonymousPriorityHint": "When off, server keys are tried before the anonymous channel.",
      "config.secrets.add": "One key per line",
      "config.proxy.title": "Proxy nodes",
      "config.proxy.caption":
        "Supports direct, HTTP(S), and SOCKS URLs. Suffix an entry with #pool to mark it as a rotating proxy pool: the gateway then opens a fresh connection per attempt, skips its cooldown and health eviction, and retries it up to retry.max_attempts times.",
      "config.proxy.add": "Add proxies (one per line)",
      "config.upstream.title": "Upstream and protocol routing",
      "config.upstream.caption":
        "anonymous will use every available proxy; an explicit protocol mapping wins over inferring the protocol from the model name.",
      "config.upstream.freeOnly": "Only expose free models (even when Zen / Go Keys are configured)",
      "config.upstream.attempts": "Max attempts per Key Tier",
      "config.upstream.anonymous": "Anonymous upstream URL",
      "config.upstream.anonymousHint": "Keyless free-model lane; leave empty to fall back to the default address.",
      "config.upstream.timeout": "Request timeout (seconds)",
      "config.upstream.refresh": "Model refresh interval (seconds)",
      "config.upstream.protocols": "Model protocol overrides (JSON)",
      "config.reasoning.title": "Thinking effort",
      "config.reasoning.caption":
        "Applied only when the client does not specify an effort; per-model overrides take priority. Choosing “Off” removes reasoning for requests that do not ask for it.",
      "config.reasoning.default": "Default effort",
      "config.reasoning.follow": "Follow the client",
      "config.reasoning.auto": "auto (probe the highest available effort)",
      "config.reasoning.none": "Off",
      "config.reasoning.byModel": "Per-model overrides (JSON)",
      "config.reasoning.byModelNote":
        "Values may be minimal, low, medium, high, xhigh, max, or none; an empty object means no overrides.",
      "config.performance.title": "Performance and logging",
      "config.performance.caption": "A hot reload still keeps the in-process accumulated totals.",
      "config.performance.idleTimeout": "Idle timeout (seconds)",
      "config.performance.connect": "Connect timeout (seconds)",
      "config.performance.cooldown": "Failure cooldown (seconds)",
      "config.performance.attemptTimeout": "Attempt timeout (seconds)",
      "config.performance.attemptTimeoutHint": "0 = follow the request timeout",
      "config.performance.firstEvent": "First SSE event timeout (seconds, 0 disables)",
      "config.performance.level": "Log level",
      "config.performance.ring": "Log ring size",
      "config.performance.dump":
        "Write outbound request dumps (masked, for tracing retries and conversions only)",
      "config.logging.file": "Save logs to a file (auto-creates the log folder and keeps writing JSON logs)",
      "config.logging.filePath": "Log file path (leave empty for the default)",
      "config.logging.filePathNote": "Relative paths resolve next to config.json; missing folders are created automatically; unchecking stops file logging; with request-body dump enabled the file also contains conversation content.",
      "config.reload": "Reload from disk",
      "config.save": "Validate, save, and apply",

      "logs.level.all": "All levels",
      "logs.component": "Module",
      "logs.search": "Search events, Request ID, model",
      "logs.pause": "Pause",
      "logs.resume": "Resume",
      "logs.gap": "Older logs were dropped from memory",
      "logs.waiting": "Waiting for log events…",

      "quotas.title": "OpenCode Go plan quota",
      "quotas.caption":
        "Queried directly from OpenCode, cached for 60 seconds. All models share one plan window; percentages are rounded by the upstream.",
      "quotas.refresh": "Refresh quota",
      "quotas.loading": "Reading…",
      "quotas.pending": "The quota will be read when this page opens.",
      "quotas.catalog.title": "Available models",
      "quotas.catalog.caption":
        "Model names are used verbatim for OPENAI_MODEL. The quota column reflects the plan selected above, not a per-model quota.",
      "quotas.catalog.search": "Search model names…",
      "quotas.col.model": "Model name",
      "quotas.col.protocol": "Upstream protocol",
      "quotas.col.hour": "5-hour remaining · shared",
      "quotas.col.week": "Weekly remaining · shared",
      "quotas.col.month": "Monthly remaining · shared",
      "quotas.col.action": "Action",

      "rotation.title": "SOTA / sweet model rotation",
      "rotation.caption":
        "On success the current model is kept. When the quota runs out or an error occurs it moves in order, using OpenCode Go only.",
      "rotation.refresh": "Refresh status",
      "rotation.usage":
        "Keep your existing Base URL and API Key and set OPENAI_MODEL to the alias below. Each model is retried up to 3 times on ordinary errors, and a single request tries at most 3 models; a quota-exhausted model is skipped immediately.",
      "rotation.streaming":
        "Once output has started, the current answer stays on one model. A mid-stream error ends that output, and only the next request switches models. Models share the plan quota, so switching models does not guarantee escaping a quota exhaustion.",
      "rotation.timeout": "Maximum wait for the first valid output (seconds)",
      "rotation.save": "Save aliases and order",
      "rotation.saveNote":
        "Saving takes effect immediately; reordering never cuts off an answer that is already streaming. Manually selecting the current model takes effect immediately and clears that model's paused state.",
      "rotation.attempts.title": "Recent attempts",
      "rotation.col.time": "Time",
      "rotation.col.request": "Request",
      "rotation.col.alias": "Alias",
      "rotation.col.model": "Actual model",
      "rotation.col.attempt": "Attempt",
      "rotation.col.result": "Result",

      "apikeys.create.title": "Create an API Key for a caller",
      "apikeys.create.caption":
        "Used to reach the B service on this machine. Each application can have its own key; creating, enabling/disabling, and deleting all take effect immediately.",
      "apikeys.create.name": "Name",
      "apikeys.create.namePlaceholder": "e.g. my notes helper",
      "apikeys.create.value": "Custom key value (optional)",
      "apikeys.create.valuePlaceholder":
        "Leave blank to generate one; a custom value must be 16–256 characters",
      "apikeys.create.submit": "Create API Key",
      "apikeys.created.title": "Key created",
      "apikeys.created.caption":
        "The full key is shown only once, right after creation. Save it into the caller's environment variable immediately.",
      "apikeys.created.dismiss": "Saved, close",
      "apikeys.created.copy": "Copy key",
      "apikeys.created.copyEnv": "Copy environment variable",
      "apikeys.list.title": "Access keys",
      "apikeys.list.caption":
        "Manage access to the B service. OpenCode Go upstream keys stay in the Configuration center.",
      "apikeys.list.refresh": "Refresh list",
      "apikeys.col.name": "Name",
      "apikeys.col.tail": "Key tail",
      "apikeys.col.state": "State",
      "apikeys.col.usage": "Usage (last hour / total)",
      "apikeys.col.created": "Created at",
      "apikeys.col.action": "Action",
      "apikeys.col.legacy": "Already in configuration",
      "apikeys.note":
        "Disabling and deleting makes new requests from the matching applications return 401. At least one enabled key must remain.",

      "account.title": "Update the admin account",
      "account.caption": "On success every session is revoked and you must sign in again.",
      "account.user": "New username (blank to keep the current one)",
      "account.current": "Current password",
      "account.new": "New password (blank to keep the current one, at least 10 characters)",
      "account.submit": "Update and sign in again",

      "modal.eyebrow": "Sensitive value",
      "modal.title": "Sensitive configuration",
      "modal.close": "Close",

      "common.copy": "Copy",
      "common.save": "Save",
      "common.cancel": "Cancel",
      "common.confirm": "Confirm",
      "common.rename": "Rename",
      "common.delete": "Delete",
      "common.view": "Reveal",
      "common.notReady": "Not ready yet",
      "modal.revealTitle": "Reveal sensitive configuration",
      "common.clipboard": "The browser does not allow clipboard access",
      "common.empty": "No data yet",
      "common.remove": "Remove",
      "common.duration": "Duration",
      "common.model": "Model",
      "common.action": "Action",
      "common.yes": "Yes",
      "common.no": "No",
      "common.none": "None",
      "common.on": "On",
      "common.off": "Off",
      "common.allowed": "Allowed",
      "common.denied": "Denied",
      "common.unknown": "Unknown",
      "page.section": "Section {0}",

      "error.session": "Your session has expired",

      "state.healthy": "Healthy",
      "state.unavailable": "Unavailable",
      "state.enabled": "Enabled",
      "state.disabled": "Disabled",
      "state.cooling": "Cooling down",
      "state.available": "Ready",

      "breakdown.endpoint": "Endpoint",
      "breakdown.status": "Status code",
      "breakdown.model": "Model",
      "breakdown.empty": "No requests yet",

      "guide.models.cached": "Catalog from the {0} cache, waiting for a background refresh.",
      "guide.models.ready": "The upstream catalog has passed its first refresh and has models to serve.",

      "usage.empty.models": "No token usage yet",
      "usage.empty.tiers": "No per-Tier usage yet",

      "playground.key.cooling": " · cooling down until {0}",
      "playground.samplePrompt": "Explain what this model can do in one sentence.",
      "play.httpStatus": "HTTP",
      "play.mode": "Test mode",
      "play.mode.selected": "Specified {0} key",
      "play.mode.auto": "Automatic routing",
      "play.testedKey": "Key tested",
      "play.keyVerdict": "Key verdict",
      "play.keyVerdict.none": "Automatic routing has no dedicated verdict",
      "play.key.usable": "Key usable",
      "play.key.rejected": "Key rejected",
      "play.key.rateLimited": "Key accepted but rate limited",
      "play.key.upstreamError": "Upstream anomaly, no verdict on the key",
      "play.key.transportError": "Network or proxy anomaly, no verdict on the key",
      "play.key.unavailable": "Key or runtime unavailable",
      "play.key.requestError": "Request did not succeed",
      "play.actualRoute": "Actual route",
      "play.nativeProtocol": "Native protocol",
      "play.anonymousVerdict": "Anonymous verdict",
      "play.eligibility.allowed": "Allowed · {0}",
      "play.eligibility.denied": "Denied · {0}",
      "play.route.none": "Not routed",
      "play.state.ok": "Request succeeded · HTTP {0}",
      "play.state.failed": "Request failed · HTTP {0}",
      "play.state.testingKey": "Testing with the specified key…",
      "play.state.running": "Sending the request through the Gateway…",
      "play.state.failedToCall": "Could not reach the diagnostics endpoint",

      "diag.ready": "Ready",
      "diag.modelCount": "Models",
      "diag.updatedAt": "Updated at",
      "diag.nextRefresh": "Next refresh",
      "diag.stale": "Stale",
      "diag.lastError": "Last error",
      "diag.notUpdated": "Not updated",
      "diag.result": "Result",
      "diag.ok": "Success",
      "diag.failed": "Failed",
      "diag.route": "Route",
      "diag.state": "State",
      "diag.noTrace": "No playground trace data",
      "diag.streamError": "Streaming failed",
      "diag.clientCanceled": "Client canceled",
      "diag.noRequests": "No requests have been routed",
      "diag.noAttempts": "No upstream attempts",
      "diag.noMatch": "No matching models",

      "quotas.noKey": "No Go Key configured",
      "quotas.addKeyFirst": "Add an OpenCode Go Key in the Configuration center first.",
      "quotas.queryFailed": "Query failed: {0}. The content shown is only the previous query result.",
      "quotas.connected": "Connected to OpenCode · shared plan quota. Quotas of several keys do not add up.",
      "quotas.error": "{0}; the quota is currently unknown.",
      "quotas.staleError": "{0}; the most recent successful readings are shown below and the quota is currently unknown.",
      "quotas.updated": "Quota updated at: {0} · 60s cache · source: OpenCode Go /v1/usage",
      "quotas.lastSuccess": "Last successful query: {0} · 60s cache · source: OpenCode Go /v1/usage",
      "quotas.window.hour": "5-hour window",
      "quotas.window.week": "Weekly window",
      "quotas.window.month": "Monthly window",
      "quotas.window.aria": "Remaining quota for {0}",
      "quotas.remaining": "remaining",
      "quotas.remainingHistory": "remaining (history)",
      "quotas.rateLimited": "cap reached · ",
      "quotas.resetsAt": "resets at {0}",
      "quotas.waiting": "Waiting for quota data from the upstream",
      "quotas.catalogStale": "The model catalog is not up to date, showing the cache · ",
      "quotas.catalogUpdated": "Catalog updated at: {0}",
      "quotas.history": " (history)",
      "quotas.copyName": "Copy name",
      "quotas.catalogPending": "The model catalog is not ready yet; please refresh later.",

      "apikeys.loadFailed": "Read failed: {0}",
      "apikeys.count": "{0} keys",
      "apikeys.enabledCount": "{0} keys enabled",
      "apikeys.times": "times",
      "apikeys.rename": "Rename",
      "apikeys.namePrompt": "Key name",
      "apikeys.enable": "Enable",
      "apikeys.disable": "Disable",
      "apikeys.delete": "Delete",
      "apikeys.confirmDelete":
        "After deleting “{0}”, applications using this key will lose access. Delete it for real?",
      "apikeys.empty": "No API Keys yet",

      "rotation.status":
        "Status updated · the two rotation groups are independent and every caller shares the current position.",
      "rotation.sweet": "sweet",
      "rotation.aliasLabel": "Call alias",
      "rotation.current": "Current model: {0}",
      "rotation.waitingModel": "waiting for an available model",
      "rotation.col.order": "Order",
      "rotation.col.state": "State / resume time",
      "rotation.unavailable": "Removed from the catalog / temporarily unavailable",
      "rotation.pausedUntil": "Paused until {0}",
      "rotation.inUse": "In use",
      "rotation.moveUp": "Up",
      "rotation.moveDown": "Down",
      "rotation.setCurrent": "Set as current",
      "rotation.useModel": "Use {0}",
      "rotation.waitingCatalog": "Waiting for the Go model catalog",
      "rotation.recentSwitches": "Recent switches",
      "rotation.noSwitches": "No switch records yet",
      "rotation.attemptsEmpty": "Call through a group alias to see the 100 most recent attempts",
      "rotation.reason.success": "Succeeded",
      "rotation.reason.clientCanceled": "Caller canceled",
      "rotation.reason.quota": "Quota exhausted / rate limited",
      "rotation.reason.transport": "Connection error",
      "rotation.reason.firstOutputTimeout": "First output timeout",
      "rotation.reason.streamError": "Output interrupted",
      "rotation.reason.readError": "Failed to read the response",
      "rotation.reason.conversionError": "Failed to parse or convert the response",
      "rotation.reason.requestConversion": "Failed to convert the request",
      "rotation.reason.upstreamError": "Upstream error",

      "availability.pending": "Awaiting probe",
      "availability.manual": "Manual",
      "availability.auto": "Automatic",
      "availability.unverified": "Unverified",
      "availability.manualControl": "Manual control, not probed automatically",
      "availability.restore": "Re-enable",
      "availability.switchAuto": "Switch back to automatic",
      "availability.switchManual": "Switch to manual",
      "availability.hide": "Hide from clients",
      "availability.unhide": "Show to clients",
      "availability.hidden": "hidden",
      "availability.notProbed": "Hidden — not probed",
      "toast.model.hidden": "Model hidden from clients — row collapsed at the tail of the table",
      "toast.model.visible": "Model visible to clients again",
      "availability.noneEligible":
        "No model in the current catalog qualifies as free.",

      "config.restartNotice":
        "Saved but not in effect yet: {0}. The current API is {1}, the WebUI is {2}. Please restart the process.",
      "config.revealPrompt": "Re-enter the admin password",

      "toast.refreshed": "Status refreshed",
      "toast.copied": "Copied",
      "toast.copyDenied": "The browser denied the copy; select the text and copy it manually",
      "toast.example.copied": "Example copied",
      "toast.config.saved": "Configuration saved and already in effect",
      "toast.config.restart": "Applied; restart required for {0}",
      "toast.config.reloaded": "Configuration reloaded from disk",
      "toast.config.reloadedRestart":
        "Configuration reloaded from disk; listen fields require a restart",
      "toast.account.updated": "Account updated, please sign in again",
      "toast.play.invalidJson": "The request JSON is invalid: {0}",
      "toast.play.copied": "Raw response copied",
      "toast.apikeys.saved": "Saved and already in effect",
      "toast.apikeys.created": "API Key created",
      "toast.rotation.saved": "Model rotation configuration saved and in effect",
      "toast.rotation.switched": "Current model switched",
      "toast.rotation.dirty": "There are unsaved changes; save before refreshing",

      "config.json.object": "“{0}” must be a JSON object",

      "diagnostics.col.effort": "Effort",
      "diagnostics.col.upstream": "Upstream gate",
      "diagnostics.col.stream": "Type",
      "diagnostics.models.col.effort": "Applied effort",
      "diag.auto": "auto",
      "diag.stream": "Stream",
      "diag.nonStream": "Non-stream",

      "availability.probe": "Probe now",
      "availability.probeHidden": "Hidden — not probed",
      "availability.probeResult": "Probe result",
      "availability.probeSuccess": "available",
      "availability.probeFailed": "unavailable",
      "availability.probeNotAttempted": "not attempted",
      "availability.probeNotRecorded": "(manual state: shown only, not recorded)",

      "config.reasoning.precedence": "Override precedence",
      "config.reasoning.precedence.client": "Client-specified > per-model override > default effort",
      "config.reasoning.precedence.byModel": "Per-model override > client-specified > default effort",
      "config.reasoning.auto.title": "Probed reasoning efforts",
      "config.reasoning.auto.caption":
        "Latest anonymous probe result; “write override” fills the per-model JSON above.",
      "config.reasoning.auto.refresh": "Refresh results",
      "config.reasoning.auto.col.model": "Model",
      "config.reasoning.auto.col.effort": "Effort",
      "config.reasoning.auto.col.status": "Status",
      "config.reasoning.auto.col.action": "Action",
      "config.reasoning.auto.write": "Write override",
      "config.reasoning.auto.written":
        "Wrote {0}={1}; save the configuration to apply it",
      "config.reasoning.auto.empty": "No verified effort yet; wait for a probe and refresh.",

      "config.fallback.title": "Model fallback",
      "config.fallback.caption":
        "When the primary model fails the request is retried on the mapped fallback (single hop); a failing fallback keeps the original error.",
      "config.fallback.config": "Fallback map (JSON)",
      "config.fallback.note":
        "Keys are primary models, values are a single fallback model (no self reference or cycles); the builder rewrites this JSON directly.",
      "config.refusal.caption": "Refusal rewrite: when upstream refuses on content grounds, feed the refusal back on the same lane and retry up to the configured rounds.",
      "config.refusal.rounds": "Refusal rewrite rounds",
      "config.refusal.note": "0 disables it; every round is billed again.",
      "config.fallback.from": "Primary model",
      "config.fallback.to": "Fallback model",
      "config.fallback.add": "Add fallback",
      "config.fallback.col.from": "Primary model",
      "config.fallback.col.to": "Fallback model",
      "config.fallback.col.action": "Action",
      "config.fallback.empty": "No fallback yet; use the builder below or edit the JSON.",
      "config.fallback.needSelect": "Pick a model on both sides first",
      "config.fallback.self": "The fallback model must differ from the primary model",

      "config.proxy.byModelTitle": "Model → Proxy pinning",
      "config.proxy.byModelCaption":
        "Matching models are forced onto the listed exits; an empty list falls back to the default policy.",
      "config.proxy.byModel": "Per-model binding (JSON)",
      "config.proxy.byModelNote":
        "The builder rewrites this JSON directly; exit names must match the proxies configured above.",
      "config.proxy.pbmModel": "Model",
      "config.proxy.pbmAnyModel": "(any model)",
      "config.proxy.pbmExits": "Exits to bind (one per line)",
      "config.proxy.pbmPick": "Pick exits (multi-select)",
      "config.proxy.pbmPickNote":
        "Exit choices come from the proxies configured above (including proxies imported from a file). Click order becomes the binding order — earlier clicks come first.",
      "config.proxy.pbmReset": "Reset picks",
      "config.proxy.pbmNoExits":
        "No exits configured yet; add a Proxy above or fill in the proxy file first.",
      "config.proxy.pbmAdd": "Add binding",
      "config.proxy.pbmCol.model": "Model",
      "config.proxy.pbmCol.exits": "Exits",
      "config.proxy.pbmCol.action": "Action",
      "config.proxy.pbmEmpty": "No binding yet; use the builder below or edit the JSON.",
      "config.proxy.pbmNeedExits": "Pick at least one exit first",
      "config.proxy.healthTitle": "Exit retry and health probes",
      "config.proxy.healthCaption":
        "Exit failures retry per count and interval; health probes only recheck proxies marked unhealthy.",
      "config.proxy.retryAttempts": "Exit retries (0 = follow global)",
      "config.proxy.retryInterval": "Exit retry interval (s, 0 = disabled)",
      "config.proxy.healthInterval": "Probe interval (min)",
      "config.proxy.healthTimeout": "Probe timeout (s)",
      "config.proxy.healthBackoff": "Probe backoff cap (min)",
      "config.proxy.healthUrl": "Probe URL",
      "config.proxy.healthDisabled": "Disable proxy health probes (no automatic rechecks)",
      "config.fallbackcircuit.title": "Cross-request breaker (off by default)",
      "config.fallbackcircuit.caption":
        "When on: a model bound to an exit that hard-fails (refused / DNS / TLS) stops after one sticky retry, then requests detour to the fallback model. At pause expiry its own exits are probed first; only a passing probe switches back.",
      "config.fallbackcircuit.mode": "Mode",
      "config.fallbackcircuit.modeOff": "off (legacy main-branch retries)",
      "config.fallbackcircuit.modeFast": "fast (fail-fast + cross-request breaker)",
      "config.fallbackcircuit.pause": "Pause length (s, 0 = default 300)",
      "config.fallbackcircuit.revival": "Revival probe sweep interval (s, 0 = default 30)",
    },

    vi: {
      "doc.title": "opencode2api · Sổ tay vận hành",
      "lang.label": "Ngôn ngữ",

      "login.eyebrow": "Sổ tay vận hành dành cho quản trị / 2026",
      "login.headline": "Đưa giao thức, định tuyến và trạng thái vận hành lên cùng một bàn.",
      "login.intro":
        "Một bảng điều khiển cục bộ, không phụ thuộc frontend bên ngoài. Cấu hình, kiểm tra, kết nối, rồi để Gateway luôn dễ giải thích.",
      "login.restricted": "Bảng điều khiển hạn chế",
      "login.title": "Đăng nhập quản trị",
      "login.username": "Tài khoản",
      "login.password": "Mật khẩu",
      "login.submit": "Vào Sổ tay vận hành",

      "sidebar.kicker": "Bảng điều khiển vận hành",
      "sidebar.title": "Sổ tay vận hành",
      "nav.overview": "Bàn vận hành",
      "nav.guide": "Khởi động lần đầu",
      "nav.access": "Sổ tay tích hợp",
      "nav.usage": "Mức dùng token",
      "nav.playground": "Playground",
      "nav.diagnostics": "Chẩn đoán định tuyến",
      "nav.config": "Trung tâm cấu hình",
      "nav.logs": "Nhật ký sự kiện",
      "nav.account": "Bảo mật tài khoản",
      "nav.model-quotas": "Mô hình và hạn mức",
      "nav.api-keys": "Quản lý API Key",
      "nav.rotation": "Luân chuyển mô hình",
      "nav.availability": "Mô hình miễn phí",
      "nav.group.runtime": "Vận hành",
      "nav.group.integration": "Tích hợp",
      "nav.group.models": "Mô hình",
      "nav.group.system": "Hệ thống",
      "overview.tab.summary": "Tổng quan",
      "overview.tab.usage": "Mức dùng",
      "overview.checklist.title": "Kiểm tra sẵn sàng",
      "overview.checklist.caption": "Trạng thái lấy từ cấu hình hiện tại và tài nguyên thời gian thực.",
      "diagnostics.tab.playground": "Thử request",
      "diagnostics.tab.ledger": "Luồng request",
      "diagnostics.tab.logs": "Luồng sự kiện",
      "diagnostics.tab.route": "Định tuyến và điều kiện",
      "quotas.tab.quota": "Hạn mức gói",
      "quotas.tab.free": "Mô hình miễn phí",
      "config.tab.service": "Dịch vụ",
      "config.tab.keys": "Khóa và ẩn danh",
      "config.tab.proxies": "Proxy",
      "config.tab.upstream": "Upstream và mô hình",
      "config.tab.reasoning": "Suy luận và hiệu năng",
      "config.tab.logging": "Nhật ký",
      "usage.hour": "60 phút gần nhất",

      "topbar.refresh": "Làm mới ngay",
      "topbar.logout": "Đăng xuất",

      "page.availability.title": "Mô hình miễn phí",
      "page.availability.sub": "Dò mỗi giờ; mô hình do người dùng điều khiển không bị ảnh hưởng.",
      "page.rotation.title": "Luân chuyển mô hình",
      "page.rotation.sub": "Mô hình hiện tại, chuyển đổi khi lỗi và lịch sử thử.",
      "page.overview.title": "Bàn vận hành",
      "page.overview.sub": "Một giờ gần nhất, số liệu tích lũy của tiến trình và tài nguyên hiện tại.",
      "page.guide.title": "Khởi động lần đầu",
      "page.guide.sub": "Sáu điểm kiểm tra để đi từ cấu hình đến request đầu tiên.",
      "page.access.title": "Sổ tay tích hợp",
      "page.access.sub": "Ví dụ Chat, Responses, Anthropic và SDK.",
      "page.usage.title": "Mức dùng token",
      "page.usage.sub": "Độ phủ, xu hướng mỗi phút, xếp hạng mô hình và phân bố Tier.",
      "page.playground.title": "Playground",
      "page.playground.sub": "Ba giao thức đầu vào dùng chung định tuyến Gateway thật và chẩn đoán.",
      "page.diagnostics.title": "Chẩn đoán định tuyến",
      "page.diagnostics.sub": "Metadata, điều kiện mô hình và từng lần thử upstream.",
      "page.config.title": "Trung tâm cấu hình",
      "page.config.sub": "Kiểm tra rồi lưu nguyên tử, áp dụng nóng các trường có thể thay đổi.",
      "page.logs.title": "Nhật ký sự kiện",
      "page.logs.sub": "Dữ liệu SSE có cấu trúc từ ring buffer trong bộ nhớ tiến trình.",
      "page.account.title": "Bảo mật tài khoản",
      "page.account.sub": "Cập nhật xong sẽ thu hồi toàn bộ session quản trị.",
      "page.model-quotas.title": "Mô hình và hạn mức",
      "page.model-quotas.sub": "Mô hình khả dụng, hạn mức gói dùng chung và thời điểm reset.",
      "page.api-keys.title": "Quản lý API Key",
      "page.api-keys.sub": "Khóa truy cập riêng cho từng bên gọi.",

      "availability.title": "Dò mô hình miễn phí",
      "availability.refresh": "Làm mới trạng thái",
      "availability.desc":
        "Kiểm tra các mô hình có tên chứa free hoặc giá bằng 0 trong metadata và chưa bị loại bỏ. Ưu tiên kênh ẩn danh, sau đó mới thử Zen Key; chỉ vô hiệu hóa khi mô hình hẳn đã hỏng và thử lại sau 24 giờ. Lỗi tạm thời không tạo thêm mô hình bị vô hiệu hóa: mô hình đang bật thử lại sau 1 giờ, mô hình đã tắt giữ nguyên lý do cũ và thử lại sau 24 giờ. Khi khôi phục bật hoặc chuyển sang điều khiển thủ công, mô hình giữ nguyên bật và không còn được dò tự động; khi chuyển lại tự động, lượt định tuyến kế tiếp sẽ sắp xếp lần dò. System One dùng bộ câu hỏi quyết định riêng 1+1. Khi đặt cường độ auto, hiển thị bậc cao nhất đã được dò xác minh. Mô hình bị ẩn không còn trong /v1/models và không được định tuyến; chúng vẫn nằm trong bảng để có thể bỏ ẩn tại đây hoặc ở bảng định tuyến, nhưng không còn được dò nữa.",
      "availability.col.model": "Mô hình",
      "availability.col.state": "Trạng thái",
      "availability.col.channel": "Kênh / Kết quả",
      "availability.col.control": "Điều khiển",
      "availability.col.effort": "Bậc suy luận đã xác minh",
      "availability.col.checked": "Lần dò gần nhất",
      "availability.col.next": "Lần dò kế tiếp",
      "availability.col.action": "Thao tác",

      "overview.requests": "Yêu cầu 1 giờ qua",
      "overview.success": "Tỷ lệ thành công",
      "overview.p95": "Độ trễ P95",
      "overview.active": "Đang chạy / luồng",
      "overview.hour": "60 phút gần nhất",
      "overview.http2xx": "HTTP 2xx–3xx",
      "overview.endToEnd": "Mili giây đầu–cuối",
      "overview.concurrent": "Số request đồng thời",
      "overview.proxy.title": "Nút Proxy",
      "overview.proxy.caption": "Ở đây hiển thị các nút proxy, không mô tả chúng là IP đầu ra.",
      "overview.proxy.col.node": "Nút",
      "overview.proxy.col.health": "Sức khoẻ",
      "overview.proxy.col.binding": "Ràng buộc",
      "overview.keys.title": "Nhóm Key",
      "overview.keys.caption": "Chỉ hiển thị 5 ký tự cuối của Key và trạng thái cooldown.",
      "overview.keys.col.tail": "Đuôi Key",
      "overview.keys.col.tier": "Tier",
      "overview.keys.col.state": "Trạng thái",
      "overview.distribution.title": "Phân bố yêu cầu",
      "overview.distribution.caption":
        "Tổng hợp 1 giờ gần nhất theo endpoint, mô hình, Tier và mã trạng thái.",

      "guide.title": "Kiểm tra 6 bước để triển khai",
      "guide.caption":
        "Trạng thái lấy từ cấu hình hiện tại và tài nguyên thời gian thực, không ghi vào bộ nhớ trình duyệt.",
      "guide.step.login": "Đăng nhập bảng quản trị",
      "guide.step.login.desc": "Session hiện tại đã được máy chủ xác minh.",
      "guide.step.serverkey": "Cấu hình Key cục bộ",
      "guide.step.serverkey.desc": "Client dùng Server Key để truy cập Gateway.",
      "guide.step.upstream": "Chọn kênh upstream",
      "guide.step.upstream.desc": "Có ít nhất một Zen / Go Key, hoặc đã bật kênh ẩn danh.",
      "guide.step.proxy": "Kiểm tra Proxy",
      "guide.step.proxy.desc": "Có ít nhất một nút proxy còn khỏe.",
      "guide.step.models": "Chờ danh mục mô hình",
      "guide.step.access": "Sao chép ví dụ tích hợp",
      "guide.step.access.desc": "Vào Sổ tay tích hợp, thay mô hình và YOUR_API_KEY.",
      "guide.done": "✓ Đã sẵn sàng",
      "guide.todo": "○ Cần xử lý",

      "access.base": "Địa chỉ cơ sở",
      "access.protocols": "Ba giao thức",
      "access.sdk": "Ví dụ SDK",
      "access.notes": "Lưu ý tích hợp",
      "access.base.title": "Địa chỉ cơ sở",
      "access.base.caption": "Ví dụ không ghi Server Key thật.",
      "access.base.label": "API Base được suy ra",
      "access.model.label": "Mô hình ví dụ",
      "access.protocols.title": "Các cổng vào theo ba giao thức",
      "access.sdk.title": "Python và JavaScript",
      "access.notes.title": "Lưu ý khi tích hợp",
      "access.notes.auth": "Client tương thích OpenAI dùng <code>Authorization: Bearer YOUR_API_KEY</code>.",
      "access.notes.anthropic":
        "Client Anthropic có thể dùng <code>x-api-key</code>, với đường dẫn <code>/v1/messages</code>.",
      "access.notes.stream":
        "Request streaming giữ nguyên sự kiện của giao thức gốc; khi khác giao thức, Gateway sẽ chuyển đổi.",
      "access.notes.listen":
        "Nếu cấu hình lắng nghe ở <code>0.0.0.0</code>, ví dụ sẽ dùng tên máy chủ của trình duyệt hiện tại.",

      "usage.coverage": "Độ phủ sử dụng",
      "usage.coverage.note": "Yêu cầu có token trả về / suy luận",
      "usage.total": "Tổng token",
      "usage.cached": "Token đã cache",
      "usage.cached.note": "Cache hit do upstream báo",
      "usage.reasoning": "Token suy luận",
      "usage.reasoning.note": "Mức dùng suy luận do upstream báo",
      "usage.trend.title": "Xu hướng token mỗi phút",
      "usage.trend.caption": "60 phút gần nhất; di chuột để xem input, output và tổng.",
      "usage.models.title": "Xếp hạng mô hình",
      "usage.models.caption": "Sắp xếp theo total_tokens.",
      "usage.models.col.model": "Mô hình",
      "usage.models.col.input": "Input",
      "usage.models.col.output": "Output",
      "usage.models.col.total": "Tổng",
      "usage.tiers.title": "Phân bố Tier",
      "usage.tiers.caption": "Token của Zen / Go đi về đâu.",
      "usage.trend.peak": "Đỉnh {0} token / phút · {1} phút gần nhất",
      "usage.trend.empty": "Chưa có dữ liệu xu hướng",

      "playground.title": "Bàn gửi request ba giao thức",
      "playground.caption": "Máy chủ ép buộc không streaming và định tuyến qua Gateway thật.",
      "playground.protocol": "Giao thức đầu vào",
      "playground.model": "Mô hình",
      "playground.key": "Key upstream",
      "playground.key.auto": "Định tuyến tự động (ẩn danh / dự phòng Tier / luân phiên Key)",
      "playground.key.caption":
        "Khi chọn một Key cụ thể, chỉ Key đó được thử: không chuyển sang Key khác, Tier khác hay kênh ẩn danh, và không làm thay đổi trạng thái cooldown của Key hay sức khoẻ của proxy.",
      "playground.request": "JSON của request",
      "playground.reset": "Đặt lại mẫu",
      "playground.run": "Gửi request chẩn đoán",
      "playground.result.title": "Kết quả chẩn đoán",
      "playground.result.idle": "Chưa gửi request nào.",
      "playground.output": "Phản hồi giao thức gốc",

      "diagnostics.metadata.title": "Metadata mô hình",
      "diagnostics.metadata.caption":
        "Trạng thái cache giá OpenCode từ models.dev; giá bằng 0 hoặc tên chứa free là đủ điều kiện vào kênh ẩn danh.",
      "diagnostics.last.title": "Playground gần nhất",
      "diagnostics.last.caption":
        "Chỉ giữ lần theo dõi cuối cùng trong tiến trình quản trị hiện tại.",
      "diagnostics.models.title": "Bảng định tuyến mô hình",
      "diagnostics.models.caption":
        "Giao thức tường minh, nguồn điều kiện ẩn danh và cách xác định chi phí.",
      "diagnostics.models.filter": "Lọc mô hình",
      "diagnostics.models.col.model": "Mô hình",
      "diagnostics.models.col.protocol": "Giao thức gốc",
      "diagnostics.models.col.route": "Định tuyến",
      "diagnostics.models.col.eligibility": "Điều kiện ẩn danh",
      "diagnostics.models.col.source": "Nguồn đánh giá",
      "diagnostics.models.col.cost": "Chi phí input / output",
      "diagnostics.models.col.actions": "Thao tác",
      "diagnostics.models.hide": "Ẩn khỏi client",
      "diagnostics.models.hiddenRoute": "Đã ẩn — không định tuyến",
      "diagnostics.requests.title": "Định tuyến request",
      "diagnostics.requests.caption":
        "Đuôi Key hoặc anonymous thực sự được dùng cho từng request; hiển thị tối đa 100 bản ghi gần nhất.",
      "diagnostics.attempts.title": "Lần thử upstream",
      "diagnostics.attempts.caption":
        "Đuôi Key, kênh ẩn danh và nút proxy đã che; hiển thị tối đa 100 bản ghi gần nhất.",
      "diagnostics.col.time": "Thời gian",
      "diagnostics.col.model": "Mô hình",
      "diagnostics.col.tier": "Tier",
      "diagnostics.col.channel": "Kênh",
      "diagnostics.col.tail": "Đuôi Key",
      "diagnostics.col.attempts": "Lần thử",
      "diagnostics.col.state": "Trạng thái",
      "diagnostics.col.duration": "Thời gian",
      "diagnostics.col.proxy": "Nút proxy",

      "config.server.title": "Máy chủ và bảng quản trị",
      "config.server.caption": "Địa chỉ lắng nghe cần khởi động lại sau khi lưu.",
      "config.server.prefer": "Tier ưu tiên cho Key xác thực",
      "config.server.prefer.go": "Go (lỗi thì dự phòng Zen)",
      "config.server.prefer.zen": "Zen (lỗi thì dự phòng Go)",
      "config.server.session": "Session TTL (phút)",
      "config.server.enabled": "Bật WebUI (cần khởi động lại khi thay đổi)",
      "config.secrets.title": "Khóa và kênh ẩn danh",
      "config.secrets.caption":
        "Giá trị nhạy cảm mặc định chỉ hiện dạng che; chỉ lưu sau khi gỡ bỏ mới có hiệu lực.",
      "config.secrets.reveal": "Xem sau khi xác minh lại",
      "config.secrets.anonymous": "Bật kênh ẩn danh Zen",
      "config.secrets.anonymousPriority": "Ưu tiên ẩn danh: thử kênh ẩn danh trước, rồi đến key",
      "config.secrets.anonymousPriorityHint": "Khi tắt, server key được thử trước kênh ẩn danh.",
      "config.secrets.add": "Mỗi dòng thêm một key",
      "config.proxy.title": "Nút Proxy",
      "config.proxy.caption":
        "Hỗ trợ direct, HTTP(S) và URL SOCKS. Thêm hậu tố #pool để đánh dấu mục đó là proxy pool luân chuyển: gateway sẽ mở kết nối mới cho mỗi lần thử, bỏ qua cooldown và loại bỏ theo sức khoẻ, và thử lại tối đa retry.max_attempts lần.",
      "config.proxy.add": "Thêm Proxy (mỗi dòng một cái)",
      "config.upstream.title": "Upstream và định tuyến giao thức",
      "config.upstream.caption":
        "anonymous sẽ dùng hết các Proxy khả dụng; ánh xạ protocol tường minh được ưu tiên hơn việc suy luận từ tên mô hình.",
      "config.upstream.freeOnly": "Chỉ công khai mô hình miễn phí (kể cả khi đã cấu hình Zen / Go Key)",
      "config.upstream.attempts": "Số lần thử tối đa cho mỗi Key Tier",
      "config.upstream.anonymous": "URL upstream ẩn danh",
      "config.upstream.anonymousHint": "Kênh mô hình miễn phí không cần key; để trống sẽ dùng địa chỉ mặc định.",
      "config.upstream.timeout": "Timeout của request (giây)",
      "config.upstream.refresh": "Làm mới mô hình (giây)",
      "config.upstream.protocols": "Ghi đè giao thức mô hình (JSON)",
      "config.reasoning.title": "Cường độ Thinking",
      "config.reasoning.caption":
        "Chỉ áp dụng khi client không chỉ định rõ; có thể ghi đè theo từng mô hình. Chọn “Tắt” sẽ bỏ reasoning cho các request không yêu cầu rõ.",
      "config.reasoning.default": "Cường độ mặc định",
      "config.reasoning.follow": "Theo client",
      "config.reasoning.auto": "auto (dò mức cao nhất khả dụng)",
      "config.reasoning.none": "Tắt",
      "config.reasoning.byModel": "Ghi đè theo mô hình (JSON)",
      "config.reasoning.byModelNote":
        "Giá trị có thể là minimal, low, medium, high, xhigh, max hoặc none; đối tượng rỗng nghĩa là không ghi đè.",
      "config.performance.title": "Hiệu năng và nhật ký",
      "config.performance.caption": "Nạp lại nóng vẫn giữ số liệu tích lũy trong bộ nhớ tiến trình.",
      "config.performance.idleTimeout": "Idle Timeout (giây)",
      "config.performance.connect": "Connect Timeout (giây)",
      "config.performance.cooldown": "Failure Cooldown (giây)",
      "config.performance.attemptTimeout": "Attempt Timeout (giây)",
      "config.performance.attemptTimeoutHint": "0 = theo timeout của request",
      "config.performance.firstEvent":
        "Timeout sự kiện SSE đầu tiên (giây, 0 để tắt)",
      "config.performance.level": "Mức log",
      "config.performance.ring": "Kích thước ring log",
      "config.performance.dump":
        "Ghi dump request đi ra (đã che, chỉ dùng để truy vết retry và chuyển đổi)",
      "config.logging.file": "Lưu log ra tệp (tự tạo thư mục log và ghi log JSON liên tục)",
      "config.logging.filePath": "Đường dẫn tệp log (để trống dùng mặc định)",
      "config.logging.filePathNote": "Đường dẫn tương đối tính từ thư mục chứa config.json; thư mục thiếu sẽ tự được tạo; bỏ chọn để ngừng ghi tệp; khi bật dump thân yêu cầu, tệp sẽ chứa nội dung hội thoại.",
      "config.reload": "Nạp lại từ đĩa",
      "config.save": "Kiểm tra, lưu và áp dụng",

      "logs.level.all": "Tất cả mức",
      "logs.component": "Module",
      "logs.search": "Tìm sự kiện, Request ID, mô hình",
      "logs.pause": "Tạm dừng",
      "logs.resume": "Tiếp tục",
      "logs.gap": "Log cũ hơn đã bị xóa khỏi bộ nhớ",
      "logs.waiting": "Đang chờ sự kiện log…",

      "quotas.title": "Hạn mức gói OpenCode Go",
      "quotas.caption":
        "Truy vấn trực tiếp từ OpenCode, cache 60 giây. Mọi mô hình dùng chung một cửa sổ gói, phần trăm do upstream làm tròn.",
      "quotas.refresh": "Làm mới hạn mức",
      "quotas.loading": "Đang đọc…",
      "quotas.pending": "Sẽ đọc hạn mức khi mở trang.",
      "quotas.catalog.title": "Mô hình khả dụng",
      "quotas.catalog.caption":
        "Tên mô hình dùng thẳng cho OPENAI_MODEL. Cột hạn mức ứng với gói đã chọn ở trên, không phải mỗi mô hình có hạn mức riêng.",
      "quotas.catalog.search": "Tìm tên mô hình…",
      "quotas.col.model": "Tên mô hình",
      "quotas.col.protocol": "Giao thức upstream",
      "quotas.col.hour": "Còn lại 5 giờ · dùng chung",
      "quotas.col.week": "Còn lại tuần · dùng chung",
      "quotas.col.month": "Còn lại tháng · dùng chung",
      "quotas.col.action": "Thao tác",

      "rotation.title": "Luân chuyển mô hình SOTA / sweet",
      "rotation.caption":
        "Thành công thì giữ nguyên mô hình hiện tại. Khi hết hạn mức hoặc gặp lỗi sẽ chuyển theo thứ tự, chỉ dùng OpenCode Go.",
      "rotation.refresh": "Làm mới trạng thái",
      "rotation.usage":
        "Giữ nguyên Base URL và API Key hiện có, đặt OPENAI_MODEL là bí danh bên dưới. Mỗi mô hình lỗi thường được thử tối đa 3 lần, mỗi request tối đa thử 3 mô hình; hết hạn mức thì bỏ qua ngay.",
      "rotation.streaming":
        "Sau khi bắt đầu có output, câu trả lời hiện tại giữ nguyên một mô hình. Lỗi giữa chừng sẽ kết thúc output đó, chỉ request sau mới đổi mô hình. Các mô hình dùng chung hạn mức gói, chuyển mô hình không bảo đảm thoát khỏi tình trạng hết hạn mức.",
      "rotation.timeout": "Giới hạn chờ output hợp lệ đầu tiên (giây)",
      "rotation.save": "Lưu bí danh và thứ tự",
      "rotation.saveNote":
        "Lưu là có hiệu lực ngay; đổi thứ tự không cắt ngang câu trả lời đang xuất. Chọn thủ công mô hình hiện tại sẽ có hiệu lực ngay và gỡ trạng thái tạm dừng của mô hình đó.",
      "rotation.attempts.title": "Các lần thử gần nhất",
      "rotation.col.time": "Thời gian",
      "rotation.col.request": "Request",
      "rotation.col.alias": "Bí danh",
      "rotation.col.model": "Mô hình thực",
      "rotation.col.attempt": "Lần thử",
      "rotation.col.result": "Kết quả",

      "apikeys.create.title": "Tạo API Key cho bên gọi",
      "apikeys.create.caption":
        "Dùng để truy cập dịch vụ B trên máy này. Mỗi ứng dụng có thể dùng một khóa riêng; tạo, bật/tắt và xoá đều có hiệu lực ngay.",
      "apikeys.create.name": "Tên",
      "apikeys.create.namePlaceholder": "Ví dụ: trợ lý ghi chú của tôi",
      "apikeys.create.value": "Key tuỳ chọn (không bắt buộc)",
      "apikeys.create.valuePlaceholder":
        "Để trống để tự sinh; tuỳ chọn cần 16–256 ký tự",
      "apikeys.create.submit": "Tạo API Key",
      "apikeys.created.title": "Đã tạo khóa",
      "apikeys.created.caption":
        "Khóa đầy đủ chỉ hiển thị sau khi tạo, hãy lưu ngay vào biến môi trường của bên gọi.",
      "apikeys.created.dismiss": "Đã lưu, đóng",
      "apikeys.created.copy": "Sao chép Key",
      "apikeys.created.copyEnv": "Sao chép biến môi trường",
      "apikeys.list.title": "Khóa truy cập",
      "apikeys.list.caption":
        "Quản lý quyền truy cập vào dịch vụ B. Khóa upstream của OpenCode Go vẫn nằm ở Trung tâm cấu hình.",
      "apikeys.list.refresh": "Làm mới danh sách",
      "apikeys.col.name": "Tên",
      "apikeys.col.tail": "Đuôi khóa",
      "apikeys.col.state": "Trạng thái",
      "apikeys.col.usage": "Mức dùng (1 giờ gần nhất / tích lũy)",
      "apikeys.col.created": "Thời điểm tạo",
      "apikeys.col.action": "Thao tác",
      "apikeys.col.legacy": "Đã có trong cấu hình",
      "apikeys.note":
        "Tắt và xoá sẽ khiến các request mới của ứng dụng tương ứng trả về 401. Phải giữ lại ít nhất một Key đang bật.",

      "account.title": "Cập nhật tài khoản quản trị",
      "account.caption": "Thành công sẽ thu hồi toàn bộ Session và yêu cầu đăng nhập lại.",
      "account.user": "Tài khoản mới (để trống để giữ nguyên)",
      "account.current": "Mật khẩu hiện tại",
      "account.new": "Mật khẩu mới (để trống để giữ nguyên, tối thiểu 10 ký tự)",
      "account.submit": "Cập nhật và đăng nhập lại",

      "modal.eyebrow": "Giá trị nhạy cảm",
      "modal.title": "Cấu hình nhạy cảm",
      "modal.close": "Đóng",

      "common.copy": "Sao chép",
      "common.save": "Lưu",
      "common.cancel": "Huỷ",
      "common.confirm": "Xác nhận",
      "common.rename": "Đổi tên",
      "common.delete": "Xoá",
      "common.view": "Xem",
      "common.notReady": "Chưa sẵn sàng",
      "modal.revealTitle": "Xem cấu hình nhạy cảm",
      "common.clipboard": "Trình duyệt không cho phép truy cập clipboard",
      "common.empty": "Chưa có dữ liệu",
      "common.remove": "Gỡ bỏ",
      "common.duration": "Thời gian",
      "common.model": "Mô hình",
      "common.action": "Thao tác",
      "common.yes": "Có",
      "common.no": "Không",
      "common.none": "Không có",
      "common.on": "Bật",
      "common.off": "Tắt",
      "common.allowed": "Cho phép",
      "common.denied": "Từ chối",
      "common.unknown": "Không rõ",
      "page.section": "Mục {0}",

      "error.session": "Phiên đăng nhập đã hết hạn",

      "state.healthy": "Khỏe",
      "state.unavailable": "Không dùng được",
      "state.enabled": "Đang bật",
      "state.disabled": "Đang tắt",
      "state.cooling": "Đang nghỉ (cooldown)",
      "state.available": "Sẵn sàng",

      "breakdown.endpoint": "Endpoint",
      "breakdown.status": "Mã trạng thái",
      "breakdown.model": "Mô hình",
      "breakdown.empty": "Chưa có request",

      "guide.models.cached": "Danh mục lấy từ cache {0}, đang chờ nền làm mới.",
      "guide.models.ready": "Danh mục upstream đã qua lần làm mới đầu tiên và có mô hình để phục vụ.",

      "usage.empty.models": "Chưa có mức dùng token",
      "usage.empty.tiers": "Chưa có mức dùng theo Tier",

      "playground.key.cooling": " · nghỉ đến {0}",
      "playground.samplePrompt": "Giải thích năng lực của mô hình này trong một câu.",
      "play.httpStatus": "HTTP",
      "play.mode": "Chế độ thử",
      "play.mode.selected": "Chỉ định Key {0}",
      "play.mode.auto": "Định tuyến tự động",
      "play.testedKey": "Key được thử",
      "play.keyVerdict": "Kết luận về Key",
      "play.keyVerdict.none": "Định tuyến tự động không có kết luận riêng",
      "play.key.usable": "Key dùng được",
      "play.key.rejected": "Key bị từ chối",
      "play.key.rateLimited": "Key được chấp nhận nhưng bị giới hạn tần suất",
      "play.key.upstreamError": "Upstream bất thường, không kết luận được về Key",
      "play.key.transportError": "Mạng hoặc proxy bất thường, không kết luận được về Key",
      "play.key.unavailable": "Key hoặc môi trường chạy không dùng được",
      "play.key.requestError": "Request không thành công",
      "play.actualRoute": "Định tuyến thực tế",
      "play.nativeProtocol": "Giao thức gốc",
      "play.anonymousVerdict": "Kết luận ẩn danh",
      "play.eligibility.allowed": "Cho phép · {0}",
      "play.eligibility.denied": "Từ chối · {0}",
      "play.route.none": "Chưa định tuyến",
      "play.state.ok": "Request thành công · HTTP {0}",
      "play.state.failed": "Request thất bại · HTTP {0}",
      "play.state.testingKey": "Đang thử với Key được chỉ định…",
      "play.state.running": "Đang gửi request qua Gateway…",
      "play.state.failedToCall": "Không gọi được cổng chẩn đoán",

      "diag.ready": "Sẵn sàng",
      "diag.modelCount": "Số mô hình",
      "diag.updatedAt": "Thời điểm cập nhật",
      "diag.nextRefresh": "Lần làm mới kế tiếp",
      "diag.stale": "Đã cũ",
      "diag.lastError": "Lỗi gần nhất",
      "diag.notUpdated": "Chưa cập nhật",
      "diag.result": "Kết quả",
      "diag.ok": "Thành công",
      "diag.failed": "Thất bại",
      "diag.route": "Định tuyến",
      "diag.state": "Trạng thái",
      "diag.noTrace": "Chưa có dữ liệu theo dõi Playground",
      "diag.streamError": "Streaming thất bại",
      "diag.clientCanceled": "Client đã huỷ",
      "diag.noRequests": "Chưa có request nào được định tuyến",
      "diag.noAttempts": "Chưa có lần thử upstream",
      "diag.noMatch": "Không có mô hình phù hợp",

      "quotas.noKey": "Chưa cấu hình Go Key",
      "quotas.addKeyFirst": "Hãy thêm OpenCode Go Key trong Trung tâm cấu hình trước.",
      "quotas.queryFailed": "Truy vấn thất bại: {0}. Nội dung đang hiển thị chỉ là kết quả truy vấn trước.",
      "quotas.connected": "Đã kết nối OpenCode · hạn mức gói dùng chung. Hạn mức của nhiều Key không cộng dồn.",
      "quotas.error": "{0}; hiện không rõ hạn mức.",
      "quotas.staleError": "{0}; bên dưới hiển thị dữ liệu thành công gần nhất, hiện không rõ hạn mức.",
      "quotas.updated": "Thời điểm cập nhật hạn mức: {0} · cache 60 giây · nguồn: OpenCode Go /v1/usage",
      "quotas.lastSuccess": "Truy vấn thành công gần nhất: {0} · cache 60 giây · nguồn: OpenCode Go /v1/usage",
      "quotas.window.hour": "Cửa sổ 5 giờ",
      "quotas.window.week": "Cửa sổ theo tuần",
      "quotas.window.month": "Cửa sổ theo tháng",
      "quotas.window.aria": "Hạn mức còn lại của {0}",
      "quotas.remaining": "Còn lại",
      "quotas.remainingHistory": "Còn lại (lịch sử)",
      "quotas.rateLimited": "đã chạm trần · ",
      "quotas.resetsAt": "reset lúc {0}",
      "quotas.waiting": "Đang chờ dữ liệu hạn mức từ upstream",
      "quotas.catalogStale": "Danh mục mô hình chưa cập nhật, đang hiện cache · ",
      "quotas.catalogUpdated": "Danh mục cập nhật lúc: {0}",
      "quotas.history": "（lịch sử）",
      "quotas.copyName": "Sao chép tên",
      "quotas.catalogPending": "Danh mục mô hình chưa sẵn sàng, vui lòng làm mới sau",

      "apikeys.loadFailed": "Đọc thất bại: {0}",
      "apikeys.count": "{0} khóa",
      "apikeys.enabledCount": "{0} khóa đang bật",
      "apikeys.times": "lần",
      "apikeys.rename": "Đổi tên",
      "apikeys.namePrompt": "Tên khóa",
      "apikeys.enable": "Bật",
      "apikeys.disable": "Tắt",
      "apikeys.delete": "Xoá",
      "apikeys.confirmDelete":
        "Sau khi xoá “{0}”, các ứng dụng đang dùng khóa này sẽ không truy cập được. Xoá thật chứ?",
      "apikeys.empty": "Chưa có API Key",

      "rotation.status":
        "Đã cập nhật trạng thái · hai nhóm luân chuyển độc lập, mọi bên gọi dùng chung vị trí hiện tại.",
      "rotation.sweet": "sweet",
      "rotation.aliasLabel": "Bí danh gọi",
      "rotation.current": "Mô hình hiện tại: {0}",
      "rotation.waitingModel": "đang chờ mô hình khả dụng",
      "rotation.col.order": "Thứ tự",
      "rotation.col.state": "Trạng thái / thời điểm hồi phục",
      "rotation.unavailable": "Đã gỡ khỏi danh mục / tạm không dùng được",
      "rotation.pausedUntil": "Tạm dừng đến {0}",
      "rotation.inUse": "Đang dùng",
      "rotation.moveUp": "Lên",
      "rotation.moveDown": "Xuống",
      "rotation.setCurrent": "Đặt làm hiện tại",
      "rotation.useModel": "Dùng {0}",
      "rotation.waitingCatalog": "Đang chờ danh mục mô hình Go",
      "rotation.recentSwitches": "Chuyển đổi gần đây",
      "rotation.noSwitches": "Chưa có bản ghi chuyển đổi",
      "rotation.attemptsEmpty": "Gọi bằng bí danh nhóm để xem 100 lần thử gần nhất",
      "rotation.reason.success": "Thành công",
      "rotation.reason.clientCanceled": "Bên gọi huỷ",
      "rotation.reason.quota": "Hết hạn mức / bị giới hạn tần suất",
      "rotation.reason.transport": "Lỗi kết nối",
      "rotation.reason.firstOutputTimeout": "Timeout output đầu tiên",
      "rotation.reason.streamError": "Output bị gián đoạn",
      "rotation.reason.readError": "Đọc phản hồi thất bại",
      "rotation.reason.conversionError": "Phân tích hoặc chuyển đổi phản hồi thất bại",
      "rotation.reason.requestConversion": "Chuyển đổi request thất bại",
      "rotation.reason.upstreamError": "Lỗi upstream",

      "availability.pending": "Chờ dò",
      "availability.manual": "Thủ công",
      "availability.auto": "Tự động",
      "availability.unverified": "Chưa xác minh",
      "availability.manualControl": "Điều khiển thủ công, không dò tự động",
      "availability.restore": "Khôi phục bật",
      "availability.switchAuto": "Chuyển lại tự động",
      "availability.switchManual": "Chuyển sang thủ công",
      "availability.hide": "Ẩn khỏi client",
      "availability.unhide": "Hiện cho client",
      "availability.hidden": "đã ẩn",
      "availability.notProbed": "Đã ẩn — không dò",
      "toast.model.hidden": "Đã ẩn mô hình khỏi client — hàng đã gộp xuống cuối bảng",
      "toast.model.visible": "Mô hình đã hiện lại cho client",
      "availability.noneEligible":
        "Danh mục mô hình hiện tại không có mô hình nào đủ điều kiện miễn phí.",

      "config.restartNotice":
        "Đã lưu nhưng chưa có hiệu lực: {0}. API hiện tại {1}, WebUI {2}. Vui lòng khởi động lại tiến trình.",
      "config.revealPrompt": "Nhập lại mật khẩu quản trị",

      "toast.refreshed": "Đã làm mới trạng thái",
      "toast.copied": "Đã sao chép",
      "toast.copyDenied": "Trình duyệt không cho phép sao chép, hãy chọn và sao chép thủ công",
      "toast.example.copied": "Đã sao chép ví dụ",
      "toast.config.saved": "Cấu hình đã lưu và có hiệu lực ngay",
      "toast.config.restart": "Đã áp dụng; cần khởi động lại cho {0}",
      "toast.config.reloaded": "Đã nạp lại cấu hình từ đĩa",
      "toast.config.reloadedRestart":
        "Đã nạp lại cấu hình từ đĩa, các trường lắng nghe cần khởi động lại",
      "toast.account.updated": "Đã cập nhật tài khoản, vui lòng đăng nhập lại",
      "toast.play.invalidJson": "JSON của request không hợp lệ: {0}",
      "toast.play.copied": "Đã sao chép phản hồi gốc",
      "toast.apikeys.saved": "Đã lưu và có hiệu lực ngay",
      "toast.apikeys.created": "Đã tạo API Key",
      "toast.rotation.saved": "Đã lưu cấu hình luân chuyển mô hình và có hiệu lực",
      "toast.rotation.switched": "Đã chuyển mô hình hiện tại",
      "toast.rotation.dirty": "Có thay đổi chưa lưu, hãy lưu trước khi làm mới",

      "config.json.object": "“{0}” phải là đối tượng JSON",

      "diagnostics.col.effort": "Cường độ",
      "diagnostics.col.upstream": "Cổng upstream",
      "diagnostics.col.stream": "Kiểu",
      "diagnostics.models.col.effort": "Cường độ áp dụng",
      "diag.auto": "tự động",
      "diag.stream": "Stream",
      "diag.nonStream": "Không stream",

      "availability.probe": "Probe ngay",
      "availability.probeHidden": "Đã ẩn — không dò",
      "availability.probeResult": "Kết quả dò",
      "availability.probeSuccess": "dùng được",
      "availability.probeFailed": "không dùng được",
      "availability.probeNotAttempted": "chưa dò được",
      "availability.probeNotRecorded": "(trạng thái thủ công: chỉ hiển thị, không ghi vào sổ)",

      "config.reasoning.precedence": "Thứ tự ưu tiên ghi đè",
      "config.reasoning.precedence.client": "Client chỉ định > ghi đè theo mô hình > mức mặc định",
      "config.reasoning.precedence.byModel": "Ghi đè theo mô hình > Client chỉ định > mức mặc định",
      "config.reasoning.auto.title": "Cường độ suy luận đã kiểm chứng",
      "config.reasoning.auto.caption":
        "Kết quả probe ẩn danh gần nhất; “ghi đè” sẽ điền vào JSON theo mô hình ở trên.",
      "config.reasoning.auto.refresh": "Làm mới kết quả",
      "config.reasoning.auto.col.model": "Mô hình",
      "config.reasoning.auto.col.effort": "Cường độ",
      "config.reasoning.auto.col.status": "Trạng thái",
      "config.reasoning.auto.col.action": "Thao tác",
      "config.reasoning.auto.write": "Ghi đè",
      "config.reasoning.auto.written":
        "Đã ghi {0}={1}; hãy lưu cấu hình để có hiệu lực",
      "config.reasoning.auto.empty": "Chưa có cường độ nào được kiểm chứng; hãy chờ probe rồi làm mới.",

      "config.fallback.title": "Mô hình dự phòng",
      "config.fallback.caption":
        "Khi mô hình chính thất bại, yêu cầu sẽ thử lại với mô hình dự phòng (một bước); nếu dự phòng vẫn lỗi sẽ giữ lỗi ban đầu.",
      "config.fallback.config": "Bản đồ dự phòng (JSON)",
      "config.fallback.note":
        "Khóa là mô hình chính, giá trị là một mô hình dự phòng (không tự trỏ và không vòng lặp); bộ dựng sẽ ghi trực tiếp vào JSON này.",
      "config.refusal.caption": "Viết lại khi bị từ chối: khi upstream từ chối vì nội dung, đưa lý do từ chối trở lại cùng kênh và thử lại tối đa số vòng đã đặt.",
      "config.refusal.rounds": "Số vòng viết lại khi bị từ chối",
      "config.refusal.note": "0 là tắt; mỗi vòng được tính phí lại.",
      "config.fallback.from": "Mô hình chính",
      "config.fallback.to": "Mô hình dự phòng",
      "config.fallback.add": "Thêm dự phòng",
      "config.fallback.col.from": "Mô hình chính",
      "config.fallback.col.to": "Mô hình dự phòng",
      "config.fallback.col.action": "Thao tác",
      "config.fallback.empty": "Chưa có mục dự phòng; dùng trình xây dựng bên dưới hoặc sửa JSON.",
      "config.fallback.needSelect": "Hãy chọn mô hình ở cả hai bên trước",
      "config.fallback.self": "Mô hình dự phòng không được trùng với mô hình chính",

      "config.proxy.byModelTitle": "Mô hình → Proxy cố định",
      "config.proxy.byModelCaption":
        "Mô hình khớp sẽ buộc đi qua các exit đã liệt kê; danh sách trống sẽ dùng chính sách mặc định.",
      "config.proxy.byModel": "Gắn kết theo mô hình (JSON)",
      "config.proxy.byModelNote":
        "Bộ dựng sẽ ghi trực tiếp vào JSON này; tên exit phải trùng với Proxy đã cấu hình ở trên.",
      "config.proxy.pbmModel": "Mô hình",
      "config.proxy.pbmAnyModel": "(mọi mô hình)",
      "config.proxy.pbmExits": "Exit cần gắn kết (mỗi dòng một cái)",
      "config.proxy.pbmPick": "Chọn cổng ra (chọn nhiều được)",
      "config.proxy.pbmPickNote":
        "Danh sách cổng ra lấy từ các proxy đã cấu hình phía trên (kể cả proxy từ tệp). Thứ tự bấm chính là thứ tự gắn kết — bấm trước đứng trước.",
      "config.proxy.pbmReset": "Bỏ chọn hết",
      "config.proxy.pbmNoExits":
        "Chưa có cổng ra nào; hãy thêm Proxy phía trên hoặc điền tệp proxy trước.",
      "config.proxy.pbmAdd": "Thêm gắn kết",
      "config.proxy.pbmCol.model": "Mô hình",
      "config.proxy.pbmCol.exits": "Exit",
      "config.proxy.pbmCol.action": "Thao tác",
      "config.proxy.pbmEmpty": "Chưa có gắn kết nào; dùng trình xây dựng bên dưới hoặc sửa JSON.",
      "config.proxy.pbmNeedExits": "Bấm chọn ít nhất một exit trước",
      "config.proxy.healthTitle": "Thử lại và kiểm tra sức khỏe exit",
      "config.proxy.healthCaption":
        "Exit lỗi sẽ thử lại theo số lần và khoảng cách; kiểm tra sức khỏe chỉ kiểm lại proxy được đánh dấu kém.",
      "config.proxy.retryAttempts": "Số lần thử lại exit (0 = theo toàn cục)",
      "config.proxy.retryInterval": "Khoảng thử lại exit (giây, 0 = tắt)",
      "config.proxy.healthInterval": "Khoảng probe (phút)",
      "config.proxy.healthTimeout": "Hạn probe (giây)",
      "config.proxy.healthBackoff": "Trần lùi probe (phút)",
      "config.proxy.healthUrl": "URL probe",
      "config.proxy.healthDisabled": "Tắt kiểm tra sức khỏe proxy (không tự kiểm lại)",
      "config.fallbackcircuit.title": "Cầu chì liên yêu cầu (mặc định tắt)",
      "config.fallbackcircuit.caption":
        "Khi bật: model gắn exit gặp lỗi cứng (từ chối / DNS / TLS) sẽ dừng sau một lần thử sticky, rồi các yêu cầu tạm sang model dự phòng. Hết thời hạn tạm dừng sẽ probe exit của chính nó trước; chỉ khi probe đạt mới quay lại model chính.",
      "config.fallbackcircuit.mode": "Chế độ",
      "config.fallbackcircuit.modeOff": "off (hành vi nhánh chính cũ)",
      "config.fallbackcircuit.modeFast": "fast (cắt nhanh + cầu chì liên yêu cầu)",
      "config.fallbackcircuit.pause": "Thời gian tạm dừng (giây, 0 = mặc định 300)",
      "config.fallbackcircuit.revival": "Chu kỳ quét probe hồi phục (giây, 0 = mặc định 30)",
    },
  };

let locale = DEFAULT_LOCALE;

const fill = (text, args) =>
  args.reduce((value, item, index) => value.replaceAll(`{${index}}`, String(item)), text);

const lookup = (key) => {
  for (const code of [locale, DEFAULT_LOCALE]) {
    const value = DICTIONARY[code]?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
};

const interpolate = (value, args) => (args.length ? fill(value, args) : value);

// t maps an authored Simplified Chinese string to the active locale. The
// original text is returned whenever the dictionary has no entry, so a page
// module is always readable without consulting the dictionary.
export const t = (original, key, ...args) => {
  const value = lookup(key);
  return interpolate(value === undefined ? original : value, args);
};

// apply re-renders every node carrying a static translation attribute. Any
// node created after a language switch is picked up by the next apply() call.
export const apply = (root = document) => {
  const dictionary = DICTIONARY[locale] || {};
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    if (!originals.has(node)) originals.set(node, node.innerHTML);
    const value = dictionary[node.dataset.i18n];
    node.innerHTML = value === undefined ? originals.get(node) : value;
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    const targets = node.dataset.i18nAttr.split(",").map((pair) => pair.trim().split(":"));
    if (!originals.has(node))
      originals.set(
        node,
        targets.map(([attribute]) => node.getAttribute(attribute) || ""),
      );
    const snapshot = originals.get(node);
    targets.forEach(([attribute, key], index) => {
      const value = dictionary[key];
      node.setAttribute(attribute, value === undefined ? snapshot[index] : value);
    });
  });
};

const syncSelectors = () => {
  document.querySelectorAll("[data-lang-switch]").forEach((node) => {
    node.value = locale;
    node.setAttribute("aria-label", LABELS[locale] || lookup("lang.label") || "Language");
  });
};

const notify = () => listeners.forEach((listener) => listener(locale));

export const setLocale = (code, persist = true) => {
  const next = SUPPORTED.includes(code) ? code : DEFAULT_LOCALE;
  const changed = next !== locale;
  if (changed) {
    locale = next;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, locale);
      } catch (_) {}
    }
    document.documentElement.lang = locale;
    apply();
  }
  syncSelectors();
  if (changed) notify();
};

const stored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

const browserLocale = () => {
  const candidates = [...(navigator.languages || []), navigator.language].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = String(candidate).toLowerCase();
    if (normalized.startsWith("zh")) return "zh-CN";
    if (normalized.startsWith("vi")) return "vi";
    if (normalized.startsWith("en")) return "en";
  }
  return "";
};

// init fills the selectors, applies the stored locale and translates the static
// markup. It never notifies listeners: the shell imports this module after its
// pages are registered, so the first render already happens in the right locale.
export const init = () => {
  document.documentElement.lang = locale;
  document.querySelectorAll("[data-lang-switch]").forEach((node) => {
    node.replaceChildren(
      ...SUPPORTED.map((code) => {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = FLAGS[code];
        option.setAttribute("aria-label", LABELS[code]);
        return option;
      }),
    );
    node.onchange = (event) => setLocale(event.target.value);
  });
  const initial = SUPPORTED.includes(stored()) ? stored() : browserLocale();
  if (initial) setLocale(initial, false);
  else apply();
  syncSelectors();
};

export const locales = SUPPORTED;
export const currentLocale = () => locale;
export const localeLabel = (code) => LABELS[code] || code;
export const dateLocale = () => DATE_LOCALES[locale] || locale;

// onChange lets page modules re-render their dynamic text after a switch. It
// returns an unsubscribe function so a page can drop the listener on reset.
export const onChange = (listener) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
};
