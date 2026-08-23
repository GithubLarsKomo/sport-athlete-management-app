import { createHash } from 'node:crypto';

const ROWING_TYPES = new Set(['rowing', 'indoor_rowing', 'rower', 'dynamic', 'slides']);
const ERG_PROVIDERS = new Set(['concept2', 'rp3']);

function number(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = number(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function iso(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string' || !value.trim()) return null;
  const direct = new Date(value);
  if (Number.isFinite(direct.getTime())) return direct.toISOString();
  return null;
}

function c2Date(result) {
  if (result.date_utc) return iso(`${String(result.date_utc).replace(' ', 'T')}Z`);
  if (result.date) return iso(`${String(result.date).replace(' ', 'T')}Z`);
  return null;
}

function endFrom(startedAt, durationS) {
  if (!startedAt || durationS == null) return null;
  return new Date(new Date(startedAt).getTime() + durationS * 1000).toISOString();
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function activityTypeFromSport(sport, subSport) {
  const s = String(sport || '').toLowerCase();
  const sub = String(subSport || '').toLowerCase();
  if (sub.includes('indoor') && s.includes('row')) return 'indoor_rowing';
  if (s === 'rowing' || s === 'rower') return 'rowing';
  if (s === 'cycling' || s === 'bike') return 'cycling';
  if (s === 'running') return 'running';
  if (s === 'swimming') return 'swimming';
  return s || 'other';
}

export function normalizeConcept2Result(result) {
  if (!result || typeof result !== 'object') throw Object.assign(new Error('invalid_concept2_result'), { statusCode: 400 });
  if (result.id == null) throw Object.assign(new Error('concept2_result_id_required'), { statusCode: 400 });
  const startedAt = c2Date(result);
  const durationS = number(result.time) == null ? null : Number(result.time) / 10;
  const distanceM = number(result.distance);
  const heart = result.heart_rate || {};
  const intervals = result.workout?.intervals || result.workout?.splits || [];
  return {
    provider: 'concept2',
    externalActivityId: String(result.id),
    activityType: ROWING_TYPES.has(String(result.type || '').toLowerCase()) ? 'indoor_rowing' : activityTypeFromSport(result.type),
    startedAt,
    endedAt: endFrom(startedAt, durationS),
    durationS,
    distanceM,
    rawSha256: sha256(stableJson(result)),
    summary: {
      duration_s: durationS,
      distance_m: distanceM,
      avg_hr_bpm: firstNumber(heart.average, result.average_heart_rate),
      max_hr_bpm: firstNumber(heart.maximum, result.max_heart_rate),
      avg_power_w: firstNumber(result.average_watts, result.avg_watts, result.watts),
      stroke_rate_spm: firstNumber(result.stroke_rate),
      stroke_count: firstNumber(result.stroke_count),
      drag_factor: firstNumber(result.drag_factor),
      calories: firstNumber(result.calories_total),
      workout_type: result.workout_type || null,
      source_label: result.source || null
    },
    intervals: Array.isArray(intervals) ? intervals : [],
    samples: [],
    rawPayload: result
  };
}

function xmlText(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : null;
}

function allXml(xml, tag) {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...String(xml).matchAll(regex)].map(match => match[1]);
}

export function normalizeTcx(text, provider = 'garmin', filename = 'activity.tcx') {
  if (!['garmin', 'rp3'].includes(provider)) throw Object.assign(new Error('unsupported_tcx_provider'), { statusCode: 400 });
  const xml = String(text || '');
  if (!/<TrainingCenterDatabase[\s>]/i.test(xml)) throw Object.assign(new Error('invalid_tcx'), { statusCode: 400 });
  const id = xmlText(xml, 'Id');
  const laps = allXml(xml, 'Lap');
  const firstLap = laps[0] || xml;
  const startedAt = iso(id) || iso((firstLap.match(/StartTime="([^"]+)"/i) || [])[1]);
  const durationS = allXml(xml, 'TotalTimeSeconds').reduce((sum, value) => sum + (number(value) || 0), 0) || null;
  const distanceM = allXml(xml, 'DistanceMeters').reduce((sum, value) => sum + (number(value) || 0), 0) || null;
  const avgHr = firstNumber(xmlText(firstLap, 'AverageHeartRateBpm'), xmlText(xml, 'AverageHeartRateBpm'));
  const maxHr = firstNumber(xmlText(firstLap, 'MaximumHeartRateBpm'), xmlText(xml, 'MaximumHeartRateBpm'));
  const cadenceValues = allXml(xml, 'Cadence').map(number).filter(value => value != null);
  const wattsValues = [...xml.matchAll(/<(?:ns3:)?Watts>([^<]+)<\/(?:ns3:)?Watts>/gi)].map(match => number(match[1])).filter(value => value != null);
  const sport = (xml.match(/<Activity\s+Sport="([^"]+)"/i) || [])[1] || (provider === 'rp3' ? 'rowing' : 'other');
  return {
    provider,
    externalActivityId: id || `${filename}:${sha256(xml).slice(0, 20)}`,
    activityType: provider === 'rp3' ? 'indoor_rowing' : activityTypeFromSport(sport),
    startedAt,
    endedAt: endFrom(startedAt, durationS),
    durationS,
    distanceM,
    rawSha256: sha256(xml),
    summary: {
      duration_s: durationS,
      distance_m: distanceM,
      avg_hr_bpm: avgHr,
      max_hr_bpm: maxHr,
      avg_power_w: wattsValues.length ? wattsValues.reduce((a, b) => a + b, 0) / wattsValues.length : null,
      max_power_w: wattsValues.length ? Math.max(...wattsValues) : null,
      stroke_rate_spm: cadenceValues.length ? cadenceValues.reduce((a, b) => a + b, 0) / cadenceValues.length : null,
      source_format: 'tcx'
    },
    intervals: laps.map((lap, index) => ({
      index,
      time_s: number(xmlText(lap, 'TotalTimeSeconds')),
      distance_m: number(xmlText(lap, 'DistanceMeters')),
      avg_hr_bpm: number(xmlText(lap, 'AverageHeartRateBpm')),
      max_hr_bpm: number(xmlText(lap, 'MaximumHeartRateBpm')),
      cadence: number(xmlText(lap, 'Cadence'))
    })),
    samples: [],
    rawPayload: { filename, format: 'tcx', id, lap_count: laps.length }
  };
}

function detectDelimiter(line) {
  const semicolons = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function parseCsvLine(line, delimiter) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { out.push(current.trim()); current = ''; }
    else current += char;
  }
  out.push(current.trim());
  return out;
}

function keyMap(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) result[String(key).toLowerCase().replace(/[^a-z0-9]/g, '')] = value;
  return result;
}

function pick(row, aliases) {
  const normalized = keyMap(row);
  for (const alias of aliases) {
    const key = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized[key] != null && normalized[key] !== '') return normalized[key];
  }
  return null;
}

