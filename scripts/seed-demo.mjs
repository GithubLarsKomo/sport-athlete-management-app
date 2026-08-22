import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';

const config = loadConfig();
const db = createDatabase(config);
const athleteId = config.auth.devUserId || 'demo-athlete';
const now = new Date();
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const plus = (days) => { const d = new Date(now); d.setUTCDate(d.getUTCDate()+days); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
try {
  await db.query('INSERT INTO athletes (id, auth_subject, email, display_name) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name)', [athleteId, athleteId, config.auth.devEmail, config.auth.devName]);
  const seasonId='demo-season', mesoId='demo-meso', microId='demo-micro';
  await db.query('INSERT IGNORE INTO goals (id, athlete_id, goal_type, description, target_date, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?)', ['demo-goal', athleteId, 'performance', 'Improve target competition performance', plus(42), 1, 'active']);
  await db.query('INSERT IGNORE INTO competitions (id, athlete_id, name, competition_date, priority, discipline) VALUES (?, ?, ?, ?, ?, ?)', ['demo-comp', athleteId, 'Target Competition', plus(42), 'A', 'sport-specific']);
  await db.query('INSERT IGNORE INTO seasons (id, athlete_id, name, start_date, end_date, status, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', [seasonId, athleteId, 'Demo season', plus(-21), plus(70), 'active', JSON.stringify({ version: 1 })]);
  await db.query('INSERT IGNORE INTO mesocycles (id, athlete_id, season_id, start_date, end_date, primary_adaptation, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', [mesoId, athleteId, seasonId, plus(-7), plus(21), 'specific performance', JSON.stringify({ version: 1 })]);
  await db.query('INSERT IGNORE INTO microcycles (id, athlete_id, mesocycle_id, start_date, end_date, focus, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', [microId, athleteId, mesoId, plus(-2), plus(5), 'quality + recovery', JSON.stringify({ version: 1 })]);
  const sessionId='demo-session-today';
  const plannedStart = new Date(); plannedStart.setHours(17,0,0,0);
  const payload = { planned_session_id: sessionId, session_type: 'sport', objective: 'Quality session', planned_start: plannedStart.toISOString(), planned_duration_min: 60, planned_rpe: 6, intensity_rule: 'Follow current sport-specific prescription', stop_rule: 'Stop or modify on safety-relevant symptoms', flexibility: 'key', items: [] };
  await db.query('INSERT INTO planned_sessions (id, athlete_id, microcycle_id, local_date, planned_start, session_type, objective, planned_duration_min, planned_rpe, status, version, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE local_date=VALUES(local_date), planned_start=VALUES(planned_start), status="planned", payload_json=VALUES(payload_json)', [sessionId, athleteId, microId, date, plannedStart, 'sport', 'Quality session', 60, 6, 'planned', 1, JSON.stringify(payload)]);
  console.log(`Seeded demo athlete ${athleteId} for ${date}.`);
} finally {
  await db.close();
}
