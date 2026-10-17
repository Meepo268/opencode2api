// Page: 配置中心 — masked config editing with validation, hot reload and reveal.
import { api } from "../api.js";
import { loadConfig, loadDebugModels } from "../data.js";
import * as store from "../store.js";
import { t, onChange } from "../i18n.js";
import { $, $$, bindTabs, el, emptyRow, openDialog, timeOnly, toast } from "../ui.js";

function renderChips(name) {
  const host = $(`#${name}-chips`);
  host.replaceChildren();
  (store.get("config")?.[name] || []).forEach((item) => {
    const remove = el("button", { type: "button", title: t("移除", "common.remove"), text: "×" });
    const chip = el("span", { class: "chip", dataset: { id: item.id } });
    remove.addEventListener("click", () => chip.remove());
    chip.append(el("span", { text: item.display }), remove);
    host.append(chip);
  });
}

function renderRestartNotice(value) {
  const notice = $("#restart-notice");
  if (value?.restart_required_fields?.length) {
    notice.textContent = t(
      `已保存但尚未生效：${value.restart_required_fields.join(", ")}。当前 API ${value.effective.listen}、WebUI ${value.effective.webui_listen}。请重启进程。`,
      "config.restartNotice",
      value.restart_required_fields.join(", "),
      value.effective.listen,
      value.effective.webui_listen,
    );
    notice.classList.remove("hidden");
  } else {
    notice.classList.add("hidden");
  }
}

function secretInputs(name) {
  const kept = [...$(`#${name}-chips`).children].map((node) => ({ id: node.dataset.id }));
  const added = $(`#${name}-new`)
    .value.split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({ value }));
  return kept.concat(added);
}

const numberValue = (selector) => Number($(selector).value);

// Parse a textarea as a JSON object (used for the proxy / model override
// maps). Empty input stays an empty object.
function parseJsonObject(raw, name) {
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(t(`“${name}”需要是 JSON 对象`, "config.json.object", name));
  return value;
}

// A cleared textarea keeps the stored map so a save never wipes it by
// accident; typing {} is the explicit way to clear one of these maps.
function jsonMapField(selector, stored) {
  const raw = $(selector).value.trim();
  if (raw) return parseJsonObject(raw, t("JSON 配置", "config.json.object"));
  return { ...(store.get("config")?.[stored] || {}) };
}

// ---- 模型 → Proxy 定向（proxy_by_model）-------------------------------

function proxyTokenOptions() {
  return store.get("config")?.effective_proxies || [];
}

function pbmDisplay(token) {
  const hit = proxyTokenOptions().find((item) => item.id === token);
  return hit?.display || token;
}

// proxyPoolsPlain 把 API 返回的 SecretView（{id,display}）还原成可直接回写的出口
// token；未命中的条目保持原样，避免把用户手写的节点名丢掉。
function proxyPoolsPlain(pools) {
  const out = {};
  for (const [model, list] of Object.entries(pools || {})) {
    out[model] = (list || []).map((item) =>
      item && typeof item === "object" ? item.id || item.display || "" : item,
    );
  }
  return out;
}

function refreshPbmOptions() {
  const select = $("#pbm-new-model");
  if (!select) return;
  const selected = select.value;
  select.replaceChildren(
    el("option", { value: "", text: t("（任意模型）", "config.proxy.pbmAnyModel") }),
  );
  (store.get("debug")?.models || []).forEach((item) => {
    select.append(el("option", { value: item.model, text: item.model }));
  });
  if ([...select.options].some((option) => option.value === selected)) {
    select.value = selected;
  }
  renderPbmChips();
}

function readPbm() {
  return parseJsonObject($("#c-proxy-by-model").value.trim(), t("按模型绑定", "config.json.object"));
}

