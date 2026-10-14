import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Report only: preserve failed test results and never infer that an empty
// kernel log proves a native browser process did not crash.
const output = resolve('output/ci-browser-kernel/report.json');
const args = ['-n', 'dmesg', '--ctime', '--color=never'];
const command = 'sudo ' + args.join(' ');
const result = spawnSync('sudo', args, {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
const processName = /WebKit|ThreadedComposi(?:tor)?|MiniBrowser|firefox/i;
const fault =
  /segfault|trap|general protection|oom|out of memory|killed process|core dumped|fatal|aborted/i;
const lines = (result.stdout ?? '')
  .split('\n')
  .filter((line) => processName.test(line) && fault.test(line));
const report = {
  capturedAt: new Date().toISOString(),
  reportOnly: true,
  command,
  status: result.status,
  signal: result.signal,
  error: result.error?.message ?? null,
  stderr: result.stderr ?? '',
  matchingKernelLines: lines,
  unverified: [
    ...(result.status === 0
      ? []
      : ['Kernel evidence was unavailable; the command status/error is retained.']),
    'An empty kernel result does not establish that no native browser crashed.',
    'Process identity and causality require correlation with the browser logs.',
  ],
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
console.log('$ ' + command);
if (report.stderr) process.stderr.write(report.stderr);
if (report.error) console.error(report.error);
console.log(JSON.stringify(report));