export function normalizeRp3Csv(text, filename = 'rp3.csv') {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw Object.assign(new Error('invalid_rp3_csv'), { statusCode: 400 });
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map(line => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line, delimiter)[index] ?? ''])));
  const first = rows[0];
  const last = rows.at(-1);
  const timestamp = pick(first, ['timestamp', 'timeStamp', 'dateTime', 'datetime', 'date']);
  const startedAt = iso(timestamp);
  const elapsedValues = rows.map(row => number(pick(row, ['elapsedTime', 'time', 'seconds', 'timeSeconds']))).filter(value => value != null);
  const distanceValues = rows.map(row => number(pick(row, ['distance', 'distanceMeters', 'meters']))).filter(value => value != null);
  const durationS = elapsedValues.length ? Math.max(...elapsedValues) - Math.min(...elapsedValues) : null;
  const distanceM = distanceValues.length ? Math.max(...distanceValues) - Math.min(...distanceValues) : null;
  const samples = rows.slice(0, 20000).map((row, index) => ({
    index,
    elapsed_s: number(pick(row, ['elapsedTime', 'time', 'seconds', 'timeSeconds'])),
    distance_m: number(pick(row, ['distance', 'distanceMeters', 'meters'])),
    power_w: number(pick(row, ['power', 'watts', 'watt'])),
    stroke_rate_spm: number(pick(row, ['strokeRate', 'spm', 'strokeRateSPM'])),
    heart_rate_bpm: number(pick(row, ['heartRate', 'hr', 'bpm'])),
    drive_time_s: number(pick(row, ['driveTime', 'driveTimeSeconds'])),
    recovery_time_s: number(pick(row, ['recoveryTime', 'recoveryTimeSeconds'])),
    stroke_length_m: number(pick(row, ['strokeLength', 'strokeLengthMeters']))
  }));
  const values = key => samples.map(sample => sample[key]).filter(value => value != null);
  const average = key => { const v = values(key); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return {
    provider: 'rp3',
    externalActivityId: `${filename}:${sha256(String(text)).slice(0, 20)}`,
    activityType: 'indoor_rowing',
    startedAt,
    endedAt: endFrom(startedAt, durationS),
    durationS,
    distanceM,
    rawSha256: sha256(String(text)),
    summary: {
      duration_s: durationS,
      distance_m: distanceM,
      avg_hr_bpm: average('heart_rate_bpm'),
      avg_power_w: average('power_w'),
      max_power_w: values('power_w').length ? Math.max(...values('power_w')) : null,
      stroke_rate_spm: average('stroke_rate_spm'),
      source_format: 'csv',
      row_count: rows.length
    },
    intervals: [],
    samples,
    rawPayload: { filename, format: 'csv', headers, first_row: first, last_row: last }
  };
}

