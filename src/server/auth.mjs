import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifyPassword } from './password.mjs';

const COOKIE_NAME = 'hunter_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const attempts = new Map();

function hmac(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    const error = new Error('Session secret is not configured.');
    error.code = 'CONFIG_MISSING';
    throw error;
  }
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function getCookie(request) {
  const header = request.headers?.cookie || '';
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE_NAME) return value.join('=');
  }
  return '';
}

export function createSessionCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS, nonce: randomBytes(16).toString('base64url') })).toString('base64url');
  const token = `${payload}.${hmac(payload)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function expiredSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function verifySession(request) {
  const token = getCookie(request);
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const expected = Buffer.from(hmac(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isFinite(session.exp) || session.exp <= Date.now() / 1000) return null;
    return { owner: 'owner', expiresAt: session.exp };
  } catch {
    return null;
  }
}

function clientKey(request) {
  const forwarded = request.headers?.['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function allowedAttempt(request) {
  const key = clientKey(request);
  const now = Date.now();
  const previous = attempts.get(key) || { count: 0, since: now };
  if (now - previous.since > 15 * 60_000) {
    attempts.set(key, { count: 1, since: now });
    return true;
  }
  if (previous.count >= 5) return false;
  attempts.set(key, { ...previous, count: previous.count + 1 });
  if (attempts.size > 2000) {
    for (const [ip, record] of attempts) if (now - record.since > 15 * 60_000) attempts.delete(ip);
  }
  return true;
}

export async function login(request, password) {
  if (!allowedAttempt(request)) return false;
  const encoded = process.env.APP_PASSWORD_HASH;
  if (!encoded) {
    const error = new Error('Owner password is not configured.');
    error.code = 'CONFIG_MISSING';
    throw error;
  }
  return typeof password === 'string' && password.length <= 1024 && verifyPassword(password, encoded);
}
