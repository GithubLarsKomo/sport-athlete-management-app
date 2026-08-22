const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
const numberOrNull = (value) => value === '' || value == null ? null : Number(value);

let todaySession = null;
let activeProfile = null;
let latestDecision = null;
let weekStart = startOfWeek(new Date());

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function setMessage(selector, text, ok = true) {
  const el = $(selector);
  el.textContent = text;
  el.className = `message ${ok ? 'ok' : 'error'}`;
}

function localIsoDate(date) {
  const copy = new Date(date);
  const year = copy.getFullYear();
  const month = String(copy.getMonth() + 1).padStart(2, '0');
  const day = String(copy.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  const day = copy.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function shiftWeek(days) {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + days);
  weekStart = next;
  return loadWeek();
}

function formatDate(value, options = { weekday: 'short', day: '2-digit', month: '2-digit' }) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('de-DE', options).format(date);
}

function formValue(form, name, value) {
  const input = form.elements.namedItem(name);
  if (!input) return;
  input.value = value ?? '';
}

function renderProfile(profile) {
  activeProfile = profile;
  const form = $('#profileForm');
  const missing = !profile;
  $('#profileStatus').textContent = missing ? 'Onboarding offen' : `${profile.sport} · ${profile.discipline}`;
  $('#profileStatus').className = `profile-status ${missing ? 'attention' : 'ready'}`;
  $('#profileVersion').textContent = missing ? 'Neu' : `Version ${profile.profile_version}`;
  $('#profileCard').classList.toggle('needs-onboarding', missing);

  if (!profile) return;

  formValue(form, 'sport', profile.sport);
  formValue(form, 'discipline', profile.discipline);
  formValue(form, 'age_band', profile.age_band);
  formValue(form, 'training_age_years', profile.training_age_years);
  formValue(form, 'sessions_per_week', profile.availability?.sessions_per_week);
  formValue(form, 'weekday_minutes', profile.availability?.weekday_minutes);
  formValue(form, 'sex_at_birth', profile.sex_at_birth);
  formValue(form, 'physiology_context', profile.optional_sex_specific_context?.context);
  formValue(form, 'physiology_symptoms', profile.optional_sex_specific_context?.symptoms?.join(', '));
}

