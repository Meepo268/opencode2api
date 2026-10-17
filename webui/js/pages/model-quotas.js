// Page: 模型与额度 — Go quota windows and free model availability.
import { api, hasSession } from "../api.js";
import { loadConfig, loadDebugModels } from "../data.js";
import { t, onChange } from "../i18n.js";
import { $, bindTabs, copyText, el, emptyRow, localTime, toast } from "../ui.js";

const windows = () => [
  ["rolling", t("5 小时窗口", "quotas.window.hour")],
  ["weekly", t("每周窗口", "quotas.window.week")],
  ["monthly", t("每月窗口", "quotas.window.month")],
];

let data = null;
let timer = null;
let loading = false;
let activeTab = "quota";

async function load() {
  if (loading) return;
  loading = true;
  $("#quota-refresh").disabled = true;
  $("#quota-refresh").textContent = t("读取中…", "quotas.loading");
  try {
    const value = await api("/api/model-quotas");
    if (!hasSession()) return;
    data = value;
    const select = $("#quota-account");
    const selected = select.value;
    select.replaceChildren();
    for (const account of value.accounts || []) {
      select.append(el("option", { value: account.id, text: `Go Key ${account.display}` }));
    }
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
    if (!select.options.length)
      select.append(el("option", { value: "", text: t("尚未配置 Go Key", "quotas.noKey") }));
    render();
  } catch (error) {
    $("#quota-status").textContent = t(
      `查询失败：${error.message}。已有显示仅为上次查询结果。`,
      "quotas.queryFailed",
      error.message,
    );
  } finally {
    loading = false;
    $("#quota-refresh").disabled = false;
    $("#quota-refresh").textContent = t("刷新额度", "quotas.refresh");
  }
}

function render() {
  if (!data) return;
  const account = (data.accounts || []).find((item) => item.id === $("#quota-account").value);
  const stale = account?.status === "stale";
  const cards = $("#quota-cards");
  cards.replaceChildren();
  $("#quota-status").textContent = !account
    ? t("请先在配置中心添加 OpenCode Go Key。", "quotas.addKeyFirst")
    : account.error
      ? stale
        ? t("{0}；下方显示上次成功数据，当前额度未知。", "quotas.staleError", account.error)
        : t("{0}；当前额度未知。", "quotas.error", account.error)
      : t("已连接 OpenCode · 共享套餐额度。多个 Key 的额度不相加。", "quotas.connected");
  $("#quota-updated").textContent = account?.fetched_at
    ? t(
        `${stale ? "上次成功查询" : "额度更新时间"}：${localTime(account.fetched_at)} · 缓存 60 秒 · 来源：OpenCode Go /v1/usage`,
        stale ? "quotas.lastSuccess" : "quotas.updated",
        localTime(account.fetched_at),
      )
    : "";
  for (const [id, label] of windows()) {
    const item = account?.windows?.[id];
    const progress = el("progress", { max: 100, "aria-label": t(`${label}剩余额度`, "quotas.window.aria", label) });
    progress.value = item ? item.remaining_percent : 0;
    cards.append(
      el("div", { class: `quota-card${item?.remaining_percent < 20 ? " quota-low" : ""}` }, [
        el("h3", { text: label }),
        el("div", {
          class: "quota-value",
          text: item ? `≈ ${item.remaining_percent}%` : t("未知", "common.unknown"),
        }),
        progress,
        el("div", {
          class: "quota-reset",
          text: item
            ? `${stale ? t("历史剩余", "quotas.remainingHistory") : t("剩余", "quotas.remaining")} · ${
                item.status === "rate-limited" ? t("已限额 · ", "quotas.rateLimited") : ""
              }${t("重置于 {0}", "quotas.resetsAt", localTime(item.resets_at))}`
            : t("等待上游额度数据", "quotas.waiting"),
        }),
      ]),
    );
  }
  const query = $("#quota-model-search").value.trim().toLowerCase();
  const allModels = data.models || [];
  const models = allModels.filter((model) => model.id.toLowerCase().includes(query));
  $("#quota-model-count").textContent = `${models.length} / ${allModels.length}`;
  const catalog = data.catalog;
  const catalogUpdated =
    catalog?.updated_at && !catalog.updated_at.startsWith("0001-")
      ? localTime(catalog.updated_at)
      : t("尚未就绪", "common.notReady");
  $("#quota-catalog-status").textContent = `${catalog?.stale ? t("模型目录暂未更新，显示缓存 · ", "quotas.catalogStale") : ""}${t(
    `目录更新时间：${catalogUpdated}`,
    "quotas.catalogUpdated",
    catalogUpdated,
  )}`;
  const host = $("#quota-models");
  host.replaceChildren();
  for (const model of models) {
    const copy = el("button", { class: "btn btn-sm btn-ghost", text: t("复制名称", "quotas.copyName") });
    copy.addEventListener("click", () => copyText(model.id));
    const row = el("tr", {}, [
      el("td", { class: "mono", text: model.id }),
      el("td", {
        text:
          { chat: "Chat Completions", responses: "Responses", anthropic: "Messages" }[model.protocol] ||
          model.protocol,
      }),
    ]);
    for (const [id] of windows()) {
      const item = account?.windows?.[id];
      row.append(
        el("td", {
          class: "num",
          text: item
            ? `≈ ${item.remaining_percent}%${stale ? t("（历史）", "quotas.history") : ""}`
            : t("未知", "common.unknown"),
        }),
      );
    }
    row.append(el("td", {}, [copy]));
    host.append(row);
  }
  if (!models.length)
    emptyRow(
      host,
      6,
      allModels.length
        ? t("没有匹配的模型", "diag.noMatch")
        : t("模型目录尚未就绪，请稍后刷新", "quotas.catalogPending"),
    );
}