function findDeepObject(root) {
  if (!root || typeof root !== 'object') return {};
  const candidates = [root, root.workout, root.session, root.summary, root.result, root.data].filter(value => value && typeof value === 'object' && !Array.isArray(value));
  return Object.assign({}, ...candidates.reverse());
}

export function normalizeRp3Json(value, filename = 'rp3.json') {
  const root = typeof value === 'string' ? JSON.parse(value) : value;
  if (!root || typeof root !== 'object') throw Object.assign(new Error('invalid_rp3_json'), { statusCode: 400 });
  const flat = findDeepObject(root);
  const startedAt = iso(pick(flat, ['startedAt', 'startTime', 'dateTime', 'timestamp', 'date']));
  const durationS = firstNumber(pick(flat, ['durationS', 'durationSeconds', 'elapsedTime', 'totalTime', 'time']));
  const distanceM = firstNumber(pick(flat, ['distanceM', 'distanceMeters', 'distance', 'meters']));
  const strokes = [root.strokes, root.strokeData, root.data?.strokes, root.workout?.strokes].find(Array.isArray) || [];
  const intervals = [root.intervals, root.splits, root.workout?.intervals, root.workout?.splits].find(Array.isArray) || [];
  return {
    provider: 'rp3',
    externalActivityId: String(pick(flat, ['id', 'workoutId', 'sessionId', 'uuid']) || `${filename}:${sha256(stableJson(root)).slice(0, 20)}`),
    activityType: 'indoor_rowing',
    startedAt,
    endedAt: endFrom(startedAt, durationS),
    durationS,
    distanceM,
    rawSha256: sha256(stableJson(root)),
    summary: {
      duration_s: durationS,
      distance_m: distanceM,
      avg_hr_bpm: firstNumber(pick(flat, ['averageHeartRate', 'avgHeartRate', 'heartRateAvg'])),
      max_hr_bpm: firstNumber(pick(flat, ['maxHeartRate', 'heartRateMax'])),
      avg_power_w: firstNumber(pick(flat, ['averagePower', 'avgPower', 'powerAvg', 'watts'])),
      max_power_w: firstNumber(pick(flat, ['maxPower', 'powerMax'])),
      stroke_rate_spm: firstNumber(pick(flat, ['strokeRate', 'averageStrokeRate', 'avgStrokeRate', 'spm'])),
      source_format: 'json',
      stroke_count: strokes.length || firstNumber(pick(flat, ['strokeCount', 'strokes']))
    },
    intervals: intervals.slice(0, 1000),
    samples: strokes.slice(0, 20000),
    rawPayload: root
  };
}

function arrayByName(messages, fragment) {
  for (const [key, value] of Object.entries(messages || {})) {
    if (Array.isArray(value) && key.toLowerCase().includes(fragment)) return value;
  }
  return [];
}

function positionDegrees(value) {
  const parsed = number(value);
  if (parsed == null) return null;
  return Math.abs(parsed) <= 180 ? parsed : parsed * (180 / 2147483648);
}