function revisionSummary(decision) {
  const command = decision?.revised_plan;
  if (!command || command.entity_type !== 'planned_session' || !command.entity_id || !command.patch) return null;
  const patch = command.patch;
  const lines = [
    ['Session', command.entity_id],
    ['Erwartete Version', command.expected_version],
    ['Neue Dauer', patch.planned_duration_min == null ? null : `${patch.planned_duration_min} min`],
    ['Neue Ziel-RPE', patch.planned_rpe],
    ['Neues Ziel', patch.objective],
    ['Neuer Termin', patch.planned_start ? formatDate(patch.planned_start, { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : null]
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');
  return { command, lines };
}

function renderDecision(decision) {
  latestDecision = decision;
  const badge = $('#statusBadge');
  const box = $('#decision');
  const state = $('#decisionState');
  const applyButton = $('#applyDecision');
  const preview = $('#revisionPreview');

  preview.classList.add('hidden');
  applyButton.classList.add('hidden');
  $('#decisionMessage').textContent = '';

  if (!decision) {
    badge.textContent = 'Kein Entscheid';
    badge.className = 'status neutral';
    box.textContent = 'Noch keine Entscheidung.';
    state.textContent = 'Kein Vorschlag';
    return;
  }

  badge.textContent = `${decision.safety_state} · ${decision.action}`;
  badge.className = `status ${decision.safety_state}`;
  const applied = Boolean(decision.applied_at);
  state.textContent = applied ? `Angewandt ${formatDate(decision.applied_at, { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}` : 'Nicht angewandt';
  state.className = `pill ${applied ? 'applied' : ''}`;

  box.innerHTML = `
    <strong>${esc(String(decision.action || '').replaceAll('_',' '))}</strong>
    <div>${esc(decision.rationale)}</div>
    <p class="muted">Sicherheit: ${esc(decision.safety_state)} · Confidence: ${Math.round((decision.confidence || 0) * 100)}% · ${esc(decision.engine_version || '')}</p>`;

  const revision = revisionSummary(decision);
  if (revision) {
    preview.classList.remove('hidden');
    preview.innerHTML = `<h3>Vorgeschlagene Planänderung</h3><dl class="facts compact">${revision.lines.map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  }

  if (revision && !applied && decision.safety_state !== 'RED') {
    applyButton.classList.remove('hidden');
  }
}

function renderHistory(decisions) {
  $('#history').innerHTML = decisions.length
    ? decisions.map(d => {
        const applied = d.applied_at ? '<span class="mini-state applied">angewandt</span>' : '<span class="mini-state">offen</span>';
        return `<div class="history-item">
          <span>${esc(formatDate(d.generated_at, { day:'2-digit', month:'2-digit', year:'2-digit' }))}</span>
          <b>${esc(d.safety_state)}</b>
          <span>${esc(String(d.action || '').replaceAll('_',' '))} — ${esc(d.rationale)}</span>
          ${applied}
        </div>`;
      }).join('')
    : '<p class="muted">Noch keine Entscheidungen.</p>';
}

function renderWeek(sessions) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  $('#weekRange').textContent = `${formatDate(weekStart, { day:'2-digit', month:'2-digit' })} – ${formatDate(end, { day:'2-digit', month:'2-digit', year:'numeric' })}`;

  if (!sessions.length) {
    $('#weekSessions').innerHTML = '<p class="muted empty-week">Für diesen Zeitraum sind keine Sessions importiert.</p>';
    return;
  }

  $('#weekSessions').innerHTML = sessions.map(session => {
    const statusClass = ['planned','modified','completed','cancelled'].includes(session.status) ? session.status : 'planned';
    return `<article class="session-tile ${esc(statusClass)}">
      <div class="session-date">${esc(formatDate(`${session.local_date}T12:00:00`))}</div>
      <div class="session-body">
        <div class="session-heading">
          <strong>${esc(session.objective)}</strong>
          <span class="mini-state ${esc(statusClass)}">${esc(session.status)}</span>
        </div>
        <p>${esc(session.session_type)} · ${esc(Number(session.planned_duration_min))} min · Ziel-RPE ${esc(session.planned_rpe ?? '–')}</p>
        <span class="version-tag">v${esc(session.version)}</span>
      </div>
    </article>`;
  }).join('');
}

async function loadWeek() {
  try {
    const result = await api(`/api/v1/training/week?from=${encodeURIComponent(localIsoDate(weekStart))}`);
    renderWeek(result.sessions || []);
  } catch (error) {
    $('#weekSessions').innerHTML = `<p class="message error">${esc(error.message)}</p>`;
  }
}

async function load() {
  try {
    const [me, profileResult, context, training, latest, history, checkin] = await Promise.all([
      api('/api/v1/me'),
      api('/api/v1/athlete/profile'),
      api('/api/v1/context'),
      api('/api/v1/training/today'),
      api('/api/v1/adaptation/latest'),
      api('/api/v1/adaptation/history?limit=10'),
      api('/api/v1/checkins/today')
    ]);

    $('#identity').textContent = me.displayName || me.subject;
    renderProfile(profileResult.profile);

    todaySession = training.session;
    $('#sessionTitle').textContent = todaySession ? todaySession.objective : 'Heute keine Einheit geplant';
    $('#sessionMeta').textContent = todaySession
      ? `${todaySession.session_type} · ${Number(todaySession.planned_duration_min)} min · Ziel-RPE ${todaySession.planned_rpe ?? '–'} · v${todaySession.version}`
      : 'Der Mikrozyklus enthält für heute keine aktive Session.';

    const facts = [
      ['Ziel', context.active_goal?.description || '–'],
      ['Wettkampf', context.next_competition ? `${context.next_competition.name} · ${String(context.next_competition.competition_date).slice(0,10)}` : '–'],
      ['Saison', context.season ? `${context.season.name || context.season.id} · v${context.season.version}` : '–'],
      ['Mesoziel', context.mesocycle ? `${context.mesocycle.primary_adaptation} · v${context.mesocycle.version}` : '–'],
      ['Mikrofokus', context.microcycle ? `${context.microcycle.focus} · v${context.microcycle.version}` : '–']
    ];
    $('#context').innerHTML = facts.map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');

    renderDecision(latest.decision);
    renderHistory(history.decisions || []);
    if (checkin.checkin) setMessage('#checkinMessage', 'Morning Check für heute ist gespeichert.');
    await loadWeek();
  } catch (error) {
    document.body.innerHTML = `<main class="shell"><section class="card"><h1>Zugriff nicht möglich</h1><p>${esc(error.message)}</p></section></main>`;
  }
}

$('#profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const f = new FormData(event.currentTarget);
  const physiologyContext = String(f.get('physiology_context') || '').trim();
  const symptoms = String(f.get('physiology_symptoms') || '').split(',').map(v => v.trim()).filter(Boolean);
  const payload = {
    profile_version: activeProfile?.profile_version || 1,
    sport: String(f.get('sport') || '').trim(),
    discipline: String(f.get('discipline') || '').trim(),
    age_band: f.get('age_band'),
    training_age_years: numberOrNull(f.get('training_age_years')),
    sex_at_birth: String(f.get('sex_at_birth') || '') || null,
    availability: {
      sessions_per_week: Number(f.get('sessions_per_week')),
      weekday_minutes: numberOrNull(f.get('weekday_minutes'))
    },
    equipment: activeProfile?.equipment || [],
    performance_history: activeProfile?.performance_history || [],
    health_constraints: activeProfile?.health_constraints || [],
    preferences: activeProfile?.preferences || {},
    optional_sex_specific_context: physiologyContext ? { context: physiologyContext, symptoms } : null
  };

  try {
    const result = await api('/api/v1/athlete/profile', { method:'PUT', body: JSON.stringify(payload) });
    renderProfile(result.profile);
    setMessage('#profileMessage', `Profil Version ${result.profile.profile_version} gespeichert.`);
  } catch (error) {
    setMessage('#profileMessage', error.message, false);
  }
});

$('#checkinForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const f = new FormData(event.currentTarget);
  const number = (name) => numberOrNull(f.get(name));
  const symptoms = String(f.get('illness_symptoms') || '').split(',').map(v=>v.trim()).filter(Boolean);
  try {
    await api('/api/v1/checkins', {
      method:'POST',
      body: JSON.stringify({
        sleep_duration_min:number('sleep_duration_min'),
        sleep_quality_1_5:number('sleep_quality_1_5'),
        fatigue_1_5:number('fatigue_1_5'),
        soreness_1_5:number('soreness_1_5'),
        stress_1_5:number('stress_1_5'),
        motivation_1_5:number('motivation_1_5'),
        pain_0_10:number('pain_0_10'),
        pain_locations:[],
        illness_symptoms:symptoms,
        objective_metrics:[]
      })
    });
    setMessage('#checkinMessage','Gespeichert. Adaptation wird erst beim expliziten Auswerten/Session-Abschluss angestoßen.');
  } catch (error) {
    setMessage('#checkinMessage', error.message, false);
  }
});

$('#sessionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!todaySession) return setMessage('#sessionMessage','Keine geplante Session für heute vorhanden.',false);
  const f = new FormData(event.currentTarget);
  const now = new Date();
  const duration = Number(f.get('duration_min'));
  const started = new Date(now.getTime() - duration * 60000);
  try {
    await api(`/api/v1/sessions/${encodeURIComponent(todaySession.id)}/complete`, {
      method:'POST',
      body: JSON.stringify({
        started_at: started.toISOString(),
        completed_at: now.toISOString(),
        duration_min: duration,
        session_rpe: Number(f.get('session_rpe')),
        completion_status: f.get('completion_status'),
        pain_during: f.get('pain_during') === '' ? null : Number(f.get('pain_during')),
        pain_after: null,
        deviations: []
      })
    });
    const result = await api('/api/v1/adaptation/evaluate', { method:'POST', body:'{}' });
    renderDecision(result.decision);
    setMessage('#sessionMessage','Session gespeichert. Der Adaptationsvorschlag ist protokolliert, aber noch nicht automatisch angewandt.');
    await load();
  } catch (error) {
    setMessage('#sessionMessage',error.message,false);
  }
});

$('#applyDecision').addEventListener('click', async () => {
  const decision = latestDecision;
  const revision = revisionSummary(decision);
  if (!decision || !revision || decision.applied_at) return;

  const patchText = revision.lines.slice(2).map(([k,v]) => `${k}: ${v}`).join('\n');
  const confirmed = window.confirm(`Adaptationsvorschlag auf Session ${revision.command.entity_id} anwenden?\n\n${patchText}\n\nDie Planversion wird auditierbar erhöht.`);
  if (!confirmed) return;

  const button = $('#applyDecision');
  button.disabled = true;
  try {
    const result = await api(`/api/v1/adaptation/${encodeURIComponent(decision.adaptation_decision_id)}/apply`, { method:'POST', body:'{}' });
    setMessage('#decisionMessage', `Angewandt: Session ${result.revision.session_id} v${result.revision.prior_version} → v${result.revision.new_version}.`);
    await load();
  } catch (error) {
    setMessage('#decisionMessage', error.message, false);
  } finally {
    button.disabled = false;
  }
});

$('#weekPrev').addEventListener('click', () => shiftWeek(-7));
$('#weekNext').addEventListener('click', () => shiftWeek(7));
$('#weekToday').addEventListener('click', () => {
  weekStart = startOfWeek(new Date());
  loadWeek();
});

load();
