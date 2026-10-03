const STORAGE_KEY = "project-notes.projects.v1";
const $ = (selector) => document.querySelector(selector);
const state = { projects: loadProjects(), filter: "open" };

const statusLabels = { saved: "待判断", followup: "待联系", paused: "已搁置", done: "已完成" };
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" });

function loadProjects() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
  render();
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function humanDate(value) {
  if (!value) return "未提及";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}
function isDue(project) { return project.deadline && project.deadline <= todayISO(); }
function priorityScore(project) {
  let score = project.status === "followup" ? 100 : project.status === "saved" ? 55 : 0;
  if (project.deadline) {
    const days = Math.round((new Date(`${project.deadline}T12:00:00`) - new Date(`${todayISO()}T12:00:00`)) / 86400000);
    if (days <= 0) score += 50;
    else if (days <= 2) score += 25;
  }
  if (project.budget && project.budget !== "未提及") score += 8;
  return score;
}
function sortProjects(projects) { return [...projects].sort((a, b) => priorityScore(b) - priorityScore(a) || b.createdAt.localeCompare(a.createdAt)); }

function parseMessage(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const budgetMatch = normalized.match(/(?:预算|报价|费用|酬劳|报酬|薪资|¥|￥|人民币|rmb|元)[：:\s]*([¥￥]?\s?[\d,.]+(?:\s*(?:-|到|至|~|～)\s*[¥￥]?\s?[\d,.]+)?\s*(?:元|w|万|k|rmb|人民币)?)/i)
    || normalized.match(/([¥￥]\s?[\d,.]+(?:\s*(?:-|到|至|~|～)\s*[¥￥]?\s?[\d,.]+)?(?:\s*(?:元|w|万|k))?)/i);
  const contactMatch = normalized.match(/(?:联系(?:方式|人)?|微信|vx|v信|电话|邮箱|email)[：:\s]*([A-Za-z0-9_\-+@.]{3,})/i);
  const deliverableMatch = normalized.match(/(?:需要|招|找|做|制作|设计|交付)(.{0,42}(?:页面|海报|视觉|logo|品牌|小程序|网站|UI|插画|详情页|视频|PPT|物料|方案|banner|包装|KV|H5))/i);
  const titleMatch = normalized.match(/(?:急招|急找|招聘|招募|寻找|找)(?:一位|个|名)?\s*([^，。；;！!]{2,24}(?:设计师|插画师|设计|视觉|UI|美术))/i);
  const deadline = parseDeadline(normalized);
  return {
    title: titleMatch?.[1] ? `${titleMatch[1]}项目` : (deliverableMatch?.[1] || normalized.slice(0, 26) || "未命名项目").replace(/[，。；;].*$/, ""),
    budget: budgetMatch?.[1]?.replace(/\s+/g, "") || "未提及",
    deadline,
    deliverables: deliverableMatch?.[1]?.trim() || "未提及",
    contact: contactMatch?.[1] || "未提及"
  };
}

function parseDeadline(text) {
  const explicit = text.match(/(20\d{2})[./年-](\d{1,2})[./月-](\d{1,2})/);
  if (explicit) return `${explicit[1]}-${explicit[2].padStart(2, "0")}-${explicit[3].padStart(2, "0")}`;
  const relative = text.match(/(明天|后天|本周[一二三四五六日天]|下周[一二三四五六日天])/);
  if (!relative) return "";
  const now = new Date(`${todayISO()}T12:00:00`);
  const word = relative[1];
  if (word === "明天") now.setDate(now.getDate() + 1);
  else if (word === "后天") now.setDate(now.getDate() + 2);
  else {
    const target = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[word.at(-1)];
    const weekday = now.getDay() || 7;
    now.setDate(now.getDate() + target - weekday + (word.startsWith("下") ? 7 : 0));
  }
  return now.toISOString().slice(0, 10);
}

function projectCard(project) {
  const deadline = project.deadline ? `<span class="${isDue(project) ? "deadline-overdue" : ""}">${isDue(project) ? "截止 " : ""}${humanDate(project.deadline)}</span>` : "";
  return `<article class="project-card"><button type="button" data-project-id="${project.id}">
    <div class="card-topline"><span class="source-label">${escapeHtml(project.sourceGroup || "手动收集")}</span><span class="status-tag ${project.status}">${statusLabels[project.status]}</span></div>
    <h3>${escapeHtml(project.title)}</h3>
    <div class="card-details">${project.budget !== "未提及" ? `<span>${escapeHtml(project.budget)}</span>` : ""}${deadline}${project.contact !== "未提及" ? `<span>${escapeHtml(project.contact)}</span>` : ""}</div>
  </button></article>`;
}

function renderList(element, empty, projects) {
  element.innerHTML = projects.map(projectCard).join("");
  empty.classList.toggle("is-hidden", projects.length > 0);
}

