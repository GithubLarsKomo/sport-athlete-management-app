import { timingSafeEqual } from 'node:crypto';

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

function header(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function resolveIdentity(req, config) {
  if (config.auth.mode === 'dev') {
    if (config.nodeEnv === 'production') return null;
    return {
      subject: config.auth.devUserId,
      athleteId: config.auth.devUserId,
      email: config.auth.devEmail || null,
      displayName: config.auth.devName || config.auth.devUserId
    };
  }

  if (config.auth.mode !== 'proxy') return null;
  const presented = header(req, config.auth.sharedSecretHeader);
  if (!safeEqual(presented, config.auth.sharedSecret)) return null;
  const subject = String(header(req, config.auth.subjectHeader) || '').trim();
  if (!subject) return null;
  return {
    subject,
    athleteId: subject,
    email: String(header(req, config.auth.emailHeader) || '').trim() || null,
    displayName: String(header(req, config.auth.nameHeader) || '').trim() || subject
  };
}
