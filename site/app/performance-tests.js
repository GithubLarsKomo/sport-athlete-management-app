const $p = selector => document.querySelector(selector);
const escp = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const METRICS = {
  duration_s: { label:'Dauer', unit:'s', step:'0.1' },
  distance_m: { label:'Distanz', unit:'m', step:'1' },
  pace_500_s: { label:'Pace / 500 m', unit:'s/500m', step:'0.01' },
  power_w: { label:'Leistung', unit:'W', step:'1' },
  heart_rate_bpm: { label:'Herzfrequenz', unit:'bpm', step:'1' },
  max_heart_rate_bpm: { label:'HF max', unit:'bpm', step:'1' },
  lactate_mmol_l: { label:'Laktat', unit:'mmol/L', step:'0.1' },
  rpe: { label:'RPE', unit:'RPE', step:'0.5' },
  cadence_rpm: { label:'Kadenz', unit:'rpm', step:'1' },
  stroke_rate_spm: { label:'Schlagrate', unit:'spm', step:'1' },
  work_kj: { label:'Arbeit', unit:'kJ', step:'1' }
};

const CLASSES = {
  measured:'gemessen',
  derived:'abgeleitet',
  assumed_or_estimated:'angenommen / geschätzt'
};

let performanceProtocols = [];
let performanceTests = [];
let activePerformanceTest = null;
let stageCounter = 0;

function targetAthleteId() {
  return new URLSearchParams(window.location.search).get('athlete')?.trim() || '';
}

