const STORAGE_KEY = "project-notes.projects.v1";
const PROFILE_KEY = "project-notes.preferences.v1";
const $ = (selector) => document.querySelector(selector);
const A = ProjectAnalysis;
const statusLabels = { saved: "待判断", followup: "待投递", contacted: "已联系", progress: "进行中", paused: "不跟进", done: "已完成" };
const state = { projects: [], preferences: { ...A.defaults }, filter: "open", loaded: true, deleted: null, draft: null };
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  if (!Array.isArray(stored)) throw new Error("Invalid storage");
  state.projects = stored.map(project => {
    const parsed = A.parse(project.sourceText || "", project.capturedAt || A.today());
    const result = { ...project };
    // Fill missing facts for existing records, keeping decisions and personal notes.
    for (const field of ["budget", "contact", "deliverables", "deadline"]) {
      if (!result[field] || result[field] === "未提及") result[field] = parsed[field];
    }
    if (!result.title || /^Freelancer[- ]?Art$/i.test(result.title)) result.title = parsed.title;
    return result;
  });
  state.preferences = { ...A.defaults, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") };
} catch { state.loaded = false; }

function escapeHtml(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const e = escapeHtml;
const stars = score => score == null ? "暂不评分" : "★".repeat(score) + "☆".repeat(5 - score);
const humanDate = value => value || "未提及";
const evaluation = project => A.assess(project.sourceText, project, state.preferences);

function saveProjects(next) {
  if (!state.loaded) { showToast("本机数据读取失败，请先导出备份，避免覆盖"); return false; }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state.projects = next;
    render();
    return true;
  } catch { showToast("保存失败，存储空间或浏览器权限不足"); return false; }
}

function showToast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $("#toast").classList.remove("is-visible"), 3500);
}

function assessmentHTML(result) {
  return `<div class="verdict"><div><p class="eyebrow">系统初步建议</p><h3>${e(result.recommendation)}</h3></div><strong class="score-stars">${stars(result.score)}</strong></div>
    <p class="assessment-basis">按当前接单偏好判断 · 本机规则分析，未经雇主核实</p>
    <dl class="assessment-details"><dt>为什么</dt><dd>${result.reasons.map(r => `<p>${e(r.text)}<small>依据：${e(r.evidence)}</small></p>`).join("")}</dd>
    ${result.risks.length ? `<dt>需要注意</dt><dd>${result.risks.map(r => `<p>${e(r)}</p>`).join("")}</dd>` : ""}
    <dt>下一步</dt><dd>${e(result.action)}</dd><dt>联系前确认</dt><dd><ul>${result.questions.map(q => `<li>${e(q)}</li>`).join("")}</ul></dd></dl>`;
}

function card(project) {
  const result = evaluation(project);
  return `<article class="project-card">
    <button type="button" data-project-id="${e(project.id)}">
      <div class="card-topline"><span class="source-label">${e(project.sourceGroup || "手动收集")}</span><span class="status-tag">${e(statusLabels[project.status] || "待判断")}</span></div>
      <h3>${e(project.title)}</h3>
      <div class="card-details"><span class="card-score">${stars(result.score)} · ${e(result.recommendation)}</span><span>${e(project.budget)}</span><span>${e(project.deadline)}</span></div>
      <p class="card-reason">${e(result.risks[0] || result.summary)}</p>
    </button>
    <div class="card-actions"><button type="button" data-copy-id="${e(project.id)}" ${A.known(project.contact) ? "" : "disabled"}>复制联系人</button><button type="button" class="delete" data-delete-id="${e(project.id)}">删除项目</button></div>
  </article>`;
}

function render() {
  const active = state.projects.filter(p => !["paused", "done"].includes(p.status));
  const eligible = active.filter(p => {
    const r = evaluation(p);
    return r.suggestedStatus !== "paused" && (!p.deadline || p.deadline >= A.today()) &&
      (r.score >= 4 || p.status === "followup" || p.status === "progress");
  }).sort((a, b) => (evaluation(b).score || 0) - (evaluation(a).score || 0)).slice(0, 8);
  $("#priorityCount").textContent = eligible.length;
  $("#todayCount").textContent = `${eligible.length} 个`;
  $("#summaryCopy").textContent = "优先看方向匹配、没有明显时间冲突的机会；建议不代表已确认收入。";
  $("#todayList").innerHTML = eligible.map(card).join("");
  $("#todayEmpty").classList.toggle("is-hidden", !!eligible.length);
  const projects = state.projects.filter(p => state.filter === "all" || (state.filter === "open" ? !["paused", "done"].includes(p.status) : p.status === state.filter));
  $("#pipelineList").innerHTML = projects.map(card).join("");
  $("#pipelineEmpty").classList.toggle("is-hidden", !!projects.length);
  $("#undoBanner").classList.toggle("is-hidden", !state.deleted);
}

