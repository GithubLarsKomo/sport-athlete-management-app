const $a = selector => document.querySelector(selector);
let currentHandoff = null;

function targetAthleteId() {
  return new URLSearchParams(window.location.search).get('athlete')?.trim() || '';
}

async function adaptationApi(path, options = {}) {
  const target = targetAthleteId();
  const response = await fetch(path, {
    credentials:'same-origin',
    ...options,
    headers:{
      ...(options.body ? {'content-type':'application/json'} : {}),
      ...(target ? {'x-sam-target-athlete':target} : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(()=>({}));
  if (!response.ok) {
    const details = Array.isArray(body.details) && body.details.length ? `: ${body.details.join('; ')}` : '';
    throw new Error(`${body.error || `HTTP ${response.status}`}${details}`);
  }
  return body;
}

function startOfCurrentWeek() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const local = new Date(monday.getTime() - monday.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,10);
}

function handoffMessage(text, ok=true) {
  const el=$a('#adaptationHandoffMessage');
  if (!el) return;
  el.textContent=text;
  el.className=`message ${ok ? 'ok' : 'error'}`;
}

function proposalTemplate(handoff) {
  return {
    schema_version:1,
    kind:'sport-athlete-adaptation-proposal',
    contract_version:'1.0.0',
    proposal_id:'REPLACE_WITH_EXTERNAL_PROPOSAL_ID',
    athlete_id:handoff.athlete_ref.athlete_id,
    handoff_id:handoff.handoff_id,
    handoff_from:handoff.window.from,
    generated_at:new Date().toISOString(),
    producer:{name:'REPLACE_WITH_PRODUCER',version:'REPLACE_WITH_VERSION'},
    decision_level:'tactical',
    action:'review_required',
    safety_state:'YELLOW',
    trigger:'REPLACE_WITH_TRIGGER',
    rationale:'REPLACE_WITH_RATIONALE',
    confidence:0,
    source_refs:[handoff.handoff_id],
    uncertainties:[],
    safety_flags:[],
    revised_plan:null
  };
}

async function buildHandoff() {
  const from=$a('#adaptationHandoffFrom')?.value;
  if (!from) return handoffMessage('Bitte einen Starttag wählen.',false);
  const button=$a('#buildAdaptationHandoff');
  button.disabled=true;
  try {
    const {handoff}=await adaptationApi(`/api/v1/adaptation/handoff?from=${encodeURIComponent(from)}`);
    currentHandoff=handoff;
    const preview=$a('#adaptationHandoffPreview');
    preview.textContent=JSON.stringify(handoff,null,2);
    preview.classList.remove('hidden');
    $a('#downloadAdaptationHandoff').disabled=false;
    $a('#adaptationHandoffMeta').textContent=`${handoff.window.from} – ${handoff.window.to} · ${handoff.handoff_id} · ${handoff.source_refs.length} Provenienz-Referenzen`;
    const proposal=$a('#adaptationProposalJson');
    if (!proposal.value.trim()) proposal.value=JSON.stringify(proposalTemplate(handoff),null,2);
    handoffMessage('Handoff lokal erzeugt und zur Prüfung angezeigt. Es wurde nichts an einen externen Dienst gesendet.');
  } catch(error) {
    handoffMessage(error.message,false);
  } finally {
    button.disabled=false;
  }
}

function downloadHandoff() {
  if (!currentHandoff) return;
  const content=JSON.stringify(currentHandoff,null,2)+'\n';
  const blob=new Blob([content],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=`sport-athlete-adaptation-handoff-${currentHandoff.window.from}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function importProposal() {
  const textarea=$a('#adaptationProposalJson');
  let proposal;
  try {
    proposal=JSON.parse(textarea.value);
  } catch {
    return handoffMessage('Das Proposal-JSON ist syntaktisch ungültig.',false);
  }
  const button=$a('#importAdaptationProposal');
  button.disabled=true;
  try {
    const result=await adaptationApi('/api/v1/adaptation/proposals',{
      method:'POST',
      body:JSON.stringify(proposal)
    });
    handoffMessage(`Proposal ${result.decision.external_proposal_id || ''} validiert und gespeichert. Der Trainingsplan wurde noch nicht geändert.`);
    window.setTimeout(()=>window.location.reload(),250);
  } catch(error) {
    handoffMessage(error.message,false);
  } finally {
    button.disabled=false;
  }
}

if ($a('#adaptationHandoffCard')) {
  $a('#adaptationHandoffFrom').value=startOfCurrentWeek();
  $a('#buildAdaptationHandoff').addEventListener('click',buildHandoff);
  $a('#downloadAdaptationHandoff').addEventListener('click',downloadHandoff);
  $a('#importAdaptationProposal').addEventListener('click',importProposal);
}
