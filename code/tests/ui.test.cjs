/* Optional development checks: NODE_PATH=<test-tools>/node_modules node --test code/tests/ui.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const ui = path.resolve(__dirname, '../ui');
const observation = (overrides = {}) => ({
  systemId: 'export_service', resourceId: 'export_demo', state: 'PRESENT', category: 'USER_EXPORT',
  policyAction: 'DELETE', policyTarget: 'ABSENT', evidenceId: 'evidence_23',
  observedAt: '2026-07-18T11:00:00+00:00', confidence: 1, linkType: 'direct identifier', ...overrides,
});
const fixture = () => ({
  case: { caseId: 'case_33', email: 'subject@example.test', auditAt: '2026-07-19T13:00:00Z', reportedStatus: 'COMPLETE', requestText: 'Please delete my account.' },
  identity: { userId: 'user_demo', aliasCount: 4 },
  decision: { status: 'INCOMPLETE', userId: 'user_demo', confidence: 1, warnings: [], steps: [
    { step_no: 1, phase: 'FINDING', system_id: 'export_service', resource_id: 'export_demo', operation: 'REPORT_REMAINING_RECORD', state: 'PRESENT', evidence_id: 'evidence_23' },
    { step_no: 2, phase: 'REMEDIATION', system_id: 'export_service', resource_id: 'export_demo', operation: 'DELETE_RECORD', state: 'ABSENT', evidence_id: '' },
    { step_no: 3, phase: 'VERIFICATION', system_id: 'export_service', resource_id: 'export_demo', operation: 'VERIFY_RECORD_ABSENT', state: 'ABSENT', evidence_id: '' },
  ] }, observations: [observation()],
});
async function setup() {
  const dom = new JSDOM(fs.readFileSync(path.join(ui, 'index.html'), 'utf8'), { url: 'http://ghosttrace.test', runScripts: 'outside-only' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const data = fixture();
  const cases = [
    { caseId: 'case_33', email: 'subject@example.test', userId: 'user_demo', status: 'INCOMPLETE', stepCount: 3, resourceCount: 1, confidence: 1 },
    { caseId: 'case_34', email: 'other@example.test', userId: 'user_other', status: 'COMPLETE', stepCount: 1, resourceCount: 1, confidence: 1 },
  ];
  w.fetch = async endpoint => ({ ok: true, json: async () => endpoint === '/api/summary'
    ? { total: 2, counts: { INCOMPLETE: 1 }, evidenceFiles: 94, extractedFiles: 79, observations: 2950 }
    : endpoint === '/api/cases' ? cases : { ...data, case: { ...data.case, caseId: endpoint.split('/').pop() } } });
  w.eval(fs.readFileSync(path.join(ui, 'theme.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ui, 'app.js'), 'utf8').replace(/init\(\)\.catch\([\s\S]*$/, ''));
  await w.init();
  return { w, doc: w.document, data, close: () => w.close() };
}

test('initial snapshot uses real extraction counts and renders plan, graph, and proof', async () => {
  const { doc, close } = await setup();
  assert.equal(doc.querySelector('#caseTitle').textContent, 'subject@example.test');
  assert.equal(doc.querySelector('#metricEvidence .dark-only').textContent, '79/94');
  assert.equal(doc.querySelectorAll('.step').length, 3);
  assert.equal(doc.querySelectorAll('.resource-node').length, 1);
  assert.match(doc.querySelector('#proofRows').textContent, /NON-COMPLIANT/);
  assert.equal(doc.querySelector('#exportDossier').disabled, false);
  close();
});
test('present records required by retention policy are compliant', async () => {
  const { w, data, doc, close } = await setup();
  data.decision.steps = []; data.decision.status = 'COMPLETE';
  data.observations = [observation({ category: 'SECURITY_AUDIT_LOG', policyAction: 'RETAIN', policyTarget: 'PRESENT' })];
  w.renderCase(data);
  assert.equal(doc.querySelectorAll('.proof-verdict.safe').length, 1);
  assert.equal(doc.querySelectorAll('.resource-node.safe').length, 1);
  assert.equal(doc.querySelectorAll('.proof-verdict.risk').length, 0);
  close();
});
test('historical state does not replace a newer compliant observation', async () => {
  const { w, data, close } = await setup();
  data.decision.steps = [];
  data.observations = [observation({ state: 'ABSENT', observedAt: '2026-07-19T11:00:00Z' }), observation()];
  const inventory = w.resourceInventory(data);
  assert.equal(inventory[0].observation.state, 'ABSENT');
  assert.equal(inventory[0].compliance, 'safe');
  close();
});
test('future verification targets remain unobserved and have no fabricated graph edge', async () => {
  const { w, data, doc, close } = await setup();
  data.decision.steps.push({ step_no: 4, phase: 'VERIFICATION', system_id: 'account_service', resource_id: 'account_unobserved', operation: 'VERIFY_RECORD_ABSENT', state: 'ABSENT', evidence_id: '' });
  w.renderCase(data);
  assert.match(doc.querySelector('#proofRows').textContent, /account_unobserved/);
  assert.match(doc.querySelector('#proofRows').textContent, /NOT OBSERVED/);
  assert.doesNotMatch(doc.querySelector('.topology-svg').textContent, /account_unobserved/);
  assert.equal(doc.querySelectorAll('.graph-connection').length, 1);
  close();
});
test('non-deletion requests do not present policy violations', async () => {
  const { w, data, doc, close } = await setup();
  data.decision.status = 'NOT_APPLICABLE'; data.decision.steps = [];
  w.renderCase(data);
  assert.equal(doc.querySelectorAll('.proof-verdict.risk').length, 0);
  assert.match(doc.querySelector('#proofRows').textContent, /NOT APPLICABLE/);
  close();
});
test('missing evidence is explicit and does not invent nodes or findings', async () => {
  const { w, data, doc, close } = await setup();
  data.observations = []; data.decision.steps = []; data.decision.warnings = ['No eligible evidence.'];
  w.renderCase(data);
  assert.equal(doc.querySelectorAll('.resource-node').length, 0);
  assert.match(doc.querySelector('.topology-svg').textContent, /No grounded resource state/);
  assert.equal(doc.querySelector('#warningsSection').hidden, false);
  close();
});
test('search, status filters, case selection, and keyboard navigation work', async () => {
  const { w, doc, close } = await setup();
  const field = doc.querySelector('#caseSearch'); field.value = 'user_other'; field.dispatchEvent(new w.Event('input'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(doc.querySelectorAll('.case-card').length, 1);
  assert.equal(doc.querySelector('#caseEyebrow').textContent.split(' · ')[0], 'case_34');
  field.value = ''; field.dispatchEvent(new w.Event('input'));
  doc.querySelector('[data-status="INCOMPLETE"]').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(doc.querySelectorAll('.case-card').length, 1);
  assert.equal(doc.querySelector('.case-card').dataset.id, 'case_33');
  doc.querySelector('[data-status=""]').click();
  await new Promise(resolve => setImmediate(resolve));
  doc.body.focus(); doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'j' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(doc.querySelector('#caseEyebrow').textContent.split(' · ')[0], 'case_34');
  close();
});
test('theme switching persists the existing preference and closes dark evidence details', async () => {
  const { w, doc, close } = await setup();
  doc.querySelector('#themeButton').click();
  assert.equal(doc.documentElement.dataset.theme, 'dark');
  assert.equal(w.localStorage.getItem('ghosttrace-theme'), 'dark');
  w.openEvidence('evidence_23'); assert.equal(doc.querySelector('#evidenceDialog').open, true);
  assert.equal(doc.querySelector('.source-download').getAttribute('href'), '/api/evidence/evidence_23');
  doc.querySelector('#themeButton').click();
  assert.equal(doc.documentElement.dataset.theme, 'light');
  assert.equal(doc.querySelector('#evidenceDialog').open, false);
  close();
});
test('evidence links open the real reference and escape source values', async () => {
  const { w, data, doc, close } = await setup();
  data.observations[0].resourceId = '<img src=x onerror=alert(1)>';
  w.renderCase(data);
  assert.equal(doc.querySelector('#proofRows img'), null);
  doc.querySelector('.evidence-link').click();
  assert.equal(doc.querySelector('#evidenceDialogTitle').textContent, 'evidence_23');
  assert.match(doc.querySelector('#evidenceDialogBody').textContent, /<img src=x onerror=alert\(1\)>/);
  close();
});
test('dossier exports the exact selected decision without Halloween findings', async () => {
  const { w, doc, close } = await setup();
  let blob, filename;
  w.Blob = Blob;
  w.URL.createObjectURL = value => { blob = value; return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  doc.querySelector('#exportDossier').click();
  assert.equal(filename, 'ghosttrace-case_33-dossier.json');
  const dossier = JSON.parse(await blob.text());
  assert.equal(dossier.decision.steps.length, 3);
  assert.equal(dossier.observations[0].evidenceId, 'evidence_23');
  assert.match(dossier.note, /decorative/);
  close();
});
test('rapid navigation cannot render an older response over the selected case', async () => {
  const { w, doc, close } = await setup();
  let release;
  w.fetch = endpoint => endpoint.endsWith('case_33') ? new Promise(resolve => { release = () => resolve({ ok: true, json: async () => fixture() }); })
    : Promise.resolve({ ok: true, json: async () => { const data = fixture(); data.case.caseId = 'case_34'; return data; } });
  const old = w.selectCase('case_33');
  await w.selectCase('case_34'); release(); await old;
  assert.equal(doc.querySelector('#caseEyebrow').textContent.split(' · ')[0], 'case_34');
  close();
});