function switchView(view) {
  document.querySelectorAll(".tab").forEach(button => button.classList.toggle("is-active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("is-hidden", el.id !== `${view}View`));
}

function openProject(id) {
  const p = state.projects.find(item => item.id === id);
  if (!p) return;
  $("#dialogContent").innerHTML = `<div class="dialog-header"><div><p class="eyebrow">${e(statusLabels[p.status])}</p><h2>${e(p.title)}</h2></div><button class="icon-button" data-close-dialog aria-label="关闭详情">×</button></div>
    <p class="detail-source">${e(p.sourceGroup || "手动收集")} · 收集于 ${e(humanDate(p.capturedAt))}</p>
    <div class="contact-row"><div><span>联系人</span><strong>${e(p.contact)}</strong></div><button class="outline-button" data-copy-id="${e(p.id)}" ${A.known(p.contact) ? "" : "disabled"}>一键复制</button></div>
    <button class="danger-button detail-delete" data-delete-id="${e(p.id)}">删除项目</button>
    <section class="assessment-card">${assessmentHTML(evaluation(p))}</section>
    <div class="detail-grid">${[["预算", p.budget], ["截止时间", humanDate(p.deadline)], ["交付物", p.deliverables]].map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${e(value)}</strong></div>`).join("")}</div>
    <label class="field"><span>我的备注（不影响系统建议）</span><textarea id="detailNote" rows="3">${e(p.assessmentNote || "")}</textarea></label>
    <button class="outline-button" data-save-note="${e(p.id)}">保存备注</button>
    <div class="action-grid">${Object.entries(statusLabels).map(([status, label]) => `<button data-action="${status}" data-id="${e(p.id)}" ${status === p.status ? 'aria-pressed="true"' : ""}>${label}</button>`).join("")}</div>
    <details><summary>查看消息原文</summary><p class="raw-message">${e(p.sourceText)}</p></details>`;
  if (!$("#projectDialog").open) $("#projectDialog").showModal();
}

async function copyContact(text) {
  if (!A.known(text)) return showToast("暂无可复制的联系人");
  try {
    await navigator.clipboard.writeText(text);
    showToast("联系人已复制");
  } catch {
    // Older iOS / denied clipboard permission: try selection-based copy in the active dialog.
    const field = document.createElement("textarea");
    field.value = text; field.readOnly = true; field.setAttribute("aria-label", "待复制联系人");
    field.style.cssText = "position:fixed;top:0;left:0;opacity:.01;width:1px;height:1px";
    (document.querySelector("dialog[open]") || document.body).append(field);
    field.focus(); field.select(); field.setSelectionRange(0, text.length);
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { /* show fallback below */ }
    field.remove();
    if (copied) showToast("联系人已复制");
    else {
      $("#manualCopyValue").value = text;
      $("#copyDialog").showModal();
      $("#manualCopyValue").focus(); $("#manualCopyValue").select();
    }
  }
}

function deleteProject(id) {
  const index = state.projects.findIndex(p => p.id === id);
  if (index < 0) return;
  const project = state.projects[index];
  if (saveProjects(state.projects.filter(p => p.id !== id))) {
    state.deleted = { project, index };
    $("#projectDialog").close();
    render();
    showToast("项目已删除，可在顶部撤销");
  }
}

function parseDraft() {
  const text = $("#sourceText").value.trim();
  if (!text) return showToast("先粘贴一条项目消息");
  const parsed = A.parse(text, $("#capturedAt").value || A.today());
  const result = A.assess(text, parsed, state.preferences);
  $("#projectTitle").value = parsed.title;
  for (const key of ["budget", "deadline", "deliverables", "contact"]) $(`#${key}`).value = parsed[key];
  $("#assessmentCopy").innerHTML = assessmentHTML(result);
  $("#projectStatus").value = result.suggestedStatus;
  state.draft = text;
  $("#parsedCard").classList.remove("is-hidden");
  $("#assessmentCopy").scrollIntoView({ behavior: "smooth", block: "start" });
}