const date = (value) =>
  value && !value.startsWith("0001-") ? localTime(value) : t("待探测", "availability.pending");

async function loadAvailability() {
  try {
    const value = await api("/api/models/availability");
    $("#availability-error").textContent = "";
    const host = $("#availability-models");
    host.replaceChildren();
    for (const item of value.models) {
      const restore = el("button", {
        type: "button",
        class: "btn btn-sm btn-ghost",
        text: t("恢复启用", "availability.restore"),
        disabled: !item.disabled,
      });
      const toggle = el("button", {
        type: "button",
        class: "btn btn-sm btn-ghost",
        text: item.manual
          ? t("切回自动", "availability.switchAuto")
          : t("切为手动", "availability.switchManual"),
      });
      const hide = el("button", {
        type: "button",
        class: "btn btn-sm btn-ghost",
        text: item.hidden
          ? t("对客户端显示", "availability.unhide")
          : t("对客户端隐藏", "availability.hide"),
      });
      const probe = el("button", {
        type: "button",
        class: "btn btn-sm btn-ghost",
        text: t("立即探测", "availability.probe"),
        disabled: !!item.hidden,
        title: item.hidden ? t("已隐藏，不探测", "availability.probeHidden") : "",
      });
      const run = async (path, body, isProbe = false) => {
        restore.disabled = true;
        toggle.disabled = true;
        hide.disabled = true;
        probe.disabled = true;
        try {
          const value = await api(path, { method: "POST", body: JSON.stringify(body) });
          if (isProbe && value?.probe) {
            // 探测接口总是返回结果：自动模型随后落账刷新表格；手动模型
            // 按设计不落账（manual records frozen），所以必须把回包直接
            // 递到用户眼前，否则“点了跟没点一样”。
            const r = value.probe;
            const parts = [
              t("本次探测", "availability.probeResult"),
              r.attempted
                ? r.success
                  ? t("可用", "availability.probeSuccess")
                  : t("不可用", "availability.probeFailed")
                : t("未执行", "availability.probeNotAttempted"),
              r.reason,
              r.channel,
              r.proxy,
            ].filter(Boolean);
            if (r.attempted && !r.recorded) {
              parts.push(
                t("（手动状态：仅显示，不写入台账）", "availability.probeNotRecorded"),
              );
            }
            toast(parts.join(" "), r.attempted && !r.success);
          }
          await loadAvailability();
          await loadDebugModels();
          // 隐藏状态同时写进配置视图，避免随后在配置页保存时把 models.hidden 冲掉。
          if (path.endsWith("/hide")) await loadConfig();
        } catch (error) {
          $("#availability-error").textContent = error.message;
          restore.disabled = !item.disabled;
          toggle.disabled = false;
          hide.disabled = false;
          probe.disabled = !!item.hidden;
        }
      };
      restore.addEventListener("click", () => run("/api/models/restore", { model: item.model }));
      toggle.addEventListener("click", () =>
        run("/api/models/manual", { model: item.model, manual: !item.manual }),
      );
      hide.addEventListener("click", () =>
        run("/api/models/hide", { model: item.model, hidden: !item.hidden }),
      );
      probe.addEventListener("click", () => run("/api/models/probe", { model: item.model }, true));
      host.append(
        el("tr", {}, [
          el("td", {}, [
            el("span", { class: "mono", text: item.model }),
            item.hidden
              ? el("span", {
                  class: "warn",
                  text: ` · ${t("已隐藏", "availability.hidden")}`,
                })
              : null,
          ].filter(Boolean)),
          el("td", {
            class: item.disabled ? "warn" : "ok",
            text: item.disabled ? t("已禁用", "state.disabled") : t("已启用", "state.enabled"),
          }),
          el("td", {
            text:
              [item.channel, item.reason].filter(Boolean).join(" / ") ||
              t("待探测", "availability.pending"),
          }),
          el("td", {
            text: item.manual
              ? t("手动", "availability.manual")
              : t("自动", "availability.auto"),
          }),
          el("td", {
            text: item.auto_effort?.effort
              ? `${item.auto_effort.effort}（${date(item.effort_checked_at)}）`
              : t("未验证", "availability.unverified"),
          }),
          el("td", { class: "mono", text: date(item.checked_at) }),
          el("td", {
            class: "mono",
            text: item.hidden
              ? t("已隐藏，不探测", "availability.notProbed")
              : item.manual
                ? t("手动控制，不自动探测", "availability.manualControl")
                : date(item.next_check),
          }),
          el("td", {}, [el("div", { class: "key-actions" }, [restore, toggle, probe, hide])]),
        ]),
      );
    }
    if (!value.models.length)
      $("#availability-error").textContent = t(
        "当前模型目录中没有符合免费资格的模型。",
        "availability.noneEligible",
      );
  } catch (error) {
    $("#availability-error").textContent = error.message;
  }
}