function renderPbmRows() {
  const host = $("#pbm-rows");
  if (!host) return;
  host.replaceChildren();
  let pools = {};
  try {
    pools = readPbm();
  } catch {
    // 无法解析时保持上一份渲染结果（textarea 自身的错误由保存时报错体现）。
  }
  for (const [model, list] of Object.entries(pools)) {
    const remove = el("button", {
      type: "button",
      class: "btn btn-sm btn-ghost",
      text: t("移除", "common.remove"),
    });
    remove.addEventListener("click", () => {
      let pools = {};
      try {
        pools = readPbm();
      } catch (error) {
        toast(error.message, true);
        return;
      }
      delete pools[model];
      $("#c-proxy-by-model").value = JSON.stringify(pools, null, 2);
      renderPbmRows();
    });
    host.append(
      el("tr", {}, [
        el("td", {
          class: "mono",
          text:
            model === "*"
              ? t("（任意模型）", "config.proxy.pbmAnyModel")
              : model,
        }),
        el("td", { class: "mono", text: list.map((token) => pbmDisplay(token)).join(" · ") }),
        el("td", {}, [el("div", { class: "key-actions" }, [remove])]),
      ]),
    );
  }
  if (!host.children.length)
    emptyRow(host, 3, t("暂无绑定；使用下方构建或直接编辑 JSON。", "config.proxy.pbmEmpty"));
}

// pbmChipOrder：点选顺序（index 0 = 绑定数组第一位）。“点选顺序即绑定顺序”。
let pbmChipOrder = [];

function renderPbmChips() {
  const host = $("#pbm-new-chips");
  if (!host) return;
  const pool = proxyTokenOptions();
  const poolIds = new Set(pool.map((item) => item.id));
  // 出口池变化后，只保留仍存在的点选记录。
  pbmChipOrder = pbmChipOrder.filter((token) => poolIds.has(token));
  host.replaceChildren();
  if (!pool.length) {
    host.append(
      el("span", {
        class: "chip-empty",
        text: t(
          "尚未配置出口；先在上方添加 Proxy 或填写 proxy 文件。",
          "config.proxy.pbmNoExits",
        ),
      }),
    );
    return;
  }
  pool.forEach((item) => {
    const idx = pbmChipOrder.indexOf(item.id);
    const label = item.display || item.id;
    const button = el("button", {
      type: "button",
      class: idx >= 0 ? "exit-chip active" : "exit-chip",
      text: idx >= 0 ? `${idx + 1}. ${label}` : label,
    });
    button.dataset.token = item.id;
    button.title = item.id;
    button.addEventListener("click", () => togglePbmChip(item.id));
    host.append(button);
  });
}

function togglePbmChip(token) {
  const idx = pbmChipOrder.indexOf(token);
  if (idx >= 0) pbmChipOrder.splice(idx, 1);
  else pbmChipOrder.push(token);
  renderPbmChips();
}

function clearPbmChips() {
  pbmChipOrder = [];
  renderPbmChips();
}

function addPbm() {
  let pools;
  try {
    pools = readPbm();
  } catch (error) {
    toast(error.message, true);
    return;
  }
  const model = $("#pbm-new-model").value.trim();
  const exits = [...pbmChipOrder];
  if (!exits.length) {
    toast(t("请先点选至少一个出口", "config.proxy.pbmNeedExits"), true);
    return;
  }
  const key = model || "*";
  const known = new Set(pools[key] || []);
  exits.forEach((token) => known.add(token));
  pools[key] = [...known];
  $("#c-proxy-by-model").value = JSON.stringify(pools, null, 2);
  pbmChipOrder = [];
  renderPbmRows();
  renderPbmChips();
}

// ---- 模型回退（model_fallback）----------------------------------------

function refreshFallbackOptions() {
  for (const selector of ["#fb-new-from", "#fb-new-to"]) {
    const select = $(selector);
    if (!select) continue;
    const selected = select.value;
    select.replaceChildren();
    (store.get("debug")?.models || []).forEach((item) => {
      select.append(el("option", { value: item.model, text: item.model }));
    });
    if ([...select.options].some((option) => option.value === selected)) {
      select.value = selected;
    }
  }
}

function readFallback() {
  return parseJsonObject($("#c-model-fallback").value.trim(), t("模型回退", "config.json.object"));
}

function renderFallbackRows() {
  const host = $("#fb-rows");
  if (!host) return;
  host.replaceChildren();
  let map = {};
  try {
    map = readFallback();
  } catch {
    // 解析失败时保持为空，保存时会给出完整报错。
  }
  for (const [fromModel, toModel] of Object.entries(map)) {
    const remove = el("button", {
      type: "button",
      class: "btn btn-sm btn-ghost",
      text: t("移除", "common.remove"),
    });
    remove.addEventListener("click", () => {
      let map = {};
      try {
        map = readFallback();
      } catch (error) {
        toast(error.message, true);
        return;
      }
      delete map[fromModel];
      $("#c-model-fallback").value = JSON.stringify(map, null, 2);
      renderFallbackRows();
    });
    host.append(
      el("tr", {}, [
        el("td", { class: "mono", text: fromModel }),
        el("td", { class: "mono", text: toModel }),
        el("td", {}, [el("div", { class: "key-actions" }, [remove])]),
      ]),
    );
  }
  if (!host.children.length)
    emptyRow(host, 3, t("暂无回退项；使用下方构建或直接编辑 JSON。", "config.fallback.empty"));
}

