const state = { cases: [], selected: null, status: "", query: "", index: -1, requestVersion: 0, current: null };
const $ = (selector) => document.querySelector(selector);
const esc = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const date = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const statusClass = value => value.toLowerCase();

async function api(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

async function init() {
  const [summary, cases] = await Promise.all([api("/api/summary"), api("/api/cases")]);
  $("#metricTotal").textContent = summary.total;
  $("#metricIncomplete").textContent = summary.counts.INCOMPLETE;
  $("#metricEvidence").innerHTML = `<span class="light-only">${summary.evidenceFiles}</span><span class="dark-only">${summary.extractedFiles}/${summary.evidenceFiles}</span>`;
  $("#metricObservations").textContent = summary.observations.toLocaleString();
  state.cases = cases;
  renderCases();
  bind();
  $("#snapshotState").innerHTML = "Snapshot<br>loaded";
  if (cases.length) await selectCase(cases[0].caseId);
}

function bind() {
  $("#caseSearch").addEventListener("input", event => {
    state.query = event.target.value;
    renderCases();
    reconcileSelection();
  });
  $("#statusFilters").addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    state.status = button.dataset.status;
    document.querySelectorAll("#statusFilters button").forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderCases();
    reconcileSelection();
  });
  $("#themeButton").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("ghosttrace-theme", dark ? "light" : "dark"); } catch { /* Storage may be unavailable in private browsing. */ }
    $("#themeButton").setAttribute("aria-pressed", String(!dark));
    if ($("#evidenceDialog").open) $("#evidenceDialog").close();
  });
  $("#themeButton").setAttribute("aria-pressed", String(document.documentElement.dataset.theme === "dark"));
  $("#exportDossier").addEventListener("click", exportDossier);
  $("#refreshCase").addEventListener("click", () => { if (state.selected) selectCase(state.selected); });
  $("#closeEvidence").addEventListener("click", () => $("#evidenceDialog").close());
  document.addEventListener("click", event => {
    const link = event.target.closest("[data-evidence]");
    if (link) openEvidence(link.dataset.evidence);
  });
  document.addEventListener("keydown", event => {
    if ($("#evidenceDialog").open) return;
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); $("#caseSearch").focus(); }
    if (["j", "k"].includes(event.key) && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      const visible = filteredCases(); if (!visible.length) return;
      event.preventDefault(); state.index = Math.max(0, Math.min(visible.length - 1, state.index + (event.key === "j" ? 1 : -1)));
      selectCase(visible[state.index].caseId);
    }
  });
}

function filteredCases() {
  const needle = state.query.toLowerCase().trim();
  return state.cases.filter(item => (!state.status || item.status === state.status) && (!needle || `${item.caseId} ${item.email} ${item.userId}`.toLowerCase().includes(needle)));
}

function renderCases() {
  const cases = filteredCases(); $("#caseCount").textContent = cases.length;
  $("#caseList").innerHTML = cases.map((item, index) => `
    <button class="case-card ${statusClass(item.status)} ${item.caseId === state.selected ? "active" : ""}" data-id="${esc(item.caseId)}" aria-current="${item.caseId === state.selected ? "true" : "false"}">
      <span class="case-line"><span class="case-id">${esc(item.caseId)}</span><span class="status-dot ${statusClass(item.status)}"></span></span>
      <span class="case-email">${esc(item.email)}</span>
      <span class="case-meta"><span>${item.stepCount} steps</span><span class="light-only">${Math.round(item.confidence * 100)}% grounded</span><span class="dark-only resource-count">${item.resourceCount} ${item.resourceCount === 1 ? "resource" : "resources"} assessed</span></span>
    </button>`).join("") || `<p class="muted-placeholder">No cases match this view.</p>`;
  document.querySelectorAll(".case-card").forEach((button, index) => button.addEventListener("click", () => { state.index = index; selectCase(button.dataset.id); }));
}

function reconcileSelection() {
  const visible = filteredCases();
  if (visible.length && !visible.some(item => item.caseId === state.selected)) {
    state.index = 0;
    selectCase(visible[0].caseId);
  }
}

