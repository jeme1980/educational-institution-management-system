import { execFileSync } from 'node:child_process';
import process from 'node:process';

const port = Number(process.argv[2]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage: node scripts/free-port.mjs <port>');
  process.exit(1);
}

function windowsPids() {
  const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  const pids = new Set();

  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    const localAddress = columns[1];
    const state = columns[3];
    const pid = Number(columns[4]);

    if (
      state === 'LISTENING' &&
      Number.isInteger(pid) &&
      (localAddress?.endsWith(`:${port}`) || localAddress?.endsWith(`]:${port}`))
    ) {
      pids.add(pid);
    }
  }

  return pids;
}

function unixPids() {
  try {
    const output = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
    return new Set(output.split(/\r?\n/).map(Number).filter(Number.isInteger));
  } catch {
    return new Set();
  }
}

const pids = process.platform === 'win32' ? windowsPids() : unixPids();

for (const pid of pids) {
  if (pid === process.pid) continue;

  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    console.log(`Freed port ${port} (stopped process ${pid}).`);
  } catch {
    // The process may have exited between discovery and termination.
  }
}