function addFallback() {
  let map;
  try {
    map = readFallback();
  } catch (error) {
    toast(error.message, true);
    return;
  }
  const fromModel = $("#fb-new-from").value.trim();
  const toModel = $("#fb-new-to").value.trim();
  if (!fromModel || !toModel) {
    toast(t("请先在两侧下拉框里选择模型", "config.fallback.needSelect"), true);
    return;
  }
  if (fromModel === toModel) {
    toast(t("回退模型不能与主模型相同", "config.fallback.self"), true);
    return;
  }
  map[fromModel] = toModel;
  $("#c-model-fallback").value = JSON.stringify(map, null, 2);
  renderFallbackRows();
}

// ---- 匿名探测思考档位（写入 effort_by_model）---------------------------

async function renderEffortAuto() {
  const host = $("#effort-auto-rows");
  const refresh = $("#effort-refresh");
  if (!host) return;
  if (refresh) refresh.disabled = true;
  try {
    const value = await api("/api/models/availability");
    host.replaceChildren();
    for (const item of value.models || []) {
      if (!item.auto_effort?.effort) continue;
      const write = el("button", {
        type: "button",
        class: "btn btn-sm btn-ghost",
        text: t("写入覆盖", "config.reasoning.auto.write"),
      });
      write.addEventListener("click", () => {
        let current = {};
        try {
          current = JSON.parse($("#c-reasoning-by-model").value || "{}");
        } catch {
          toast(t("按模型覆盖 JSON 解析失败", "config.json.object"), true);
          return;
        }
        current[item.model] = item.auto_effort.effort;
        $("#c-reasoning-by-model").value = JSON.stringify(current, null, 2);
        toast(
          t(
            `已写入 ${item.model}=${item.auto_effort.effort}，点击“保存配置”后生效`,
            "config.reasoning.auto.written",
            item.model,
            item.auto_effort.effort,
          ),
        );
      });
      host.append(
        el("tr", {}, [
          el("td", { class: "mono", text: item.model }),
          el("td", { text: item.auto_effort.effort }),
          el("td", {
            text:
              [item.channel, timeOnly(item.effort_checked_at)].filter(Boolean).join(" · ") ||
              t("待探测", "availability.pending"),
          }),
          el("td", {}, [el("div", { class: "key-actions" }, [write])]),
        ]),
      );
    }
    if (!host.children.length)
      emptyRow(host, 4, t("暂无已验证档位；等待匿名探测运行后刷新。", "config.reasoning.auto.empty"));
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (refresh) refresh.disabled = false;
    if (refresh) refresh.textContent = t("刷新结果", "config.reasoning.auto.refresh");
  }
}