export async function normalizeGarminFit(base64, filename = 'activity.fit') {
  const bytes = Buffer.from(String(base64 || ''), 'base64');
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw Object.assign(new Error('invalid_fit_size'), { statusCode: 400 });
  const { Decoder, Stream } = await import('@garmin/fitsdk');
  const stream = Stream.fromBuffer(bytes);
  if (!Decoder.isFIT(stream)) throw Object.assign(new Error('invalid_fit'), { statusCode: 400 });
  const decoder = new Decoder(stream);
  const decoded = decoder.read({ mergeHeartRates: true, convertDateTimesToDates: true });
  if (decoded.errors?.length) throw Object.assign(new Error(`fit_decode_failed:${decoded.errors[0]}`), { statusCode: 400 });
  const sessions = arrayByName(decoded.messages, 'session');
  const records = arrayByName(decoded.messages, 'record');
  const laps = arrayByName(decoded.messages, 'lap');
  const fileIds = arrayByName(decoded.messages, 'fileid');
  const session = sessions[0] || {};
  const firstRecord = records[0] || {};
  const lastRecord = records.at(-1) || {};
  const startedAt = iso(session.startTime) || iso(firstRecord.timestamp) || iso(fileIds[0]?.timeCreated);
  const durationS = firstNumber(session.totalTimerTime, session.totalElapsedTime, startedAt && iso(lastRecord.timestamp) ? (new Date(lastRecord.timestamp) - new Date(startedAt)) / 1000 : null);
  const distanceM = firstNumber(session.totalDistance, lastRecord.distance);
  const step = Math.max(1, Math.ceil(records.length / 5000));
  const samples = records.filter((_, index) => index % step === 0).map((record, index) => ({
    index: index * step,
    elapsed_ms: startedAt && iso(record.timestamp) ? new Date(record.timestamp).getTime() - new Date(startedAt).getTime() : null,
    heart_rate_bpm: number(record.heartRate),
    power_w: number(record.power),
    cadence: firstNumber(record.cadence, record.fractionalCadence),
    speed_mps: number(record.speed),
    distance_m: number(record.distance),
    latitude: positionDegrees(record.positionLat),
    longitude: positionDegrees(record.positionLong)
  }));
  const activityType = activityTypeFromSport(session.sport, session.subSport);
  const external = [fileIds[0]?.serialNumber, fileIds[0]?.timeCreated instanceof Date ? fileIds[0].timeCreated.toISOString() : fileIds[0]?.timeCreated, startedAt].filter(Boolean).join(':');
  return {
    provider: 'garmin',
    externalActivityId: external || `${filename}:${sha256(bytes).slice(0, 20)}`,
    activityType,
    startedAt,
    endedAt: endFrom(startedAt, durationS) || iso(lastRecord.timestamp),
    durationS,
    distanceM,
    rawSha256: sha256(bytes),
    summary: {
      duration_s: durationS,
      distance_m: distanceM,
      avg_hr_bpm: firstNumber(session.avgHeartRate),
      max_hr_bpm: firstNumber(session.maxHeartRate),
      avg_power_w: firstNumber(session.avgPower),
      max_power_w: firstNumber(session.maxPower),
      stroke_rate_spm: firstNumber(session.avgCadence),
      calories: firstNumber(session.totalCalories),
      total_ascent_m: firstNumber(session.totalAscent),
      sport: session.sport || null,
      sub_sport: session.subSport || null,
      source_format: 'fit'
    },
    intervals: laps.slice(0, 1000),
    samples,
    rawPayload: { filename, format: 'fit', file_id: fileIds[0] || null, session, lap_count: laps.length, record_count: records.length }
  };
}

export async function normalizeFileImport({ provider, format, filename, content, content_base64 }) {
  const p = String(provider || '').toLowerCase();
  const f = String(format || '').toLowerCase();
  if (p === 'garmin' && f === 'fit') return normalizeGarminFit(content_base64, filename);
  if ((p === 'garmin' || p === 'rp3') && f === 'tcx') return normalizeTcx(content, p, filename);
  if (p === 'rp3' && f === 'json') return normalizeRp3Json(content, filename);
  if (p === 'rp3' && f === 'csv') return normalizeRp3Csv(content, filename);
  throw Object.assign(new Error('unsupported_activity_import_format'), { statusCode: 400 });
}

function compatibleType(a, b) {
  if (a === b) return 1;
  if (ROWING_TYPES.has(String(a)) && ROWING_TYPES.has(String(b))) return 0.95;
  return 0;
}