function render() {
  const active = state.projects.filter((project) => ["followup", "saved"].includes(project.status));
  const todayProjects = sortProjects(active).filter((project) => project.status === "followup" || isDue(project)).slice(0, 8);
  $("#priorityCount").textContent = todayProjects.length;
  $("#todayCount").textContent = todayProjects.length ? `${todayProjects.length} 个` : "";
  $("#summaryCopy").textContent = todayProjects.length ? "优先处理截止临近、预算明确或已经决定联系的项目。" : "把群里的项目转发或粘贴到这里，线索只保存在这台设备。";
  renderList($("#todayList"), $("#todayEmpty"), todayProjects);
  const filtered = state.projects.filter((project) => {
    if (state.filter === "all") return true;
    if (state.filter === "open") return ["followup", "saved"].includes(project.status);
    return project.status === state.filter;
  });
  renderList($("#pipelineList"), $("#pipelineEmpty"), sortProjects(filtered));
}

function switchView(view) {
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((element) => element.classList.add("is-hidden"));
  $(`#${view}View`).classList.remove("is-hidden");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function openProject(id) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  $("#dialogContent").innerHTML = `<div class="dialog-header"><div><p class="eyebrow">${escapeHtml(statusLabels[project.status])}</p><h2>${escapeHtml(project.title)}</h2></div><button class="icon-button" data-close-dialog aria-label="关闭详情">×</button></div>
    <p class="detail-source">${escapeHtml(project.sourceGroup || "手动收集")} · 收集于 ${humanDate(project.capturedAt)}</p>
    <div class="detail-grid"><div class="detail-item"><span>预算</span><strong>${escapeHtml(project.budget)}</strong></div><div class="detail-item"><span>截止时间</span><strong>${humanDate(project.deadline)}</strong></div><div class="detail-item"><span>交付物</span><strong>${escapeHtml(project.deliverables)}</strong></div><div class="detail-item"><span>联系人</span><strong>${escapeHtml(project.contact)}</strong></div></div>
    <p class="raw-message">${escapeHtml(project.sourceText)}</p>
    <div class="action-grid"><button data-action="followup" data-id="${project.id}">标记待联系</button><button data-action="saved" data-id="${project.id}">留待判断</button><button data-action="paused" data-id="${project.id}">暂不跟进</button><button class="complete" data-action="done" data-id="${project.id}">标记完成</button><button class="delete" data-action="delete" data-id="${project.id}">删除项目</button></div>`;
  $("#projectDialog").showModal();
}

function setStatus(id, status) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  if (status === "delete") {
    state.projects = state.projects.filter((item) => item.id !== id);
    $("#projectDialog").close();
    showToast("项目已删除");
  } else {
    project.status = status;
    $("#projectDialog").close();
    showToast(`已更新为${statusLabels[status]}`);
  }
  persist();
}

function exportProjects() {
  const data = new Blob([JSON.stringify(state.projects, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(data);
  link.download = `project-notes-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function initialize() {
  $("#todayLabel").dateTime = todayISO();
  $("#todayLabel").textContent = dateFormatter.format(new Date(`${todayISO()}T12:00:00`));
  $("#capturedAt").value = todayISO();
  render();
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.querySelectorAll("[data-go-capture]").forEach((button) => button.addEventListener("click", () => switchView("capture")));
  document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("is-selected", chip === button));
    render();
  }));
  $("#parseButton").addEventListener("click", () => {
    const text = $("#sourceText").value.trim();
    if (!text) return showToast("先粘贴一条项目消息");
    const parsed = parseMessage(text);
    $("#projectTitle").value = parsed.title;
    $("#budget").value = parsed.budget;
    $("#deadline").value = parsed.deadline;
    $("#deliverables").value = parsed.deliverables;
    $("#contact").value = parsed.contact;
    $("#parsedCard").classList.remove("is-hidden");
  });
  $("#captureForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!form.get("sourceText").trim()) return showToast("项目原文不能为空");
    const project = {
      id: crypto.randomUUID(), sourceText: form.get("sourceText").trim(), sourceGroup: form.get("sourceGroup").trim(),
      capturedAt: form.get("capturedAt") || todayISO(), title: form.get("projectTitle").trim() || "未命名项目",
      budget: form.get("budget").trim() || "未提及", deadline: form.get("deadline"), deliverables: form.get("deliverables").trim() || "未提及",
      contact: form.get("contact").trim() || "未提及", status: form.get("projectStatus"), createdAt: new Date().toISOString()
    };
    state.projects.unshift(project);
    event.currentTarget.reset();
    $("#capturedAt").value = todayISO();
    $("#parsedCard").classList.add("is-hidden");
    persist();
    switchView("today");
    showToast("项目已保存");
  });
  document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-project-id]");
    if (card) openProject(card.dataset.projectId);
    const action = event.target.closest("[data-action]");
    if (action) setStatus(action.dataset.id, action.dataset.action);
    if (event.target.closest("[data-close-dialog]")) $("#projectDialog").close();
  });
  $("#settingsButton").addEventListener("click", () => $("#settingsDialog").showModal());
  $("#exportButton").addEventListener("click", exportProjects);
  $("#clearButton").addEventListener("click", () => {
    if (!state.projects.length || !window.confirm("确定清空当前浏览器内的全部项目吗？")) return;
    state.projects = [];
    $("#settingsDialog").close();
    persist();
    showToast("已清空本机项目");
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => undefined);
}

initialize();
