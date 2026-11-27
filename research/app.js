const API_BASE = new URLSearchParams(location.search).get("api") || "https://research-sync.haokaiding.com";
const TOKEN_KEY = "research_hub_token_v1";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  doc: { version: 2, items: [] },
  config: { projects: [], machines: [] },
  runs: [],
  fleet: null,
  updatedAt: null,
  syncedAt: null,
  view: "board",
  layout: "kanban",
  project: "",
  search: "",
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3000);
}

function assetUrl(key) {
  return `${API_BASE}/v1/asset/${encodeURIComponent(key)}?token=${encodeURIComponent(state.token)}`;
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
  const r = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/v1/login") {
    logout(true);
    throw new Error("登录已过期，请重新输入密码");
  }
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

function projColor(pid) {
  const palette = { "umi-transfer": "#5b8cff", "dexhand-repro": "#3ecf8e", "dprs-judge": "#a78bfa", "humanoid-tactile-loco": "#f5a524" };
  return palette[pid] || "#8b95a7";
}

function filterList(list, fields) {
  const q = state.search.trim().toLowerCase();
  return list.filter((x) => {
    if (state.project && x.project !== state.project) return false;
    if (!q) return true;
    return fields.some((f) => String(x[f] || "").toLowerCase().includes(q));
  });
}

function showApp(unlocked) {
  $("#auth-gate").classList.toggle("hidden", unlocked);
  $("#app").classList.toggle("hidden", !unlocked);
}

async function logout(silent = false) {
  if (!silent && state.token) {
    try { await api("/v1/logout", { method: "POST" }); } catch {}
  }
  state.token = "";
  localStorage.removeItem(TOKEN_KEY);
  showApp(false);
  $("#login-password").value = "";
  $("#login-password").focus();
}

async function loadCloud() {
  const data = await api("/v1/data");
  state.doc = data.state || { version: 2, items: [] };
  state.config = data.config || { projects: [], machines: [] };
  state.runs = data.runs || [];
  state.fleet = data.fleet || null;
  state.updatedAt = data.updatedAt;
  state.syncedAt = data.syncedAt;
  if (state.syncedAt) {
    $("#sync-status").textContent = "同步: " + state.syncedAt.slice(5, 16).replace("T", " ");
    $("#runs-meta").textContent = `最新 Mac 快照同步于 ${state.syncedAt.replace("T", " ").slice(0, 19)}`;
  }
  renderProjects();
  renderBoard();
  renderRuns();
  renderFleet();
}

async function saveStateCloud() {
  const res = await api("/v1/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.doc),
  });
  state.updatedAt = res.updatedAt;
  renderBoard();
}

function renderProjects() {
  const el = $("#project-filters");
  const projects = state.config?.projects || [];
  const btns = [
    `<button class="proj-btn ${state.project === "" ? "active" : ""}" data-proj=""><span>全部项目</span></button>`,
    ...projects.map((p) => `
      <button class="proj-btn ${state.project === p.id ? "active" : ""}" data-proj="${esc(p.id)}">
        <span><i class="proj-dot" style="background:${projColor(p.id)}"></i>${esc(p.name)}</span>
        ${p.status === "archived" ? '<span class="muted" style="font-size:10px">归档</span>' : ""}
      </button>
    `),
  ];
  el.innerHTML = btns.join("");
  el.querySelectorAll(".proj-btn").forEach((b) => {
    b.onclick = () => {
      state.project = b.dataset.proj;
      renderProjects();
      renderBoard();
      renderRuns();
    };
  });
  const sel = $("#form-project");
  sel.innerHTML = projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
}