async function performanceApi(path, options = {}) {
  const target = targetAthleteId();
  const response = await fetch(path, {
    credentials:'same-origin',
    ...options,
    headers:{
      ...(options.body ? { 'content-type':'application/json' } : {}),
      ...(target ? { 'x-sam-target-athlete':target } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(body.details) && body.details.length ? `: ${body.details.join('; ')}` : '';
    throw new Error(`${body.error || `HTTP ${response.status}`}${detail}`);
  }
  return body;
}

function performanceMessage(text, ok = true) {
  const el = $p('#performanceTestMessage');
  if (!el) return;
  el.textContent = text;
  el.className = `message ${ok ? 'ok' : 'error'}`;
}

function toLocalInput(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0,16);
}

function formatPerformanceDate(value) {
  if (!value) return '–';
  return new Intl.DateTimeFormat('de-DE', {
    weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'
  }).format(new Date(value));
}

function classBadge(value) {
  return `<span class="measurement-class measurement-${escp(value)}">${escp(CLASSES[value] || value || 'ohne Klasse')}</span>`;
}

function metricValueHtml(name, value) {
  if (!value || value.value == null) return '';
  const label = METRICS[name]?.label || name;
  const numeric = Number(value.value);
  const rendered = Number.isFinite(numeric)
    ? numeric.toLocaleString('de-DE', { maximumFractionDigits:2 })
    : String(value.value);
  return `<div class="test-metric"><span>${escp(label)}</span><b>${escp(rendered)} ${escp(value.unit || '')}</b>${classBadge(value.measurement_class)}</div>`;
}

function metricMapHtml(metrics = {}) {
  const entries = Object.entries(metrics).map(([name,value]) => metricValueHtml(name,value)).filter(Boolean);
  return entries.length ? `<div class="test-metrics">${entries.join('')}</div>` : '<p class="muted">Keine Messwerte.</p>';
}

function protocolFor(test) {
  return test.protocol || performanceProtocols.find(protocol =>
    protocol.protocol_id === test.protocol_id && Number(protocol.version) === Number(test.protocol_version)
  );
}

function resultHtml(test) {
  if (!test.result) return '';
  const protocol = protocolFor(test) || {};
  const summary = metricMapHtml(test.result.metrics || {});
  const stages = (test.result.stages || []).map(stage => `
    <div class="test-stage-result">
      <div class="test-stage-head"><b>Stufe ${escp(stage.stage_number)}</b><span class="muted">${escp(stage.comment || '')}</span></div>
      ${metricMapHtml(stage.metrics || {})}
    </div>`).join('');
  return `<div class="test-result">
    ${protocol.protocol_kind === 'staged' ? stages : summary}
    <p class="muted">Durchgeführt von ${escp(test.performed_by_subject || '–')} · Gerät: ${escp(test.device || '–')}</p>
  </div>`;
}

function expectedHtml(test) {
  const entries = Object.entries(test.expected_targets || {}).map(([name,value]) => metricValueHtml(name,value)).filter(Boolean);
  if (!entries.length) return '';
  return `<div class="test-expected"><strong>Erwartete / angenommene Ziele</strong><div class="test-metrics">${entries.join('')}</div></div>`;
}

function renderPerformanceTests() {
  const target = $p('#performanceTests');
  if (!target) return;
  if (!performanceTests.length) {
    target.innerHTML = '<p class="muted">Noch keine Leistungstests geplant.</p>';
    return;
  }
  target.innerHTML = performanceTests.map(test => {
    const protocol = protocolFor(test) || {};
    const state = test.status === 'performed' ? 'durchgeführt' : test.status === 'cancelled' ? 'abgebrochen' : 'geplant';
    return `<article class="performance-test-row">
      <div class="performance-test-head">
        <div>
          <div class="test-state-row"><span class="mini-state ${escp(test.status)}">${escp(state)}</span><span class="pill">${escp(protocol.modality || test.modality || '–')}</span></div>
          <h3>${escp(protocol.name || test.protocol_id)}</h3>
          <p class="muted">${escp(formatPerformanceDate(test.scheduled_at))} · Protokoll v${escp(test.protocol_version)} · ${escp(test.protocol_source)}</p>
        </div>
        ${test.status === 'planned' ? `<button class="secondary record-test-result" type="button" data-test-id="${escp(test.test_id)}">Ergebnis erfassen</button>` : ''}
      </div>
      ${expectedHtml(test)}
      ${resultHtml(test)}
      <p class="test-provenance">Plan: ${escp(test.planned_by_subject || '–')}${test.retest_of_test_id ? ` · Retest von ${escp(test.retest_of_test_id)}` : ''}</p>
    </article>`;
  }).join('');
}

function populateProtocolSelect() {
  const select = $p('#performanceProtocol');
  if (!select) return;
  select.innerHTML = performanceProtocols.map(protocol =>
    `<option value="${escp(protocol.protocol_id)}" data-version="${escp(protocol.version)}">${escp(protocol.name)} · ${escp(protocol.source === 'custom' ? 'eigenes Protokoll' : 'Standard')}</option>`
  ).join('');
  updateExpectedMetricOptions();
}

function selectedProtocol() {
  const select = $p('#performanceProtocol');
  if (!select) return null;
  return performanceProtocols.find(protocol => protocol.protocol_id === select.value && Number(protocol.version) === Number(select.selectedOptions[0]?.dataset.version || 1)) || null;
}

function updateExpectedMetricOptions() {
  const protocol = selectedProtocol();
  const select = $p('#performanceExpectedMetric');
  if (!select || !protocol) return;
  const relevant = protocol.protocol_kind === 'staged'
    ? (protocol.stage_fields || []).filter(name => METRICS[name])
    : protocol.fixed_target?.metric === 'duration_s'
      ? ['distance_m','power_w','heart_rate_bpm','rpe','stroke_rate_spm']
      : ['duration_s','pace_500_s','power_w','heart_rate_bpm','rpe','stroke_rate_spm'];
  select.innerHTML = '<option value="">kein Zielwert</option>' + relevant.map(name =>
    `<option value="${escp(name)}">${escp(METRICS[name].label)} (${escp(METRICS[name].unit)})</option>`
  ).join('');
}

function fixedMetricNames(protocol) {
  if (protocol?.fixed_target?.metric === 'duration_s') {
    return ['duration_s','distance_m','power_w','heart_rate_bpm','max_heart_rate_bpm','rpe','stroke_rate_spm','work_kj'];
  }
  return ['duration_s','distance_m','pace_500_s','power_w','heart_rate_bpm','max_heart_rate_bpm','rpe','stroke_rate_spm','work_kj'];
}

function classOptions(selected = 'measured') {
  return Object.entries(CLASSES).map(([value,label]) =>
    `<option value="${escp(value)}" ${value === selected ? 'selected' : ''}>${escp(label)}</option>`
  ).join('');
}

function metricInput(name, scope) {
  const meta = METRICS[name] || { label:name, unit:'', step:'any' };
  return `<div class="performance-metric-input" data-metric-name="${escp(name)}">
    <label>${escp(meta.label)}
      <span class="metric-input-line">
        <input type="number" inputmode="decimal" step="${escp(meta.step)}" data-value-for="${escp(scope)}" placeholder="${escp(meta.unit)}">
        <select data-class-for="${escp(scope)}" aria-label="Messklasse ${escp(meta.label)}">${classOptions()}</select>
      </span>
    </label>
  </div>`;
}

function addStageEditor() {
  const protocol = protocolFor(activePerformanceTest) || {};
  const fields = (protocol.stage_fields || []).filter(name => METRICS[name]);
  stageCounter += 1;
  const stage = document.createElement('div');
  stage.className = 'performance-stage-editor';
  stage.dataset.stageNumber = String(stageCounter);
  stage.innerHTML = `<div class="test-stage-head"><b>Stufe ${stageCounter}</b><button class="secondary remove-test-stage" type="button">Entfernen</button></div>
    <div class="performance-metric-grid">${fields.map(name => metricInput(name, `stage-${stageCounter}-${name}`)).join('')}</div>
    <label>Kommentar <input class="stage-comment" type="text" maxlength="1000" placeholder="optional"></label>`;
  $p('#performanceStages').append(stage);
}

function openResultEditor(testId) {
  const test = performanceTests.find(item => item.test_id === testId);
  if (!test) return;
  activePerformanceTest = test;
  stageCounter = 0;
  const protocol = protocolFor(test) || {};
  $p('#performanceResultEditor').classList.remove('hidden');
  $p('#performanceResultTitle').textContent = protocol.name || test.protocol_id;
  $p('#performancePerformedAt').value = toLocalInput(new Date());
  $p('#performanceResultDevice').value = test.device || '';
  $p('#performanceResultWarmup').value = test.warm_up?.description || '';
  $p('#performanceResultEnvironment').value = test.environment?.description || test.environment?.location || '';
  $p('#performanceTermination').value = '';
  $p('#performanceResultNotes').value = test.notes || '';
  $p('#performanceMetricInputs').innerHTML = '';
  $p('#performanceStages').innerHTML = '';

  const staged = protocol.protocol_kind === 'staged';
  $p('#addPerformanceStage').classList.toggle('hidden', !staged);
  if (staged) {
    const plannedStages = Array.isArray(protocol.stages) && protocol.stages.length ? protocol.stages.length : 1;
    for (let i = 0; i < plannedStages; i += 1) addStageEditor();
  } else {
    $p('#performanceMetricInputs').innerHTML = fixedMetricNames(protocol).map(name => metricInput(name, `summary-${name}`)).join('');
  }
  $p('#performanceResultEditor').scrollIntoView({ behavior:'smooth', block:'start' });
}

function collectMetrics(container) {
  const metrics = {};
  for (const wrapper of container.querySelectorAll('[data-metric-name]')) {
    const name = wrapper.dataset.metricName;
    const valueInput = wrapper.querySelector('input[data-value-for]');
    const classInput = wrapper.querySelector('select[data-class-for]');
    if (!valueInput || valueInput.value === '') continue;
    metrics[name] = {
      value:Number(valueInput.value),
      unit:METRICS[name]?.unit || '',
      measurement_class:classInput?.value || 'measured'
    };
  }
  return metrics;
}

async function planPerformanceTest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const protocol = selectedProtocol();
  if (!protocol) return performanceMessage('Bitte ein Protokoll wählen.', false);
  const data = new FormData(form);
  const scheduled = String(data.get('scheduled_at') || '');
  if (!scheduled) return performanceMessage('Bitte einen Testzeitpunkt angeben.', false);

  const payload = {
    protocol_id:protocol.protocol_id,
    protocol_version:Number(protocol.version),
    scheduled_at:new Date(scheduled).toISOString(),
    device:String(data.get('device') || '').trim() || null,
    notes:String(data.get('notes') || '').trim() || null,
    expected_targets:{}
  };
  const metric = String(data.get('expected_metric') || '');
  const expected = String(data.get('expected_value') || '').trim();
  if (metric && expected !== '') {
    payload.expected_targets[metric] = {
      value:Number(expected),
      unit:METRICS[metric].unit,
      measurement_class:'assumed_or_estimated',
      source_ref:'ui:planned-target'
    };
  }

  try {
    await performanceApi('/api/v1/tests', { method:'POST', body:JSON.stringify(payload) });
    performanceMessage('Leistungstest geplant. Zielwerte werden ausdrücklich als angenommen/geschätzt gespeichert.');
    form.reset();
    $p('#performanceScheduledAt').value = toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000));
    populateProtocolSelect();
    await loadPerformanceTests();
  } catch (error) {
    performanceMessage(error.message, false);
  }
}

