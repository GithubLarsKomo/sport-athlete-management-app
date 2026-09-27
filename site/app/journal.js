const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
let coachReadOnly = false;

function targetAthleteId() {
  return new URLSearchParams(window.location.search).get('athlete')?.trim() || '';
}

async function api(path, options = {}) {
  const target = targetAthleteId();
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(target ? { 'x-sam-target-athlete': target } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function message(text, ok = true) {
  const el = $('#journalMessage');
  if (!el) return;
  el.textContent = text;
  el.className = `message ${ok ? 'ok' : 'error'}`;
}

function duration(value) {
  const seconds = Number(value || 0);
  if (!seconds) return '–';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function distance(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters)) return '–';
  return meters >= 1000 ? `${(meters / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km` : `${Math.round(meters)} m`;
}

function dateTime(value) {
  if (!value) return '–';
  return new Intl.DateTimeFormat('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
}

function sourceBadges(activity) {
  return (activity.sources || []).map(source => `<span class="source-badge source-${esc(source.provider)}">${esc(source.provider.toUpperCase())}</span>`).join('');
}

function metric(label, value, unit = '') {
  if (value == null || value === '') return '';
  const number = Number(value);
  const display = Number.isFinite(number) ? number.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : String(value);
  return `<div><dt>${esc(label)}</dt><dd>${esc(display)}${unit ? ` ${esc(unit)}` : ''}</dd></div>`;
}

const deviationOptions = [
  ['time_constraint','Zeit'],
  ['weather_environment','Wetter/Umgebung'],
  ['fatigue','Müdigkeit'],
  ['pain','Schmerz'],
  ['illness','Krankheit'],
  ['equipment','Material'],
  ['intentionally_modified','bewusst geändert'],
  ['external_interruption','externe Unterbrechung'],
  ['other','sonstiges']
];

function expectationLabel(value) {
  return ({ easier:'leichter als erwartet', as_expected:'wie erwartet', harder:'härter als erwartet' })[value] || '–';
}

function subjectiveState(activity) {
  const source = activity.journal || activity.completion || {};
  return {
    session_rpe: source.session_rpe ?? null,
    expectation_match: source.expectation_match || null,
    pain_0_10: source.pain_0_10 ?? source.pain_during ?? null,
    deviations: Array.isArray(source.deviations) ? source.deviations : [],
    comment: source.comment || null,
    authored_by_subject: source.authored_by_subject || source.athlete_authored_by_subject || null,
    finalized: Boolean(activity.journal?.finalized_at || activity.completed_session_id)
  };
}

function subjectiveHtml(subjective) {
  const deviations = subjective.deviations.length
    ? subjective.deviations.map(value => esc(String(value).replaceAll('_',' '))).join(', ')
    : '–';
  return `<div class="subjective-summary">
    <dl class="comparison-facts">
      <div><dt>Session RPE</dt><dd>${esc(subjective.session_rpe ?? '–')}</dd></div>
      <div><dt>Erwartung</dt><dd>${esc(expectationLabel(subjective.expectation_match))}</dd></div>
      <div><dt>Schmerz</dt><dd>${esc(subjective.pain_0_10 ?? '–')}</dd></div>
    </dl>
    <p><b>Abweichungen:</b> ${deviations}</p>
    <p><b>Athlete-Kommentar:</b> ${esc(subjective.comment || '–')}</p>
    <p class="muted">Athlete-Autor: ${esc(subjective.authored_by_subject || '–')}</p>
  </div>`;
}

function coachNotesHtml(notes = []) {
  if (!notes.length) return '';
  return `<div class="coach-notes">${notes.map(note =>
    `<div class="coach-note"><b>Coach</b><span>${esc(note.note)}</span></div>`
  ).join('')}</div>`;
}

function journalForm(activity, subjective) {
  if (subjective.finalized) {
    return `<div class="finalized-subjective">${subjectiveHtml(subjective)}<p class="muted">Subjektiver Abschluss ist final; Gerätedaten dürfen später weiterhin als Provenienz andocken.</p></div>`;
  }
  const checked = new Set(subjective.deviations);
  return `<form class="journal-entry-form form-grid compact" data-activity-id="${esc(activity.id)}">
    <label>Session RPE <input name="session_rpe" type="number" min="0" max="10" step="0.5" value="${esc(subjective.session_rpe ?? '')}" required></label>
    <label>Erwartung
      <select name="expectation_match" required>
        <option value="">–</option>
        <option value="easier" ${subjective.expectation_match === 'easier' ? 'selected' : ''}>leichter</option>
        <option value="as_expected" ${subjective.expectation_match === 'as_expected' ? 'selected' : ''}>wie erwartet</option>
        <option value="harder" ${subjective.expectation_match === 'harder' ? 'selected' : ''}>härter</option>
      </select>
    </label>
    <label>Schmerz 0–10 <input name="pain_0_10" type="number" min="0" max="10" step="1" value="${esc(subjective.pain_0_10 ?? '')}"></label>
    <label class="wide">Athlete-Kommentar <input name="comment" type="text" maxlength="4000" value="${esc(subjective.comment ?? '')}" placeholder="Wie war die Einheit?"></label>
    <fieldset class="deviation-fieldset wide">
      <legend>Abweichungsgründe · optional</legend>
      ${deviationOptions.map(([value,label]) => `<label><input type="checkbox" name="deviations" value="${esc(value)}" ${checked.has(value) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}
    </fieldset>
    <button class="primary wide" type="submit">Journal finalisieren</button>
  </form>`;
}

function renderActivity(activity) {
  const summary = activity.canonical_summary || {};
  const subjective = subjectiveState(activity);
  const review = activity.match_state === 'review' && activity.match_candidate_activity_id;
  const status = subjective.finalized ? 'Journal final' : review ? 'Dublette prüfen' : 'Importiert';
  return `<article class="journal-item ${review ? 'journal-review' : ''}" data-activity-id="${esc(activity.id)}">
    <div class="journal-item-head">
      <div>
        <div class="source-badges">${sourceBadges(activity)}</div>
        <h3>${esc(activity.activity_type.replaceAll('_', ' '))}</h3>
        <p class="muted">${esc(dateTime(activity.started_at))}${activity.planned_session_id ? ' · Plan zugeordnet' : ''}${activity.completed_session_id ? ' · Completion verknüpft' : ''}</p>
      </div>
      <span class="pill">${status}</span>
    </div>
    <dl class="journal-metrics">
      ${metric('Dauer', duration(summary.duration_s))}
      ${metric('Distanz', distance(summary.distance_m))}
      ${metric('Ø Leistung', summary.avg_power_w, 'W')}
      ${metric('Ø HF', summary.avg_hr_bpm, 'bpm')}
      ${metric('Max HF', summary.max_hr_bpm, 'bpm')}
      ${metric('Schlagrate', summary.stroke_rate_spm, 'spm')}
      ${metric('Drag', summary.drag_factor)}
    </dl>
    ${review
      ? `<div class="dedupe-warning"><strong>Mögliche Dublette</strong><span>Match ${(Number(activity.match_score || 0) * 100).toFixed(0)} %</span>${coachReadOnly ? '' : `<button class="secondary merge-activity" type="button" data-target="${esc(activity.match_candidate_activity_id)}" data-duplicate="${esc(activity.id)}">Zusammenführen</button>`}</div>`
      : ''}
    ${coachReadOnly
      ? `<div class="coach-readonly-note muted">Coach-Ansicht: Athlete-RPE, Erwartung, Schmerz, Abweichungen und Kommentar sind schreibgeschützt.</div>${subjectiveHtml(subjective)}`
      : journalForm(activity, subjective)}
    ${coachNotesHtml(activity.coach_notes)}
  </article>`;
}

async function loadJournal() {
  const target = $('#journalActivities');
  if (!target) return;
  const { activities } = await api('/api/v1/journal?limit=50');
  target.innerHTML = activities.length ? activities.map(renderActivity).join('') : '<p class="muted">Noch keine importierten Aktivitäten.</p>';
}

function fileFormat(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (['fit','tcx','json','csv'].includes(extension)) return extension;
  return '';
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function importFile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const file = form.elements.file.files?.[0];
  const provider = form.elements.provider.value;
  if (!file) return message('Bitte eine Datei auswählen.', false);
  const format = fileFormat(file);
  if (!format) return message('Unterstützt werden FIT, TCX, JSON und CSV.', false);
  if (provider === 'garmin' && !['fit','tcx'].includes(format)) return message('Garmin: FIT oder TCX wählen.', false);
  if (provider === 'rp3' && !['json','csv','tcx'].includes(format)) return message('RP3: JSON, CSV oder TCX wählen.', false);
  message('Import läuft …');
  const body = { provider, format, filename: file.name };
  if (format === 'fit') body.content_base64 = bufferToBase64(await file.arrayBuffer());
  else body.content = await file.text();
  try {
    const result = await api('/api/v1/import/file', { method:'POST', body:JSON.stringify(body) });
    const labels = { created:'Neue Einheit importiert.', auto_merged:'Quelle mit bestehender Einheit zusammengeführt.', exact_duplicate:'Bereits vorhanden – kein Duplikat erzeugt.', review:'Importiert; mögliche Dublette bitte prüfen.' };
    message(labels[result.disposition] || 'Import abgeschlossen.');
    form.reset();
    await loadJournal();
  } catch (error) { message(error.message, false); }
}

async function syncConcept2() {
  const button = $('#concept2Sync');
  button.disabled = true;
  message('Concept2 wird synchronisiert …');
  try {
    const result = await api('/api/v1/import/concept2/sync', { method:'POST' });
    message(`Concept2: ${result.fetched} Ergebnisse geprüft · ${result.dispositions.created || 0} neu · ${result.dispositions.auto_merged || 0} zusammengeführt · ${result.dispositions.exact_duplicate || 0} bereits vorhanden.`);
    await loadJournal();
  } catch (error) { message(error.message, false); }
  finally { button.disabled = false; }
}

async function saveJournal(event) {
  const form = event.target.closest('.journal-entry-form');
  if (!form) return;
  event.preventDefault();
  const id = form.dataset.activityId;
  const data = new FormData(form);
  try {
    await api(`/api/v1/journal/${encodeURIComponent(id)}`, {
      method:'PUT',
      body:JSON.stringify({
        session_rpe: Number(data.get('session_rpe')),
        expectation_match: data.get('expectation_match'),
        pain_0_10: data.get('pain_0_10') === '' ? null : Number(data.get('pain_0_10')),
        comment: String(data.get('comment') || ''),
        deviations: [...form.querySelectorAll('input[name="deviations"]:checked')].map(input => input.value),
        finalize: true
      })
    });
    message('Journal gespeichert; die Einheit ist für die Trainingssteuerung abgeschlossen.');
    await loadJournal();
  } catch (error) { message(error.message, false); }
}

async function mergeActivity(event) {
  const button = event.target.closest('.merge-activity');
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/v1/journal/${encodeURIComponent(button.dataset.target)}/merge`, {
      method:'POST',
      body:JSON.stringify({ duplicate_activity_id: button.dataset.duplicate })
    });
    message('Die beiden Quellen wurden zu einer Journal-Einheit zusammengeführt.');
    await loadJournal();
  } catch (error) { message(error.message, false); }
}