function renderBoard() {
  const items = filterList(state.doc.items || [], ["id", "title", "hypothesis", "summary", "machine", "project"]);
  $("#nav-board-count").textContent = items.length;
  const container = $("#board-container");

  if (state.layout === "table") {
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>ID</th><th>项目</th><th>类型</th><th>标题</th><th>状态</th><th>结果</th><th>机器</th><th>更新</th></tr></thead>
        <tbody>
          ${items.map((x) => `
            <tr data-id="${esc(x.id)}">
              <td><code>${esc(x.id)}</code></td>
              <td>${esc(x.project)}</td>
              <td><span class="pill pill-${esc(x.kind)}">${esc(x.kind)}</span></td>
              <td><strong>${esc(x.title)}</strong></td>
              <td>${esc(x.status)}</td>
              <td>${x.outcome ? `<span class="pill pill-${esc(x.outcome)}">${esc(x.outcome)}</span>` : "—"}</td>
              <td>${esc(x.machine || "—")}</td>
              <td class="muted">${esc(x.updated_at || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
    container.querySelectorAll("tr[data-id]").forEach((tr) => { tr.onclick = () => openItemDrawer(tr.dataset.id); });
    return;
  }

  const cols = [
    { key: "running", label: "▶ Running", statuses: ["running"] },
    { key: "review", label: "🔍 Review / Planned", statuses: ["review", "planned"] },
    { key: "done", label: "✅ Done", statuses: ["done"] },
    { key: "parked", label: "⏸ Parked", statuses: ["parked"] },
  ];

  container.innerHTML = `<div class="kanban">${cols.map((c) => {
    const colItems = items.filter((x) => c.statuses.includes(x.status));
    return `
      <div class="col">
        <div class="col-head"><span>${c.label}</span><span class="badge">${colItems.length}</span></div>
        <div class="col-cards">
          ${colItems.map((x) => `
            <div class="card" data-id="${esc(x.id)}">
              <div class="card-top">
                <span class="pill pill-${esc(x.kind)}">${esc(x.kind)}</span>
                <span class="muted" style="font-size:11px">${esc(x.project)}</span>
                ${x.outcome ? `<span class="pill pill-${esc(x.outcome)}">${esc(x.outcome)}</span>` : ""}
              </div>
              <div class="card-title">${esc(x.title)}</div>
              <div class="card-summary">${esc(x.summary || x.hypothesis || "")}</div>
              ${Object.keys(x.metrics || {}).length ? `
                <div class="card-metrics">
                  ${Object.entries(x.metrics).slice(0, 4).map(([k, v]) => `<span class="metric-chip">${esc(k)}: ${esc(v)}</span>`).join("")}
                </div>` : ""}
              <div class="card-foot">
                <span>${esc(x.machine || "local")}</span>
                <span>${x.notion_url ? "☁️ Notion" : ""} ${esc(x.updated_at || "")}</span>
              </div>
            </div>
          `).join("") || `<div class="muted" style="font-size:12px;padding:8px 2px">暂无</div>`}
        </div>
      </div>`;
  }).join("")}</div>`;

  container.querySelectorAll(".card[data-id]").forEach((el) => { el.onclick = () => openItemDrawer(el.dataset.id); });
}

function renderRuns() {
  const runs = filterList(state.runs, ["run_name", "short_id", "project", "date"]);
  $("#nav-runs-count").textContent = runs.length;
  const el = $("#runs-container");
  el.innerHTML = runs.map((r) => `
    <div class="run-card" data-proj="${esc(r.project)}" data-name="${esc(r.run_name)}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11.5px;color:${projColor(r.project)};font-weight:600">${esc(r.project)}</span>
        <span class="muted" style="font-size:11.5px">${esc(r.updated_at)}</span>
      </div>
      <div class="run-name">${esc(r.run_name)}</div>
      <div class="run-stats">
        <span>🖼️ ${r.figures_count} 图</span>
        <span>📄 ${r.logs_count} 日志</span>
        <span>📦 ${r.data_files_count} 文件</span>
      </div>
      ${r.figures?.filter((f) => f.asset_key).length ? `
        <div class="run-thumbs">
          ${r.figures.filter((f) => f.asset_key).slice(0, 3).map((f) => `<img loading="lazy" src="${assetUrl(f.asset_key)}" alt="${esc(f.name)}" />`).join("")}
        </div>` : ""}
    </div>
  `).join("") || `<div class="muted">暂无已同步的运行快照（在 Mac 上执行 <code>python3 ~/research/hub/cli.py sync</code>）</div>`;

  el.querySelectorAll(".run-card").forEach((c) => { c.onclick = () => openRunDrawer(c.dataset.proj, c.dataset.name); });
}

function renderFleet() {
  const el = $("#fleet-container");
  const sumEl = $("#fleet-summary");
  const rawMachines = state.fleet?.machines || state.config?.machines || [];
  // Sort: online first -> offline -> standby
  const rank = (m) => (m.reachable === true ? 0 : m.reachable === false ? 1 : 2);
  const machines = [...rawMachines].sort((a, b) => rank(a) - rank(b));

  const online = machines.filter((m) => m.reachable === true).length;
  const allGpus = machines.flatMap((m) => m.gpus || []);
  const busyGpus = allGpus.filter((g) => g.util >= 20 || g.mem_used > 2000).length;
  const allJobs = machines.flatMap((m) => m.jobs || []);
  const runningJobs = allJobs.filter((j) => j.state === "RUNNING").length;
  const pendingJobs = allJobs.filter((j) => j.state === "PENDING").length;

  if (state.fleet?.checked_at) {
    $("#fleet-meta").textContent = `● LIVE · 采集于 ${state.fleet.checked_at}（页面每 30s 自动刷新）`;
    $("#nav-fleet-count").textContent = `${online}/${machines.length}`;
  }
  if (sumEl) {
    sumEl.innerHTML = `
      <div class="kpi-card"><div class="kpi-label">在线主机</div><div class="kpi-val" style="color:var(--green)">${online} / ${machines.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">直连 GPU 占用</div><div class="kpi-val">${busyGpus} / ${allGpus.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Slurm 运行中</div><div class="kpi-val" style="color:var(--accent)">${runningJobs}</div></div>
      <div class="kpi-card"><div class="kpi-label">Slurm 排队中</div><div class="kpi-val" style="color:var(--amber)">${pendingJobs}</div></div>
    `;
  }
  el.innerHTML = machines.map((m) => {
    const dotCls = m.reachable === true ? "dot-ok" : m.reachable === false ? "dot-down" : "dot-standby";
    const badgeHtml = m.reachable === true
      ? `<span class="pill pill-supported">在线</span>`
      : m.reachable === false
      ? `<span class="pill pill-failed">离线</span>`
      : `<span class="pill pill-inconclusive">待命</span>`;

    const jobsSorted = [...(m.jobs || [])].sort((a, b) => (a.state === "RUNNING" ? 0 : 1) - (b.state === "RUNNING" ? 0 : 1));
    return `
      <div class="host-card">
        <div class="host-head">
          <div class="host-title"><span class="dot ${dotCls}"></span>${esc(m.name)}</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="muted" style="font-size:11.5px">${esc(m.network || "")}</span>
            ${badgeHtml}
          </div>
        </div>
        <div class="host-meta">
          <span>${esc(m.gpu || "")}</span>
          ${m.threads ? `<span>线程 <strong>${m.threads}</strong> / 16384</span>` : ""}
        </div>
        ${m.error ? `<div style="font-size:12px;color:${m.reachable === false ? "var(--red)" : "var(--amber)"};word-break:break-word">${esc(m.error)}</div>` : ""}
        ${m.gpus?.length ? `
          <div class="gpu-list">
            ${m.gpus.map((g) => {
              const pct = g.mem_total ? Math.round((g.mem_used / g.mem_total) * 100) : 0;
              const cls = pct > 85 ? "full" : pct > 50 ? "high" : "";
              const utilColor = g.util >= 70 ? "var(--green)" : g.util >= 10 ? "var(--amber)" : "var(--muted)";
              return `<div class="gpu-row">
                <span>GPU ${esc(g.index)}</span>
                <div class="bar"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
                <span style="text-align:right">${(g.mem_used / 1024).toFixed(1)}/${Math.round(g.mem_total / 1024)}G</span>
                <span style="text-align:right;color:${utilColor};font-weight:600">${g.util}%</span>
                <span class="muted" style="text-align:right">${g.temp ? g.temp + "°C" : ""}</span>
              </div>`;
            }).join("")}
          </div>` : ""}
        ${jobsSorted.length ? `
          <div class="table-wrap">
            <table class="jobs-table">
              <thead><tr><th>Job</th><th>任务</th><th>状态</th><th>时长</th><th>节点 / 卡</th></tr></thead>
              <tbody>
                ${jobsSorted.map((j) => {
                  const gpuNum = (j.gres || "").replace(/^.*gpu:/, "");
                  const isRun = j.state === "RUNNING";
                  const nodeGpu = (j.node || "排队中") + (gpuNum ? ` · ${gpuNum}卡` : "");
                  return `<tr>
                    <td class="mono">${esc(j.id)}</td>
                    <td><strong>${esc(j.name)}</strong></td>
                    <td><span class="pill ${isRun ? "pill-supported" : "pill-inconclusive"}">${isRun ? "RUN" : "PEND"}</span></td>
                    <td class="mono">${esc(j.elapsed)}</td>
                    <td class="mono">${esc(nodeGpu)}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>` : (m.type === "slurm" && m.reachable ? `<div class="muted" style="font-size:12px">当前无运行/排队任务</div>` : "")}
        ${m.rules?.length ? `
          <details class="rules-details">
            <summary>使用规范 (${m.rules.length})</summary>
            <ul class="rules-list">${m.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
          </details>` : ""}
      </div>`;
  }).join("");
}

async function pollFleet() {
  if (!state.token) return;
  try {
    const res = await api("/v1/fleet");
    if (res.fleet) {
      state.fleet = res.fleet;
      renderFleet();
    }
  } catch {}
}

function openDrawer(title, html) {
  $("#drawer-title").textContent = title;
  $("#drawer-body").innerHTML = html;
  $("#drawer").classList.remove("hidden");
  $("#drawer-backdrop").classList.remove("hidden");
}

function closeDrawer() {
  $("#drawer").classList.add("hidden");
  $("#drawer-backdrop").classList.add("hidden");
}

function openItemDrawer(itemId) {
  const x = (state.doc.items || []).find((i) => i.id === itemId);
  if (!x) return;
  const linkedRuns = (x.run_dirs || []).map((rn) => state.runs.find((r) => r.project === x.project && r.run_name === rn)).filter(Boolean);
  const figs = linkedRuns.flatMap((r) => (r.figures || []).filter((f) => f.asset_key));

  openDrawer(x.title, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <span class="pill pill-${esc(x.kind)}">${esc(x.kind)}</span>
      <code>${esc(x.id)}</code>
      <span class="muted">${esc(x.project)} · ${esc(x.machine || "local")}</span>
      ${x.outcome ? `<span class="pill pill-${esc(x.outcome)}">${esc(x.outcome)}</span>` : ""}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="d-edit" class="ghost-btn">✏️ 编辑</button>
      ${x.notion_url ? `<a class="ghost-btn" style="text-decoration:none" target="_blank" href="${esc(x.notion_url)}">打开 Notion ↗</a>` : ""}
      <button id="d-delete" class="ghost-btn" style="margin-left:auto;color:var(--red)">删除</button>
    </div>
    ${x.hypothesis ? `<div><div class="section-label" style="padding:0">假设 / 目标</div><p style="margin:6px 0 0;line-height:1.5">${esc(x.hypothesis)}</p></div>` : ""}
    ${x.summary ? `<div><div class="section-label" style="padding:0">进展与结论</div><p style="margin:6px 0 0;line-height:1.55">${esc(x.summary)}</p></div>` : ""}
    ${Object.keys(x.metrics || {}).length ? `
      <div>
        <div class="section-label" style="padding:0 0 6px">关键指标</div>
        <div class="card-metrics">${Object.entries(x.metrics).map(([k, v]) => `<span class="metric-chip">${esc(k)} = ${esc(v)}</span>`).join("")}</div>
      </div>` : ""}
    ${linkedRuns.length ? `
      <div>
        <div class="section-label" style="padding:0 0 6px">关联运行快照</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${linkedRuns.map((r) => `<button class="ghost-btn open-run-link" data-proj="${esc(r.project)}" data-name="${esc(r.run_name)}">📂 ${esc(r.run_name)}</button>`).join("")}
        </div>
      </div>` : ""}
    ${figs.length ? `
      <div>
        <div class="section-label" style="padding:0 0 6px">已同步图表 (${figs.length})</div>
        <div class="fig-grid">${figs.slice(0, 8).map((f) => `
          <div class="fig-box" data-src="${assetUrl(f.asset_key)}" data-cap="${esc(f.rel)}">
            <img src="${assetUrl(f.asset_key)}" alt="${esc(f.name)}" />
            <div class="fig-name">${esc(f.name)}</div>
          </div>`).join("")}</div>
      </div>` : ""}
  `);

  $("#d-edit").onclick = () => { closeDrawer(); openModal(x); };
  $("#d-delete").onclick = async () => {
    if (!confirm(`确认删除 ${x.id}？`)) return;
    state.doc.items = (state.doc.items || []).filter((i) => i.id !== x.id);
    await saveStateCloud();
    closeDrawer();
    toast("已同步删除");
  };
  $("#drawer-body").querySelectorAll(".open-run-link").forEach((b) => {
    b.onclick = () => openRunDrawer(b.dataset.proj, b.dataset.name);
  });
  bindLightbox("#drawer-body");
}

function openRunDrawer(project, runName) {
  const r = state.runs.find((x) => x.project === project && x.run_name === runName);
  if (!r) return;
  const syncedFigs = (r.figures || []).filter((f) => f.asset_key);
  openDrawer(`${project} / ${runName}`, `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="muted">更新于 ${esc(r.updated_at)}</span>
      <button id="track-run-btn" class="primary-btn" style="font-size:12px">+ 加入看板追踪</button>
    </div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="figs">🖼️ 图表 (${syncedFigs.length}/${r.figures_count})</button>
      <button class="tab-btn" data-tab="logs">📄 日志摘要 (${r.logs?.length || 0})</button>
    </div>
    <div id="run-tab-content"></div>
  `);

  $("#track-run-btn").onclick = () => {
    closeDrawer();
    openModal({ id: r.short_id.slice(0, 24), project: r.project, kind: "experiment", title: r.short_id, status: "review", run_dirs: [r.run_name] });
  };

  const showTab = (tab) => {
    $("#drawer-body").querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    const box = $("#run-tab-content");
    if (tab === "figs") {
      box.innerHTML = syncedFigs.length
        ? `<div class="fig-grid">${syncedFigs.map((f) => `
            <div class="fig-box" data-src="${assetUrl(f.asset_key)}" data-cap="${esc(f.rel)}">
              <img src="${assetUrl(f.asset_key)}" alt="${esc(f.name)}" />
              <div class="fig-name">${esc(f.name)}</div>
            </div>`).join("")}</div>`
        : `<div class="muted">此运行暂无已上传的图表快照</div>`;
      bindLightbox("#run-tab-content");
    } else {
      const logs = r.logs || [];
      if (!logs.length) {
        box.innerHTML = `<div class="muted">无日志快照</div>`;
        return;
      }
      box.innerHTML = logs.slice(0, 6).map((l) => `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <code>${esc(l.name)}</code>
            <span class="muted">${l.exit_code !== null ? "exit " + l.exit_code : l.mtime}</span>
          </div>
          ${l.tail ? `<pre class="code-viewer">${esc(l.tail)}</pre>` : `<div class="muted" style="font-size:12px">${esc(l.command || l.purpose || "（未含尾部日志）")}</div>`}
        </div>
      `).join("");
    }
  };
  $("#drawer-body").querySelectorAll(".tab-btn").forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
  showTab(syncedFigs.length ? "figs" : "logs");
}

function bindLightbox(scope) {
  document.querySelectorAll(`${scope} .fig-box`).forEach((el) => {
    el.onclick = () => {
      $("#lightbox-img").src = el.dataset.src;
      $("#lightbox-cap").textContent = el.dataset.cap;
      $("#lightbox").classList.remove("hidden");
    };
  });
}

function openModal(item = null) {
  const f = $("#item-form");
  $("#modal-title").textContent = item?.id ? `编辑：${item.id}` : "新建研究记录";
  f.id.value = item?.id || "";
  f.project.value = item?.project || state.project || (state.config?.projects?.[0]?.id || "umi-transfer");
  f.kind.value = item?.kind || "experiment";
  f.status.value = item?.status || "running";
  f.outcome.value = item?.outcome || "";
  f.title.value = item?.title || "";
  f.hypothesis.value = item?.hypothesis || "";
  f.summary.value = item?.summary || "";
  f.machine.value = item?.machine || "";
  f.run_dirs.value = (item?.run_dirs || []).join(", ");
  f.metrics.value = Object.entries(item?.metrics || {}).map(([k, v]) => `${k}=${v}`).join("\n");
  $("#item-modal").classList.remove("hidden");
  $("#modal-backdrop").classList.remove("hidden");
}

function closeModal() {
  $("#item-modal").classList.add("hidden");
  $("#modal-backdrop").classList.add("hidden");
}

function init() {
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const errEl = $("#login-error");
    errEl.classList.add("hidden");
    const btn = $("#login-btn");
    btn.disabled = true;
    btn.textContent = "验证中...";
    try {
      const res = await api("/v1/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: $("#login-password").value }),
      });
      state.token = res.token;
      localStorage.setItem(TOKEN_KEY, res.token);
      showApp(true);
      await loadCloud();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "解锁进入";
    }
  };

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.onclick = () => {
      state.view = b.dataset.view;
      document.querySelectorAll(".nav-btn").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${state.view}`));
    };
  });

  $("#board-layout-toggle").querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      state.layout = b.dataset.layout;
      $("#board-layout-toggle").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      renderBoard();
    };
  });

  $("#search-input").oninput = (e) => { state.search = e.target.value; renderBoard(); renderRuns(); };
  $("#refresh-btn").onclick = () => loadCloud().then(() => toast("已从云端同步")).catch((e) => toast(e.message));
  $("#fleet-refresh-btn").onclick = () => pollFleet().then(() => toast("已刷新集群状态"));
  $("#new-item-btn").onclick = () => openModal(null);
  $("#logout-btn").onclick = () => logout(false);
  $("#drawer-close").onclick = closeDrawer;
  $("#drawer-backdrop").onclick = closeDrawer;
  $("#modal-close").onclick = closeModal;
  $("#modal-cancel").onclick = closeModal;
  $("#modal-backdrop").onclick = closeModal;
  $("#lightbox").onclick = () => $("#lightbox").classList.add("hidden");
  $("#theme-toggle").onclick = () => {
    const cur = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
  };

  $("#item-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id = fd.get("id").trim();
    const metrics = {};
    String(fd.get("metrics") || "").split("\n").forEach((line) => {
      const idx = line.indexOf("=");
      if (idx > 0) metrics[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    const run_dirs = String(fd.get("run_dirs") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const today = new Date().toISOString().slice(0, 10);
    const items = state.doc.items || [];
    const existing = items.find((x) => x.id === id);
    const payload = {
      id,
      project: fd.get("project"),
      kind: fd.get("kind"),
      status: fd.get("status"),
      outcome: fd.get("outcome"),
      title: fd.get("title").trim(),
      hypothesis: fd.get("hypothesis").trim(),
      summary: fd.get("summary").trim(),
      machine: fd.get("machine").trim(),
      run_dirs,
      metrics,
      created_at: existing?.created_at || today,
      updated_at: today,
      notion_url: existing?.notion_url || "",
    };
    if (existing) Object.assign(existing, payload);
    else items.unshift(payload);
    state.doc.items = items;
    await saveStateCloud();
    closeModal();
    toast("已保存到云端");
  };

  if (state.token) {
    showApp(true);
    loadCloud().catch(() => showApp(false));
  } else {
    showApp(false);
  }
  setInterval(() => {
    if (document.visibilityState === "visible") pollFleet();
  }, 30000);
}

init();