async function submitPerformanceResult(event) {
  event.preventDefault();
  if (!activePerformanceTest) return performanceMessage('Kein Test für die Ergebniserfassung ausgewählt.', false);
  const protocol = protocolFor(activePerformanceTest) || {};
  const staged = protocol.protocol_kind === 'staged';
  const metrics = staged ? {} : collectMetrics($p('#performanceMetricInputs'));
  const stages = staged ? [...$p('#performanceStages').querySelectorAll('.performance-stage-editor')].map((stage,index) => ({
    stage_number:index + 1,
    metrics:collectMetrics(stage),
    comment:stage.querySelector('.stage-comment')?.value?.trim() || ''
  })) : [];

  if (!staged && !Object.keys(metrics).length) return performanceMessage('Mindestens einen Messwert erfassen.', false);
  if (staged && (!stages.length || stages.some(stage => !Object.keys(stage.metrics).length))) {
    return performanceMessage('Jede Stufe benötigt mindestens einen klassifizierten Messwert.', false);
  }

  const payload = {
    performed_at:new Date($p('#performancePerformedAt').value).toISOString(),
    device:$p('#performanceResultDevice').value.trim(),
    warm_up:$p('#performanceResultWarmup').value.trim() ? { description:$p('#performanceResultWarmup').value.trim() } : {},
    environment:$p('#performanceResultEnvironment').value.trim() ? { description:$p('#performanceResultEnvironment').value.trim() } : {},
    termination_reason:$p('#performanceTermination').value.trim() || null,
    notes:$p('#performanceResultNotes').value.trim() || null,
    metrics,
    stages
  };
  if (!payload.device) return performanceMessage('Für einen durchgeführten Test ist das Gerät / Messsystem erforderlich.', false);

  try {
    await performanceApi(`/api/v1/tests/${encodeURIComponent(activePerformanceTest.test_id)}/result`, {
      method:'PUT',
      body:JSON.stringify(payload)
    });
    performanceMessage('Testergebnis gespeichert. Messklasse und Provenienz bleiben am Wert erhalten.');
    activePerformanceTest = null;
    $p('#performanceResultEditor').classList.add('hidden');
    await loadPerformanceTests();
  } catch (error) {
    performanceMessage(error.message, false);
  }
}

