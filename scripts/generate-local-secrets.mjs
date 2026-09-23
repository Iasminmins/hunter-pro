import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { hashPassword } from '../src/server/password.mjs';

const file = new URL('../.env', import.meta.url);
let existing = '';
try { existing = await readFile(file, 'utf8'); } catch {}
const values = new Map(existing.split(/\r?\n/).filter(line => line && !line.trim().startsWith('#')).map(line => {
  const split = line.indexOf('=');
  return split < 0 ? [line, ''] : [line.slice(0, split), line.slice(split + 1)];
}));
const password = randomBytes(24).toString('base64url');
values.set('APP_PASSWORD', password);
values.set('APP_PASSWORD_HASH', await hashPassword(password));
values.set('SESSION_SECRET', randomBytes(48).toString('base64url'));
const contents = [...values].map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
await writeFile(file, contents, { mode: 0o600 });
process.stdout.write('Credenciais locais geradas em .env (ignoradas pelo Git). O APP_PASSWORD desse arquivo é a senha de login.\n');