async function selectCase(caseId) {
  const version = ++state.requestVersion;
  state.selected = caseId; renderCases();
  state.index = filteredCases().findIndex(item => item.caseId === caseId);
  $("#exportDossier").disabled = true;
  $(".workspace").setAttribute("aria-busy", "true");
  let data;
  try { data = await api(`/api/cases/${caseId}`); }
  catch (error) {
    if (version === state.requestVersion) {
      $(".workspace").setAttribute("aria-busy", "false");
      $("#actionStatus").textContent = error.message;
      $("#inspectorStatus").textContent = "Unable to load case · refresh to retry";
    }
    return;
  }
  if (version !== state.requestVersion) return;
  state.current = data;
  renderCase(data);
  $("#exportDossier").disabled = false;
  $(".workspace").setAttribute("aria-busy", "false");
  document.querySelector(`.case-card[data-id="${caseId}"]`)?.scrollIntoView({ block: "nearest" });
}

function renderCase(data) {
  const { case: item, decision, observations } = data;
  $("#caseEyebrow").innerHTML = `${esc(item.caseId)} · <span>${esc(decision.userId || "unresolved subject")}</span>`;
  $("#caseDarkSubtitle").innerHTML = `Workflow claimed <b class="claim ${statusClass(item.reportedStatus)}">${esc(item.reportedStatus)}</b> · Audit cutoff ${esc(date(item.auditAt))} ·<br>Participant evidence; discovered and activity-linked resource inventory`;
  $("#caseTitle").textContent = item.email;
  $("#caseSubtitle").textContent = `State reconstructed at ${date(item.auditAt)} from cutoff-eligible evidence.`;
  $("#verdictWrap").hidden = false; $("#verdict").textContent = decision.status;
  $("#verdict").className = `verdict ${statusClass(decision.status)}`;
  const details = [
    ["Audit cutoff", date(item.auditAt)], ["Reported state", item.reportedStatus],
    ["Resolved subject", decision.userId || "Unresolved"], ["Confidence", `${Math.round(decision.confidence * 100)}%`],
  ];
  $("#caseDetails").innerHTML = details.map(([key, value]) => `<div><dt>${key === "Reported state" ? '<span class="light-only">Reported state</span><span class="dark-only">Workflow claim</span>' : esc(key)}</dt><dd title="${esc(value)}">${esc(value)}</dd></div>`).join("");
  const resources = resourceInventory(data);
  $("#caseDetails").className = `detail-list workflow-${statusClass(item.reportedStatus)}`;
  $("#caseDetails").insertAdjacentHTML("beforeend", `<div class="dark-only"><dt>Coverage</dt><dd>${resources.filter(resource => resource.observation).length}/${resources.length} resources observed</dd></div>`);
  $("#requestText").textContent = item.requestText;
  $("#inspectorStatus").textContent = `GhostTrace · ${item.caseId} loaded`;
  renderProof(data, resources);
  renderSteps(decision.steps, decision.status); renderEvidence(observations); renderGraph(decision, observations); renderDarkGraph(data, resources);
  $("#warningsSection").hidden = !decision.warnings.length;
  $("#warningList").innerHTML = decision.warnings.map(value => `<div class="warning-card">${esc(value)}</div>`).join("");
}

function renderSteps(steps, status) {
  $("#stepCount").textContent = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  $("#steps").innerHTML = steps.length ? steps.map(step => `
    <article class="step"><span class="step-no">${String(step.step_no).padStart(2, "0")}</span>
      <span class="phase ${step.phase.toLowerCase()}">${esc(step.phase)}</span>
      <span class="step-main"><strong>${esc(step.operation.replaceAll("_", " "))}</strong><span>${esc(step.system_id)} / ${esc(step.resource_id)} → ${esc(step.state)}</span></span>
      <span class="evidence-chip">${esc(step.evidence_id || "future check")}</span>
    </article>`).join("") : `<p class="muted-placeholder light-only">No actions are authorized for this request.</p><p class="muted-placeholder dark-only">${status === "NOT_APPLICABLE" ? "This request does not authorize deletion." : "No evidence-grounded steps are available. Review the uncertainty ledger."}</p>`;
}

