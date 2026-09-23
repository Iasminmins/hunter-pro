import { createSessionCookie, expiredSessionCookie, login, verifySession } from './auth.mjs';
import { readArea, RevisionConflictError, SchemaUnavailableError, writeArea } from './state-repository.mjs';

const MAX_BODY_BYTES = 4_000_000;
const ALLOWED_AREAS = new Set(['hsg', 'trader']);

function send(response, status, body, headers = {}) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(body));
}

function requestUrl(request) {
  return new URL(request.url || '/', `https://${request.headers?.host || 'localhost'}`);
}

function assertSameOrigin(request) {
  const origin = request.headers?.origin;
  if (!origin) return false;
  const forwardedProto = String(request.headers?.['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = String(request.headers?.['x-forwarded-host'] || request.headers?.host || '').split(',')[0].trim();
  try { return new URL(origin).host === host && new URL(origin).protocol === `${forwardedProto}:`; }
  catch { return false; }
}

async function readBody(request) {
  const declaredLength = Number(request.headers?.['content-length'] || 0);
  if (declaredLength > MAX_BODY_BYTES) throw Object.assign(new Error('Request is too large.'), { code: 'BODY_TOO_LARGE' });
  if (typeof request.body === 'string') return JSON.parse(request.body);
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request is too large.'), { code: 'BODY_TOO_LARGE' });
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safeError(error) {
  if (error.code === 'CONFIG_MISSING') return { status: 503, code: error.code, message: 'Configure as credenciais do servidor antes de conectar o banco.' };
  if (error.code === 'SCHEMA_UNAVAILABLE') return { status: 503, code: error.code, message: 'O schema do Hunter Pro ainda não está disponível no Neon.' };
  if (error.code === 'REVISION_CONFLICT') return { status: 409, code: error.code, message: 'Os dados mudaram em outra sessão. Recarregue antes de salvar.', revision: error.revision };
  if (error.code === 'INVALID_AREA' || error.code === 'BODY_TOO_LARGE') return { status: error.code === 'BODY_TOO_LARGE' ? 413 : 400, code: error.code, message: error.message };
  if (error instanceof SyntaxError) return { status: 400, code: 'INVALID_JSON', message: 'O conteúdo enviado não é um JSON válido.' };
  return { status: 503, code: 'DATABASE_UNAVAILABLE', message: 'Não foi possível conectar ao banco agora. Seus dados locais foram preservados.' };
}

export async function handleApi(request, response) {
  const url = requestUrl(request);
  if (!url.pathname.startsWith('/api/')) return false;
  try {
    const method = String(request.method || 'GET').toUpperCase();
    const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/auth/session' && method === 'GET') {
      return send(response, 200, { authenticated: Boolean(verifySession(request)) });
    }
    if (path === '/api/auth/login' && method === 'POST') {
      if (!assertSameOrigin(request)) return send(response, 403, { code: 'ORIGIN_REJECTED', message: 'Origem da solicitação não permitida.' });
      if (!String(request.headers?.['content-type'] || '').includes('application/json')) return send(response, 415, { code: 'JSON_REQUIRED', message: 'Envie os dados em JSON.' });
      const body = await readBody(request);
      if (!(await login(request, body.password))) return send(response, 401, { code: 'INVALID_CREDENTIALS', message: 'Senha incorreta ou limite de tentativas atingido.' });
      return send(response, 200, { authenticated: true }, { 'Set-Cookie': createSessionCookie() });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      if (!assertSameOrigin(request)) return send(response, 403, { code: 'ORIGIN_REJECTED', message: 'Origem da solicitação não permitida.' });
      return send(response, 200, { authenticated: false }, { 'Set-Cookie': expiredSessionCookie() });
    }

    const match = path.match(/^\/api\/state\/([^/]+)$/);
    if (!match || !['GET', 'PUT'].includes(method)) return send(response, 404, { code: 'NOT_FOUND', message: 'Rota não encontrada.' });
    if (!verifySession(request)) return send(response, 401, { code: 'UNAUTHENTICATED', message: 'Entre novamente para acessar os dados.' });
    const area = decodeURIComponent(match[1]);
    if (!ALLOWED_AREAS.has(area)) return send(response, 400, { code: 'INVALID_AREA', message: 'Área de dados inválida.' });
    if (method === 'GET') return send(response, 200, await readArea(area));
    if (!assertSameOrigin(request)) return send(response, 403, { code: 'ORIGIN_REJECTED', message: 'Origem da solicitação não permitida.' });
    if (!String(request.headers?.['content-type'] || '').includes('application/json')) return send(response, 415, { code: 'JSON_REQUIRED', message: 'Envie os dados em JSON.' });
    const body = await readBody(request);
    if (body.schemaVersion !== 1 || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return send(response, 400, { code: 'INVALID_PAYLOAD', message: 'O estado enviado não é compatível.' });
    }
    if (Buffer.byteLength(JSON.stringify(body.payload), 'utf8') > MAX_BODY_BYTES) return send(response, 413, { code: 'BODY_TOO_LARGE', message: 'Os dados enviados excedem o limite.' });
    if (!Number.isSafeInteger(Number(body.expectedRevision)) || Number(body.expectedRevision) < 0) return send(response, 400, { code: 'INVALID_REVISION', message: 'Revisão inválida.' });
    const result = await writeArea(area, body.payload, Number(body.expectedRevision));
    return send(response, 200, result);
  } catch (error) {
    const failure = safeError(error);
    return send(response, failure.status, failure);
  }
}