async function saveCustomProtocol(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  let stages;
  try {
    stages = JSON.parse(String(data.get('stages_json') || '[]'));
  } catch {
    return performanceMessage('Stufen-JSON ist syntaktisch ungültig.', false);
  }
  const stageFields = String(data.get('stage_fields') || '').split(',').map(value => value.trim()).filter(Boolean);
  try {
    await performanceApi('/api/v1/tests/protocols', {
      method:'POST',
      body:JSON.stringify({
        name:String(data.get('name') || '').trim(),
        modality:String(data.get('modality') || ''),
        protocol_kind:'staged',
        stage_fields:stageFields,
        stages
      })
    });
    performanceMessage('Eigenes Stufenprotokoll gespeichert.');
    form.reset();
    await loadPerformanceProtocols();
  } catch (error) {
    performanceMessage(error.message, false);
  }
}

async function loadPerformanceProtocols() {
  const { protocols } = await performanceApi('/api/v1/tests/protocols');
  performanceProtocols = protocols || [];
  populateProtocolSelect();
}

async function loadPerformanceTests() {
  const { tests } = await performanceApi('/api/v1/tests?limit=30');
  performanceTests = tests || [];
  renderPerformanceTests();
}

async function loadPerformanceTesting() {
  if (!$p('#performanceTestCard')) return;
  try {
    $p('#performanceScheduledAt').value = toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await Promise.all([loadPerformanceProtocols(), loadPerformanceTests()]);
  } catch (error) {
    performanceMessage(error.message, false);
  }
}

$p('#performanceTestPlanForm')?.addEventListener('submit', planPerformanceTest);
$p('#performanceProtocol')?.addEventListener('change', updateExpectedMetricOptions);
$p('#performanceResultForm')?.addEventListener('submit', submitPerformanceResult);
$p('#customTestProtocolForm')?.addEventListener('submit', saveCustomProtocol);
$p('#addPerformanceStage')?.addEventListener('click', addStageEditor);
$p('#performanceTests')?.addEventListener('click', event => {
  const button = event.target.closest('.record-test-result');
  if (button) openResultEditor(button.dataset.testId);
});
$p('#performanceStages')?.addEventListener('click', event => {
  const button = event.target.closest('.remove-test-stage');
  if (!button) return;
  button.closest('.performance-stage-editor')?.remove();
  [...$p('#performanceStages').querySelectorAll('.performance-stage-editor')].forEach((stage,index) => {
    stage.dataset.stageNumber = String(index + 1);
    const title = stage.querySelector('.test-stage-head b');
    if (title) title.textContent = `Stufe ${index + 1}`;
  });
  stageCounter = $p('#performanceStages').querySelectorAll('.performance-stage-editor').length;
});

loadPerformanceTesting();