function renderEvidence(observations) {
  const unique = [...new Map(observations.map(item => [
    `${item.systemId}/${item.resourceId}/${item.state}/${item.observedAt}/${item.evidenceId}`, item,
  ])).values()];
  $("#observationCount").textContent = unique.length; $("#evidenceList").innerHTML = unique.length ? unique.slice(-24).reverse().map(item => `
    <article class="evidence-row"><header><strong>${esc(item.resourceId)}</strong><span class="state ${statusClass(item.state)}">${esc(item.state)}</span></header>
      <p>${esc(item.systemId)} · ${esc(item.category)}</p><small class="light-only">${esc(item.evidenceId)} · ${date(item.observedAt)}</small><div class="dark-only evidence-bottom"><button class="evidence-link" data-evidence="${esc(item.evidenceId)}">${esc(item.evidenceId)} ↗</button><time datetime="${esc(item.observedAt)}">${esc(date(item.observedAt))}</time></div></article>`).join("") : `<p class="muted-placeholder">No cutoff-eligible observations.</p>`;
}

function renderGraph(decision, observations) {
  const latest = [...new Map(observations.map(item => [`${item.systemId}/${item.resourceId}`, item])).values()].slice(-11);
  if (!latest.length) { $("#graphStage").innerHTML = `<div class="empty-state"><span class="empty-orbit"></span><strong>No grounded resources</strong><p>Review the uncertainty ledger.</p></div>`; return; }
  const width = 820, height = 310, cx = width / 2, cy = height / 2, radius = 112;
  const points = latest.map((item, index) => ({ item, x: cx + Math.cos((index / latest.length) * Math.PI * 2 - Math.PI / 2) * (radius + (index % 2) * 34), y: cy + Math.sin((index / latest.length) * Math.PI * 2 - Math.PI / 2) * (radius + (index % 2) * 34) }));
  const safe = new Set(["ABSENT", "REDACTED", "ANONYMIZED", "DISABLED", "BLOCKED"]);
  $("#graphStage").innerHTML = `<svg class="graph-svg light-only" viewBox="0 0 ${width} ${height}" role="img" aria-label="Identity to evidence graph">
    ${points.map(p => `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" />`).join("")}
    <g class="node subject"><circle cx="${cx}" cy="${cy}" r="42"/><text x="${cx}" y="${cy - 2}">${esc(decision.userId || "subject")}</text><text class="sub" x="${cx}" y="${cy + 13}">${esc(decision.status)}</text></g>
    ${points.map(p => `<g class="node ${safe.has(p.item.state) ? "safe" : "risk"}"><circle cx="${p.x}" cy="${p.y}" r="30"/><text x="${p.x}" y="${p.y - 2}">${esc(p.item.resourceId)}</text><text class="sub" x="${p.x}" y="${p.y + 12}">${esc(p.item.state)}</text></g>`).join("")}
  </svg>`;
}

// The presentation inventory uses only the API's cutoff-eligible observations
// and the engine's existing plan. Missing state remains explicitly unobserved.
function resourceInventory(data) {
  const resources = new Map();
  for (const observation of data.observations) {
    const key = `${observation.systemId}/${observation.resourceId}`;
    const current = resources.get(key)?.observation;
    const newer = !current || observation.observedAt > current.observedAt ||
      (observation.observedAt === current.observedAt && (observation.confidence > current.confidence ||
        (observation.confidence === current.confidence && observation.evidenceId > current.evidenceId)));
    if (newer) {
      resources.set(key, { systemId: observation.systemId, resourceId: observation.resourceId, observation });
    }
  }
  for (const step of data.decision.steps) {
    const key = `${step.system_id}/${step.resource_id}`;
    if (!resources.has(key)) resources.set(key, { systemId: step.system_id, resourceId: step.resource_id });
  }
  return [...resources.values()].map(resource => {
    const steps = data.decision.steps.filter(step => step.system_id === resource.systemId && step.resource_id === resource.resourceId);
    const finding = steps.find(step => step.phase === "FINDING");
    const observation = resource.observation;
    const compliance = data.decision.status === "NOT_APPLICABLE" ? "na"
      : finding ? "risk" : observation?.policyTarget
        ? (observation.state === observation.policyTarget ? "safe" : "risk") : "unknown";
    return { ...resource, finding, compliance };
  });
}

function renderProof(data, resources) {
  const violations = resources.filter(resource => resource.compliance === "risk").length;
  const assessed = resources.filter(resource => resource.observation?.policyTarget).length;
  $("#proofCoverage").textContent = `${assessed}/${resources.length} assessed · ${violations} violations`;
  $("#proofCoverage").classList.toggle("safe", assessed > 0 && assessed === resources.length && !violations && data.decision.status !== "NOT_APPLICABLE");
  $("#proofCoverage").classList.toggle("unknown", !violations && (!assessed || assessed < resources.length || data.decision.status === "NOT_APPLICABLE"));
  $("#proofRows").innerHTML = resources.map(resource => {
    const observation = resource.observation;
    const verdict = { risk: "NON-COMPLIANT", safe: "COMPLIANT", unknown: "REVIEW REQUIRED", na: "NOT APPLICABLE" }[resource.compliance];
    return `<tr><td>${esc(resource.resourceId)}</td><td>${esc(data.decision.userId || "Unresolved")}<small>${esc(observation?.linkType || "planned check")}</small></td><td class="policy-value">${esc(observation?.policyAction || "—")}<small>${esc(observation?.category || "No state evidence")}</small></td><td><span class="state ${statusClass(observation?.state || "unknown")}">${esc(observation?.state || "NOT OBSERVED")}</span>${observation ? `<button class="evidence-link" data-evidence="${esc(observation.evidenceId)}">${esc(observation.evidenceId)} ↗</button>` : ""}</td><td class="proof-verdict ${resource.compliance}">${verdict}</td></tr>`;
  }).join("") || `<tr><td colspan="5">${data.decision.status === "NOT_APPLICABLE" ? "This request does not authorize deletion." : "No cutoff-eligible resource state. Review the uncertainty ledger."}</td></tr>`;
}

function renderDarkGraph(data, resources) {
  const previousEmpty = $("#graphStage .empty-state");
  if (previousEmpty) previousEmpty.classList.add("light-only");
  const observed = resources.filter(resource => resource.observation);
  const groups = [...new Set(observed.map(resource => resource.systemId))];
  const groupHeight = 30, cardHeight = 94, gap = 18;
  const height = Math.max(290, observed.length * (cardHeight + gap) + groups.length * groupHeight + 30);
  let y = 30;
  const cards = [], lines = [];
  for (const system of groups) {
    cards.push(`<text class="system-label" x="405" y="${y}">└ ${esc(system)}</text>`);
    y += 16;
    for (const resource of observed.filter(item => item.systemId === system)) {
      const o = resource.observation;
      lines.push(`<path class="graph-connection ${resource.compliance}" d="M330 153 H355 V${y + 45} H405"/>`);
      cards.push(`<g class="resource-node ${resource.compliance}" transform="translate(405 ${y})"><rect class="resource-surface" width="330" height="94" rx="11"/><path class="node-stripe" d="M8 0Q0 0 0 10V84Q0 94 8 94"/><text class="resource-title" x="23" y="35">${esc(resource.resourceId)}</text><rect class="node-state-surface" x="182" y="20" width="128" height="22" rx="4"/><text class="resource-state" x="246" y="35" text-anchor="middle">${esc(o.state)} · ${esc(({ DISABLE_DATA_FLOW: "STOP", BLOCK_RESTORE: "BLOCK", ANONYMIZE: "ANON." })[o.policyAction] || o.policyAction || "REVIEW")}</text><text class="resource-source" x="23" y="68">${esc(o.evidenceId)}</text><text class="resource-link" x="160" y="68">${esc(o.linkType)}</text><title>${esc(`${resource.resourceId}: ${o.state}. Policy: ${o.policyAction || "unknown"}. ${o.linkType}. ${o.evidenceId}.`)}</title></g>`);
      y += cardHeight + gap;
    }
  }
  const empty = observed.length ? "" : `<text class="system-label" x="405" y="130">No grounded resource state</text><text class="system-label" x="405" y="154">Review the uncertainty ledger.</text>`;
  $("#graphStage").insertAdjacentHTML("beforeend", `<div class="dark-only topology-canvas"><div class="ambient-points" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="topology-map" tabindex="0" role="region" aria-label="Scrollable evidence topology"><svg class="topology-svg" viewBox="0 0 770 ${height}" role="img" aria-label="${esc(`Evidence topology for ${data.decision.userId || "unresolved subject"}, ${observed.length} observed resources`)}">${lines.join("")}<g class="subject-card" transform="translate(25 58)"><rect class="subject-surface" width="300" height="183" rx="16"/><rect class="subject-label-surface" x="20" y="-12" width="166" height="24" rx="4"/><text class="subject-label" x="103" y="5" text-anchor="middle">${data.decision.userId ? "RESOLVED SUBJECT" : "UNRESOLVED SUBJECT"}</text><text class="subject-title" x="25" y="61">${esc(data.decision.userId || "Unresolved")}</text><text class="subject-description" x="25" y="94">Time-bounded identifier links</text><path class="subject-rule" d="M25 118H275"/><text class="subject-tag" x="25" y="151">${data.identity.aliasCount} aliases</text><rect class="subject-tag-surface" x="142" y="131" width="133" height="27" rx="5"/><text class="subject-tag" x="208" y="150" text-anchor="middle">Audit snapshot</text></g>${cards.join("")}${empty}</svg></div><div class="signature-panel" aria-label="Halloween decoration"><svg class="signature-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 8c-5-5-13 2-12 10s6 12 12 10c6 2 11-2 12-10S21 3 16 8Zm0 0c-2-5 2-6 3-5M8 17l4-5 2 6Zm10 1 2-6 4 5ZM8 22l4 2 4-2 4 2 4-2-4 4h-8Z"/></svg><span>Spectral Ghost<br>Signature:</span><strong>JACK-O’-LANTERN<br>ALL-HALLOWS EDITION</strong><small><i class="orange-dot"></i> Decorative theme<br>No evidence classification</small></div><details class="graph-footer"><summary>${observed.length} grounded resource links <span>Point-in-time topology</span></summary><p>Subject links are established by ${data.identity.aliasCount} current and historical identifiers and eligible activity ownership. Only observed resources are connected. Planned checks remain in the proof ledger.</p></details></div>`);
}

function openEvidence(evidenceId) {
  if (!state.current) return;
  const observations = state.current.observations.filter(item => item.evidenceId === evidenceId);
  $("#evidenceDialogTitle").textContent = evidenceId;
  $("#evidenceDialogBody").innerHTML = `<p class="dialog-cutoff">Audit cutoff: ${esc(date(state.current.case.auditAt))}. Observations below were available at or before this cutoff.</p>${observations.map(item => `<article class="dialog-observation"><strong>${esc(item.systemId)} / ${esc(item.resourceId)}</strong><dl><div><dt>Observed state</dt><dd>${esc(item.state)}</dd></div><div><dt>Observed at</dt><dd>${esc(date(item.observedAt))}</dd></div><div><dt>Policy</dt><dd>${esc(item.policyAction || "Review required")}</dd></div><div><dt>Subject link</dt><dd>${esc(item.linkType)}</dd></div></dl></article>`).join("")}${/^evidence_\d+$/.test(evidenceId) ? `<a class="source-download" href="/api/evidence/${encodeURIComponent(evidenceId)}" download>Download source artifact ↗</a><p class="dialog-cutoff">The original source may contain additional records; the audit uses only cutoff-eligible observations.</p>` : ""}`;
  $("#evidenceDialog").showModal();
}

function exportDossier() {
  if (!state.current) return;
  const data = state.current;
  const dossier = { title: "GhostTrace evidence dossier", ...data, note: "Read-only point-in-time audit. Halloween visuals are decorative and are not evidence." };
  const blob = new Blob([JSON.stringify(dossier, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `ghosttrace-${data.case.caseId}-dossier.json`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("#actionStatus").textContent = `Dossier exported for ${data.case.caseId}.`;
}

init().catch(error => { console.error(error); $("#caseList").innerHTML = `<p class="muted-placeholder">Unable to load GhostTrace. Reload to retry.</p>`; $("#snapshotState").textContent = "Snapshot unavailable"; });

