const target = document.querySelector('#specialistArtifacts');

const labels = {
  strength_power_plan: 'Kraft & Power',
  endurance_plan: 'Ausdauer',
  recovery_state: 'Recovery & Schlaf',
  fueling_plan: 'Fueling',
  energy_availability_risk: 'Energieverfügbarkeit',
  rehab_progression: 'Rehabilitation',
  return_after_illness_plan: 'Return after Illness',
  testing_plan: 'Leistungstests',
  adaptation_analysis: 'Adaptationsanalyse'
};

const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[ch]));

function formatDate(value) {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(date);
}

function firstText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length) return firstText(value[0]);
  if (value && typeof value === 'object') {
    for (const key of ['summary','direction','status','state','interpretation','description','label','name']) {
      if (value[key]) return firstText(value[key]);
    }
  }
  return null;
}

function summary(record) {
  const a = record.artifact || {};
  switch (record.artifact_type) {
    case 'strength_power_plan': return a.objective || 'Aktueller Kraft-/Power-Plan';
    case 'endurance_plan': return a.objective || 'Aktueller Ausdauerplan';
    case 'recovery_state': return firstText(a.trend) || 'Recovery-Verlauf aktualisiert';
    case 'fueling_plan': return firstText(a.load_context) || 'Fueling-Strategie aktualisiert';
    case 'energy_availability_risk': return `Status: ${String(a.risk_state || 'unknown').replaceAll('_',' ')}`;
    case 'rehab_progression': return `Phase: ${String(a.current_phase || '–').replaceAll('_',' ')}`;
    case 'return_after_illness_plan': return `Stufe ${a.current_stage ?? '–'}`;
    case 'testing_plan': return `${Array.isArray(a.tests) ? a.tests.length : 0} geplante Tests`;
    case 'adaptation_analysis': return firstText(a.interpretations) || firstText(a.trends) || 'Longitudinale Analyse aktualisiert';
    default: return 'Aktualisiert';
  }
}

function render(records) {
  if (!target) return;
  if (!records.length) {
    target.innerHTML = '<p class="muted">Noch keine P1-Artefakte vorhanden. Sie werden ausschließlich über den internen Skillz-Ingest übernommen.</p>';
    return;
  }

  target.innerHTML = records.map(record => {
    const flags = Array.isArray(record.artifact?.safety_flags) ? record.artifact.safety_flags : [];
    return `<article class="specialist-tile">
      <div class="specialist-head">
        <strong>${esc(labels[record.artifact_type] || record.artifact_type)}</strong>
        <span class="version-tag">v${esc(record.artifact_version)}</span>
      </div>
      <p>${esc(summary(record))}</p>
      <p class="specialist-meta">Erzeugt ${esc(formatDate(record.artifact?.generated_at || record.generated_at))}</p>
      ${flags.length ? `<div class="safety-flags">${flags.map(flag => `<span>${esc(flag)}</span>`).join('')}</div>` : ''}
    </article>`;
  }).join('');
}

async function load() {
  if (!target) return;
  try {
    const response = await fetch('/api/v1/p1/artifacts/latest', { credentials: 'same-origin' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    render(body.artifacts || []);
  } catch (error) {
    target.innerHTML = `<p class="message error">P1-Kontext nicht verfügbar: ${esc(error.message)}</p>`;
  }
}

load();