function fillConfig(value) {
  if (!value) return;
  $("#c-listen").value = value.listen;
  $("#c-prefer").value = value.prefer;
  $("#c-web-listen").value = value.webui.listen;
  $("#c-session").value = value.webui.session_ttl_minutes;
  $("#c-web-enabled").checked = value.webui.enabled;
  $("#c-anonymous").checked = !!value.anonymous;
  $("#c-anonymous-priority").checked = !!value.anonymous_priority;
  $("#c-refusal-rounds").value = value.content_refusal?.rounds ?? 0;
  $("#c-proxyfile").value = value.proxyfile;
  $("#c-proxy-retry-attempts").value = value.proxy_retry?.max_attempts ?? 0;
  $("#c-proxy-retry-interval").value = value.proxy_retry?.interval_seconds ?? 0;
  $("#c-ph-interval").value = value.proxy_health?.probe_interval_minutes ?? "";
  $("#c-ph-timeout").value = value.proxy_health?.probe_timeout_seconds ?? "";
  $("#c-ph-backoff").value = value.proxy_health?.max_probe_backoff_minutes ?? "";
  $("#c-ph-url").value = value.proxy_health?.probe_url || "";
  $("#c-ph-disabled").checked = !!value.proxy_health?.disabled;
  $("#c-up-zen").value = value.upstream.zen;
  $("#c-up-go").value = value.upstream.go;
  $("#c-up-anon").value = value.upstream.anonymous || "";
  $("#c-attempts").value = value.retry.max_attempts;
  $("#c-timeout").value = value.retry.timeout_seconds;
  $("#c-refresh").value = value.models.refresh_seconds;
  $("#c-protocols").value = JSON.stringify(value.models.protocols || {}, null, 2);
  $("#c-free-only").checked = !!value.models.free_only;
  const reasoning = value.reasoning || {};
  $("#c-reasoning-effort").value = reasoning.effort || "";
  $("#c-reasoning-precedence").value = reasoning.precedence || "client_first";
  $("#c-reasoning-by-model").value = JSON.stringify(reasoning.effort_by_model || {}, null, 2);
  $("#c-idle").value = value.performance.max_idle_conns;
  $("#c-idle-host").value = value.performance.max_idle_conns_per_host;
  $("#c-max-host").value = value.performance.max_conns_per_host;
  $("#c-idle-timeout").value = value.performance.idle_conn_timeout_seconds;
  $("#c-connect").value = value.performance.connect_timeout_seconds;
  $("#c-cooldown").value = value.performance.failure_cooldown_seconds;
  $("#c-attempt-timeout").value = value.performance.attempt_timeout_seconds;
  $("#c-first-event-timeout").value = value.performance.first_event_timeout_seconds || 0;
  $("#c-level").value = value.logging.level;
  $("#c-ring").value = value.logging.ring_size;
  $("#c-dump-bodies").checked = !!value.logging.dump_request_bodies;
  $("#c-log-file").checked = !!value.logging.file_path;
  $("#c-log-file-path").value = value.logging.file_path || "";
  $("#c-proxy-by-model").value = JSON.stringify(proxyPoolsPlain(value.proxy_by_model || {}), null, 2);
  $("#c-model-fallback").value = JSON.stringify(value.model_fallback || {}, null, 2);
  ["server_keys", "zen_keys", "go_keys", "proxies"].forEach(renderChips);
  refreshPbmOptions();
  renderPbmRows();
  refreshFallbackOptions();
  renderFallbackRows();
  renderRestartNotice(value);
}

async function save(event) {
  event.preventDefault();
  const current = store.get("config");
  if (!current) return;
  try {
    const update = {
      listen: $("#c-listen").value,
      server_keys: secretInputs("server_keys"),
      zen_keys: secretInputs("zen_keys"),
      go_keys: secretInputs("go_keys"),
      anonymous: $("#c-anonymous").checked,
      anonymous_priority: $("#c-anonymous-priority").checked,
      proxies: secretInputs("proxies"),
      proxyfile: $("#c-proxyfile").value,
      proxy_by_model: jsonMapField("#c-proxy-by-model", "proxy_by_model"),
      proxy_retry: {
        max_attempts: numberValue("#c-proxy-retry-attempts"),
        interval_seconds: numberValue("#c-proxy-retry-interval"),
      },
      proxy_health: {
        probe_interval_minutes: numberValue("#c-ph-interval"),
        probe_timeout_seconds: numberValue("#c-ph-timeout"),
        max_probe_backoff_minutes: numberValue("#c-ph-backoff"),
        probe_url: $("#c-ph-url").value,
        disabled: $("#c-ph-disabled").checked,
      },
      model_fallback: jsonMapField("#c-model-fallback", "model_fallback"),
      content_refusal: { rounds: numberValue("#c-refusal-rounds") },
      prefer: $("#c-prefer").value,
      upstream: {
        zen: $("#c-up-zen").value,
        go: $("#c-up-go").value,
        anonymous: $("#c-up-anon").value.trim(),
      },
      retry: {
        max_attempts: numberValue("#c-attempts"),
        timeout_seconds: numberValue("#c-timeout"),
      },
      models: {
        refresh_seconds: numberValue("#c-refresh"),
        protocols: JSON.parse($("#c-protocols").value || "{}"),
        free_only: $("#c-free-only").checked,
        // 隐藏列表不在这页编辑，但后端按整块覆盖，必须原样带回。
        hidden: current.models?.hidden || [],
      },
      reasoning: {
        effort: $("#c-reasoning-effort").value,
        precedence: $("#c-reasoning-precedence").value,
        effort_by_model: JSON.parse($("#c-reasoning-by-model").value || "{}"),
      },
      performance: {
        max_idle_conns: numberValue("#c-idle"),
        max_idle_conns_per_host: numberValue("#c-idle-host"),
        max_conns_per_host: numberValue("#c-max-host"),
        idle_conn_timeout_seconds: numberValue("#c-idle-timeout"),
        connect_timeout_seconds: numberValue("#c-connect"),
        failure_cooldown_seconds: numberValue("#c-cooldown"),
        attempt_timeout_seconds: numberValue("#c-attempt-timeout"),
        first_event_timeout_seconds: numberValue("#c-first-event-timeout"),
      },
      logging: {
        level: $("#c-level").value,
        ring_size: numberValue("#c-ring"),
        dump_request_bodies: $("#c-dump-bodies").checked,
        // 取消勾选 → 空路径，明确关闭文件日志；勾选但路径留空 → 使用默认位置。
        file_path: $("#c-log-file").checked
          ? $("#c-log-file-path").value.trim() || "logs/opencode2api.log"
          : "",
      },
      webui: {
        enabled: $("#c-web-enabled").checked,
        listen: $("#c-web-listen").value,
        username: current.webui.username,
        session_ttl_minutes: numberValue("#c-session"),
      },
    };
    const result = await api("/api/config", { method: "PUT", body: JSON.stringify(update) });
    store.set("config", result.config);
    ["server_keys", "zen_keys", "go_keys", "proxies"].forEach(
      (name) => ($(`#${name}-new`).value = ""),
    );
    await loadDebugModels();
    toast(
      result.result.restart_required
        ? t(
            `已应用；${result.result.restart_fields.join(", ")} 需重启`,
            "toast.config.restart",
            result.result.restart_fields.join(", "),
          )
        : t("配置已保存并立即应用", "toast.config.saved"),
    );
  } catch (error) {
    toast(error.message, true);
  }
}

