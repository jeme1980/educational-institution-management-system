import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';

const port = Number(process.env['PORT'] || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT is invalid.');
  process.exitCode = 1;
} else if (process.env['NODE_ENV'] === 'production' &&
  (process.env['MIGRATION_DATABASE_URL'] || process.env['DATABASE_URL'] ||
    !process.env['RLS_RUNTIME_DATABASE_URL'] || !process.env['PLATFORM_DATABASE_URL'] || !process.env['AUTH_RUNTIME_DATABASE_URL'])) {
  console.error('Production API requires restricted runtime URLs and must not receive migration credentials.');
  process.exitCode = 1;
} else {
  const probe = createServer();
  probe.once('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `PORT ${port} is already in use.` : 'API port preflight failed.');
    process.exitCode = 1;
  });
  probe.listen(port, () => {
    probe.close(() => {
      const child = spawn(process.execPath, [join(import.meta.dirname, '../apps/api/dist/server.js')], {
        stdio: 'inherit',
        env: process.env,
        windowsHide: true,
      });
      child.once('error', () => {
        console.error('API process could not start.');
        process.exitCode = 1;
      });
      child.once('exit', (code) => { process.exitCode = code ?? 1; });
      process.once('SIGTERM', () => child.kill('SIGTERM'));
      process.once('SIGINT', () => child.kill('SIGINT'));
    });
  });
}
