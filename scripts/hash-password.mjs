import { hashPassword } from '../src/server/password.mjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const terminal = createInterface({ input: stdin, output: stdout });
try {
  const password = await terminal.question('Senha do Hunter Pro (mínimo 8 caracteres): ');
  process.stdout.write(`${await hashPassword(password)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
} finally {
  terminal.close();
}