async function reload() {
  try {
    const result = await api("/api/config/reload", { method: "POST", body: "{}" });
    await loadConfig();
    await loadDebugModels();
    toast(
      result.restart_required
        ? t("磁盘配置已重载，监听字段需重启", "toast.config.reloadedRestart")
        : t("磁盘配置已重载", "toast.config.reloaded"),
    );
  } catch (error) {
    toast(error.message, true);
  }
}

function reveal() {
  const input = el("input", { type: "password", autocomplete: "current-password" });
  const submit = async (close) => {
    try {
      const values = await api("/api/config/reveal", {
        method: "POST",
        body: JSON.stringify({ password: input.value }),
      });
      close();
      openDialog({
        title: t("敏感配置", "modal.title"),
        size: "dialog-lg",
        body: el("pre", { text: JSON.stringify(values, null, 2) }),
        actions: [{ label: t("关闭", "modal.close") }],
      });
    } catch (error) {
      toast(error.message, true);
    }
  };
  const dialog = openDialog({
    title: t("查看敏感配置", "modal.revealTitle"),
    body: el("div", { class: "field" }, [
      el("label", { text: t("请再次输入管理密码", "config.revealPrompt") }),
      input,
    ]),
    actions: [
      { label: t("取消", "common.cancel") },
      { label: t("查看", "common.view"), kind: "btn-primary", onClick: submit },
    ],
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit(dialog.close);
    }
  });
}

export default {
  id: "config",
  title: "配置中心",
  sub: "验证后原子保存，并热应用可变字段。",
  init() {
    store.on("config", fillConfig);
    store.on("debug", () => {
      refreshPbmOptions();
      refreshFallbackOptions();
    });
    bindTabs($("#page-config"));
    $("#config-form").addEventListener("submit", save);
    $("#reload-config").addEventListener("click", reload);
    $("#reveal").addEventListener("click", reveal);
    $("#pbm-add").addEventListener("click", addPbm);
    $("#pbm-chips-clear").addEventListener("click", clearPbmChips);
    $("#fb-add").addEventListener("click", addFallback);
    $("#effort-refresh").addEventListener("click", renderEffortAuto);
    onChange(() => {
      const value = store.get("config");
      if (value) renderRestartNotice(value);
      // Update chip tooltips in place so pending unsaved chip removals survive a language switch.
      $$(".chips .chip button").forEach((button) => (button.title = t("移除", "common.remove")));
      renderPbmRows();
      renderFallbackRows();
      renderEffortAuto();
    });
  },
  show() {
    renderEffortAuto();
  },
};