function ratioScore(a, b, tolerance) {
  if (a == null || b == null) return 0.5;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.max(0, 1 - Math.abs(a - b) / (scale * tolerance));
}

export function matchActivity(candidate, incoming) {
  const typeScore = compatibleType(candidate.activity_type || candidate.activityType, incoming.activityType);
  if (!typeScore) return { score: 0, classification: 'new' };
  const startA = new Date(candidate.started_at || candidate.startedAt).getTime();
  const startB = new Date(incoming.startedAt).getTime();
  if (!Number.isFinite(startA) || !Number.isFinite(startB)) return { score: 0, classification: 'new' };
  const startDiffS = Math.abs(startA - startB) / 1000;
  if (startDiffS > 15 * 60) return { score: 0, classification: 'new' };
  const startScore = Math.max(0, 1 - startDiffS / 180);
  const durationA = number(candidate.duration_s ?? candidate.durationS);
  const durationB = number(incoming.durationS);
  const durationScore = ratioScore(durationA, durationB, 0.12);
  const distanceA = number(candidate.distance_m ?? candidate.distanceM);
  const distanceB = number(incoming.distanceM);
  const distanceScore = ratioScore(distanceA, distanceB, 0.08);
  const endA = candidate.ended_at ? new Date(candidate.ended_at).getTime() : (durationA != null ? startA + durationA * 1000 : startA);
  const endB = incoming.endedAt ? new Date(incoming.endedAt).getTime() : (durationB != null ? startB + durationB * 1000 : startB);
  const overlapMs = Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  const shorterMs = Math.max(1, Math.min(Math.max(endA - startA, 1), Math.max(endB - startB, 1)));
  const overlapScore = Math.min(1, overlapMs / shorterMs);
  const score = typeScore * 0.05 + startScore * 0.30 + overlapScore * 0.30 + durationScore * 0.20 + distanceScore * 0.15;
  const complementary = ERG_PROVIDERS.has(String(candidate.canonical_source || candidate.canonicalSource)) !== ERG_PROVIDERS.has(incoming.provider)
    && ROWING_TYPES.has(String(incoming.activityType));
  const autoThreshold = complementary ? 0.82 : 0.90;
  return { score: Math.round(score * 10000) / 10000, classification: score >= autoThreshold ? 'auto_merge' : score >= 0.70 ? 'review' : 'new' };
}

function sourceValue(sources, providers, field) {
  for (const provider of providers) {
    const source = sources.find(item => item.provider === provider && item.summary?.[field] != null);
    if (source) return source.summary[field];
  }
  return null;
}

export function canonicalFromSources(sources, activityType = 'other') {
  const rows = Array.isArray(sources) ? sources : [];
  const indoorRowing = activityType === 'indoor_rowing';
  const primaryOrder = indoorRowing ? ['concept2', 'rp3', 'garmin', 'manual'] : ['garmin', 'concept2', 'rp3', 'manual'];
  const primary = primaryOrder.find(provider => rows.some(source => source.provider === provider)) || rows[0]?.provider || null;
  const ergFirst = indoorRowing ? ['concept2', 'rp3', 'garmin', 'manual'] : primaryOrder;
  const hrFirst = ['garmin', 'concept2', 'rp3', 'manual'];
  return {
    canonicalSource: primary,
    summary: {
      duration_s: sourceValue(rows, ergFirst, 'duration_s'),
      distance_m: sourceValue(rows, ergFirst, 'distance_m'),
      avg_power_w: sourceValue(rows, ergFirst, 'avg_power_w'),
      max_power_w: sourceValue(rows, ergFirst, 'max_power_w'),
      stroke_rate_spm: sourceValue(rows, ergFirst, 'stroke_rate_spm'),
      drag_factor: sourceValue(rows, ['concept2', 'rp3', 'garmin'], 'drag_factor'),
      avg_hr_bpm: sourceValue(rows, hrFirst, 'avg_hr_bpm'),
      max_hr_bpm: sourceValue(rows, hrFirst, 'max_hr_bpm'),
      calories: sourceValue(rows, hrFirst, 'calories'),
      total_ascent_m: sourceValue(rows, ['garmin'], 'total_ascent_m'),
      providers: rows.map(source => source.provider).filter((value, index, all) => all.indexOf(value) === index)
    }
  };
}