function startPolling() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!document.hidden) load();
  }, 60000);
}

function stopPolling() {
  clearInterval(timer);
  timer = null;
}

export default {
  id: "model-quotas",
  title: "模型与额度",
  sub: "共享套餐额度与免费模型探测状态。",
  init() {
    bindTabs($("#page-model-quotas"), (id) => {
      activeTab = id;
      if (id === "quota") {
        load();
        startPolling();
      } else {
        stopPolling();
        loadAvailability();
      }
    });
    $("#quota-refresh").addEventListener("click", load);
    $("#quota-account").addEventListener("change", render);
    $("#quota-model-search").addEventListener("input", render);
    $("#availability-refresh").addEventListener("click", loadAvailability);
    // Only the rows are rebuilt: a refresh button that is mid-request keeps its
    // disabled state and its "读取中…" label.
    onChange(() => {
      if (!loading) $("#quota-refresh").textContent = t("刷新额度", "quotas.refresh");
      const emptyOpt = $("#quota-account")?.querySelector('option[value=""]');
      if (emptyOpt) emptyOpt.textContent = t("尚未配置 Go Key", "quotas.noKey");
      if (activeTab === "quota") render();
      else loadAvailability();
    });
  },
  show() {
    if (activeTab === "quota") {
      load();
      startPolling();
    } else {
      loadAvailability();
    }
  },
  hide() {
    stopPolling();
  },
  refresh() {
    if (activeTab === "quota") load();
    else loadAvailability();
  },
};
