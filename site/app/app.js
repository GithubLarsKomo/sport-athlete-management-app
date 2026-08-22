const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
let todaySession = null;

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function setMessage(selector, text, ok = true) {
  const el = $(selector); el.textContent = text; el.className = `message ${ok ? 'ok' : 'error'}`;
}

function renderDecision(decision) {
  const badge = $('#statusBadge');
  const box = $('#decision');
  if (!decision) { badge.textContent='Kein Entscheid'; badge.className='status neutral'; box.textContent='Noch keine Entscheidung.'; return; }
  badge.textContent = `${decision.safety_state} · ${decision.action}`;
  badge.className = `status ${decision.safety_state}`;
  box.innerHTML = `<strong>${esc(decision.action.replaceAll('_',' '))}</strong><div>${esc(decision.rationale)}</div><p class="muted">Confidence: ${Math.round((decision.confidence || 0)*100)}% · ${esc(decision.engine_version || '')}</p>`;
}

async function load() {
  try {
    const [me, context, training, latest, history, checkin] = await Promise.all([
      api('/api/v1/me'), api('/api/v1/context'), api('/api/v1/training/today'), api('/api/v1/adaptation/latest'), api('/api/v1/adaptation/history?limit=10'), api('/api/v1/checkins/today')
    ]);
    $('#identity').textContent = me.displayName || me.subject;
    todaySession = training.session;
    $('#sessionTitle').textContent = todaySession ? todaySession.objective : 'Heute keine Einheit geplant';
    $('#sessionMeta').textContent = todaySession ? `${todaySession.session_type} · ${Number(todaySession.planned_duration_min)} min · Ziel-RPE ${todaySession.planned_rpe ?? '–'}` : 'Der Mikrozyklus enthält für heute keine aktive Session.';
    const facts = [
      ['Ziel', context.active_goal?.description || '–'],
      ['Wettkampf', context.next_competition ? `${context.next_competition.name} · ${String(context.next_competition.competition_date).slice(0,10)}` : '–'],
      ['Mesoziel', context.mesocycle?.primary_adaptation || '–'],
      ['Mikrofokus', context.microcycle?.focus || '–']
    ];
    $('#context').innerHTML = facts.map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    renderDecision(latest.decision);
    $('#history').innerHTML = history.decisions.length ? history.decisions.map(d => `<div class="history-item"><span>${esc(new Date(d.generated_at).toLocaleDateString())}</span><b>${esc(d.safety_state)}</b><span>${esc(d.action.replaceAll('_',' '))} — ${esc(d.rationale)}</span></div>`).join('') : '<p class="muted">Noch keine Entscheidungen.</p>';
    if (checkin.checkin) setMessage('#checkinMessage', 'Morning Check für heute ist gespeichert.');
  } catch (error) {
    document.body.innerHTML = `<main class="shell"><section class="card"><h1>Zugriff nicht möglich</h1><p>${esc(error.message)}</p></section></main>`;
  }
}

$('#checkinForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const f = new FormData(event.currentTarget);
  const number = (name) => f.get(name) === '' ? null : Number(f.get(name));
  const symptoms = String(f.get('illness_symptoms') || '').split(',').map(v=>v.trim()).filter(Boolean);
  try {
    await api('/api/v1/checkins', { method:'POST', body: JSON.stringify({ sleep_duration_min:number('sleep_duration_min'), sleep_quality_1_5:number('sleep_quality_1_5'), fatigue_1_5:number('fatigue_1_5'), soreness_1_5:number('soreness_1_5'), stress_1_5:number('stress_1_5'), motivation_1_5:number('motivation_1_5'), pain_0_10:number('pain_0_10'), pain_locations:[], illness_symptoms:symptoms, objective_metrics:[] }) });
    setMessage('#checkinMessage','Gespeichert. Adaptation wird erst beim expliziten Auswerten/Session-Abschluss angestoßen.');
  } catch (error) { setMessage('#checkinMessage', error.message, false); }
});

$('#sessionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!todaySession) return setMessage('#sessionMessage','Keine geplante Session für heute vorhanden.',false);
  const f = new FormData(event.currentTarget);
  const now = new Date();
  const duration = Number(f.get('duration_min'));
  const started = new Date(now.getTime() - duration * 60000);
  try {
    await api(`/api/v1/sessions/${encodeURIComponent(todaySession.id)}/complete`, { method:'POST', body: JSON.stringify({ started_at: started.toISOString(), completed_at: now.toISOString(), duration_min: duration, session_rpe: Number(f.get('session_rpe')), completion_status: f.get('completion_status'), pain_during: f.get('pain_during') === '' ? null : Number(f.get('pain_during')), pain_after: null, deviations: [] }) });
    const result = await api('/api/v1/adaptation/evaluate', { method:'POST', body:'{}' });
    renderDecision(result.decision);
    setMessage('#sessionMessage','Session gespeichert und Adaptationsentscheidung protokolliert.');
    await load();
  } catch (error) { setMessage('#sessionMessage',error.message,false); }
});

load();