async function init() {
  const form = $('#activityImportForm');
  if (!form) return;

  try {
    const me = await api('/api/v1/me');
    coachReadOnly = me.role === 'coach';
    if (coachReadOnly && !targetAthleteId()) return;
  } catch (error) {
    return message(error.message, false);
  }

  if (coachReadOnly) {
    for (const control of form.querySelectorAll('input, select, button')) control.disabled = true;
    const sync = $('#concept2Sync');
    if (sync) sync.disabled = true;
  } else {
    form.addEventListener('submit', importFile);
    $('#concept2Sync')?.addEventListener('click', syncConcept2);
  }
  $('#journalActivities')?.addEventListener('submit', saveJournal);
  $('#journalActivities')?.addEventListener('click', mergeActivity);
  try {
    const status = await api('/api/v1/import/status');
    const c2 = $('#concept2Sync');
    if (c2) {
      c2.disabled = coachReadOnly || !status.concept2_configured;
      c2.title = coachReadOnly
        ? 'Coach-Ansicht: Geräteimport bleibt athlete-eigen'
        : (status.concept2_configured ? 'Neue Concept2 Logbook Ergebnisse abrufen' : 'CONCEPT2_ACCESS_TOKEN ist nicht konfiguriert');
    }
    await loadJournal();
  } catch (error) { message(error.message, false); }
}

init();