function initialize() {
  $("#todayLabel").textContent = A.today();
  $("#capturedAt").value = A.today();
  render();
  if (!state.loaded) showToast("本机数据无法读取，已停止写入，请先导出备份");
  document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.querySelectorAll("[data-go-capture]").forEach(button => button.addEventListener("click", () => switchView("capture")));
  document.querySelectorAll(".filter-chip").forEach(button => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach(chip => chip.classList.toggle("is-selected", chip === button));
    render();
  }));
  $("#parseButton").addEventListener("click", parseDraft);
  for (const key of ["sourceText", "capturedAt"]) $(`#${key}`).addEventListener("input", () => {
    state.draft = null; $("#parsedCard").classList.add("is-hidden");
  });
  $("#parsedCard").addEventListener("input", () => {
    const fields = Object.fromEntries(new FormData($("#captureForm")));
    $("#assessmentCopy").innerHTML = assessmentHTML(A.assess(fields.sourceText, fields, state.preferences));
  });
  $("#captureForm").addEventListener("submit", event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (!state.draft || state.draft !== fields.sourceText.trim()) return showToast("请先解析并评估更新后的原文");
    const project = { ...fields, title: fields.projectTitle.trim() || "待确认项目", status: fields.projectStatus,
      sourceText: fields.sourceText.trim(), id: crypto.randomUUID(), createdAt: new Date().toISOString(), analysisVersion: 2 };
    delete project.projectTitle; delete project.projectStatus;
    if (!saveProjects([project, ...state.projects])) return;
    event.currentTarget.reset(); $("#capturedAt").value = A.today(); state.draft = null;
    $("#parsedCard").classList.add("is-hidden"); switchView("pipeline"); showToast("已保存项目与系统建议");
  });
  document.addEventListener("click", event => {
    const cardButton = event.target.closest("[data-project-id]");
    if (cardButton) openProject(cardButton.dataset.projectId);
    const copy = event.target.closest("[data-copy-id]");
    if (copy) copyContact(state.projects.find(p => p.id === copy.dataset.copyId)?.contact);
    if (event.target.closest("#copyDraftContact")) copyContact($("#contact").value);
    const deletion = event.target.closest("[data-delete-id]");
    if (deletion) deleteProject(deletion.dataset.deleteId);
    const action = event.target.closest("[data-action]");
    if (action && saveProjects(state.projects.map(p => p.id === action.dataset.id ? { ...p, status: action.dataset.action } : p))) {
      $("#projectDialog").close(); showToast("跟进状态已更新");
    }
    const note = event.target.closest("[data-save-note]");
    if (note && saveProjects(state.projects.map(p => p.id === note.dataset.saveNote ? { ...p, assessmentNote: $("#detailNote").value } : p))) showToast("备注已保存");
    if (event.target.closest("[data-close-dialog]")) $("#projectDialog").close();
  });
  $("#undoButton").addEventListener("click", () => {
    if (!state.deleted) return;
    const next = [...state.projects];
    next.splice(state.deleted.index, 0, state.deleted.project);
    if (saveProjects(next)) { state.deleted = null; render(); showToast("已恢复项目"); }
  });
  $("#settingsButton").addEventListener("click", () => {
    $("#focusPreference").value = state.preferences.focus;
    $("#daytimePreference").checked = state.preferences.protectDaytime;
    $("#aiPreference").checked = state.preferences.avoidAI;
    $("#busyPreference").value = state.preferences.busyMonth;
    $("#settingsDialog").showModal();
  });
  $("#savePreferences").addEventListener("click", () => {
    const next = { focus: $("#focusPreference").value, protectDaytime: $("#daytimePreference").checked, avoidAI: $("#aiPreference").checked, busyMonth: $("#busyPreference").value };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); }
    catch { return showToast("偏好保存失败"); }
    state.preferences = next; render(); $("#settingsDialog").close();
    if (state.draft) {
      const fields = Object.fromEntries(new FormData($("#captureForm")));
      $("#assessmentCopy").innerHTML = assessmentHTML(A.assess(fields.sourceText, fields, next));
    }
    showToast("偏好已更新，已有项目已重新评估");
  });
  $("#exportButton").addEventListener("click", () => {
    const data = state.loaded ? JSON.stringify(state.projects, null, 2) : localStorage.getItem(STORAGE_KEY);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([data || "[]"], { type: "application/json" }));
    link.download = `project-notes-${A.today()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $("#clearButton").addEventListener("click", () => {
    if (!window.confirm("确定清空全部项目吗？此操作不能撤销。")) return;
    if (saveProjects([])) { state.deleted = null; render(); $("#settingsDialog").close(); }
  });
  $("#reloadButton").addEventListener("click", () => {
    if (state.draft || $("#sourceText").value) {
      if (!window.confirm("刷新会丢弃尚未保存的录入，已保存项目不受影响。继续吗？")) return;
    }
    location.reload();
  });
  if ("serviceWorker" in navigator) {
    const previouslyControlled = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (previouslyControlled) $("#updateBanner").classList.remove("is-hidden");
    });
    navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" }).then(registration => {
      $("#checkUpdate").addEventListener("click", async () => {
        try { await registration.update(); showToast("已检查更新，如有新版会在顶部提示"); }
        catch { showToast("更新检查失败，请检查网络"); }
      });
    }).catch(() => showToast("离线缓存未启用，当前可在线使用"));
  }
}
initialize();
