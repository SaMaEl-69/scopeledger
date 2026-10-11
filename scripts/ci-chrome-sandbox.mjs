// GitHub's ephemeral Ubuntu runner only. Keep Chromium's own sandbox enabled.
// Grant user namespaces to the selected executable instead of disabling the
// host's AppArmor restriction or passing --no-sandbox to the renderer.
import assert from 'node:assert/strict';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This setup is restricted to GitHub Actions.');
assert.equal(process.platform, 'linux', 'This setup requires the Linux CI runner.');
const restriction = (
  await readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8')
).trim();
console.log(`AppArmor restrict_unprivileged_userns=${restriction}`);
assert.match(restriction, /^[01]$/, 'Unexpected AppArmor user namespace setting.');
if (restriction === '0') {
  console.log(
    'No AppArmor profile required: the runner does not restrict unprivileged user namespaces.',
  );
} else {
  const chrome = await realpath(process.env.SCOPELEDGER_CHROME_PATH ?? '');
  assert.equal(chrome, await realpath(process.env.PLAYWRIGHT_CHROME_PATH ?? ''));
  assert.match(
    chrome,
    /^\/home\/runner\/\.cache\/ms-playwright\/chromium-\d+\/chrome-linux64\/chrome$/,
    'Only the selected Playwright Chromium executable may receive this profile.',
  );
  const temporaryDirectory = await realpath(process.env.RUNNER_TEMP ?? '');
  assert.match(temporaryDirectory, /^\/home\/runner\/work\/_temp$/);
  const profile = join(temporaryDirectory, 'margvant-ci-chromium.apparmor');
  await writeFile(
    profile,
    `abi <abi/4.0>,\ninclude <tunables/global>\nprofile margvant-ci-chromium "${chrome}" flags=(unconfined) {\n  userns,\n}\n`,
    { mode: 0o600 },
  );
  execFileSync('sudo', ['apparmor_parser', '-r', profile], { stdio: 'inherit' });
  console.log(`Loaded executable-specific user namespace profile: ${chrome}`);
  assert.equal(
    (await readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8')).trim(),
    '1',
    'The host-wide AppArmor restriction must remain enabled.',
  );
}
