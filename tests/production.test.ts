import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readlink,
  realpath,
  chmod,
  rm,
  link,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { backupServer, restoreServer } from '../scripts/server-backup.mjs';
import { activateRelease, prepareRelease, verifyRelease } from '../scripts/release.mjs';
import { contentPolicy } from '../server/security.mjs';
import { documentReadiness, issueDocument } from '../src/domain/commercial';
import { createScopeLedgerServer } from '../scripts/serve.mjs';
import { configuration, LicenseService } from '../server/licensing.mjs';
import { createWorkspace, createProject } from '../src/domain/operations';
import { confirmDefaults, defaultsReviewed } from '../src/domain/setup';
import { assertWorkspaceCapacity, workspaceCapacity } from '../src/storage/capacity';
import { parseBackup, serializeWorkspace, MAX_WORKSPACE_BYTES } from '../src/storage/repository';
import { readWorkspaceRoute, workspaceRouteUrl } from '../src/navigation';

const directories: string[] = [];
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), 'scopeledger-production-'));
  directories.push(path);
  return path;
}
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function database() {
  const path = await temporary(),
    secret = randomBytes(32).toString('hex');
  const db = join(path, 'licenses.sqlite'),
    env = join(path, 'server.env');
  const config = configuration({
    NODE_ENV: 'development',
    SCOPELEDGER_MODE: 'local-test',
    SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5173',
    SCOPELEDGER_SESSION_SECRET: secret,
    SCOPELEDGER_DB_PATH: db,
  });
  const service = new LicenseService(config);
  service.seedLocalKey('LOCAL-RECOVERY-QA-KEY-12345', 'agency');
  await writeFile(
    env,
    `SCOPELEDGER_SESSION_SECRET=${secret}\nSCOPELEDGER_DB_PATH=${db}\nSCOPELEDGER_PURCHASES_ENABLED=true\nSCOPELEDGER_LAUNCH_APPROVED=true\n`,
    { mode: 0o600 },
  );
  return { path, db, env, service };
}
describe('production recovery and release safeguards', () => {
  it('serves retained hashed assets after rollback while blocking private hardlink aliases', async () => {
    const path = await temporary(),
      root = join(path, 'public'),
      assets = join(path, 'asset-cache'),
      db = join(assets, 'licenses.sqlite');
    await mkdir(root);
    await mkdir(assets);
    await writeFile(join(assets, 'main-aaaaaaaa.js'), 'retained public asset');
    await writeFile(db, 'private license storage');
    await link(db, join(assets, 'main-private000.js'));
    const server = createScopeLedgerServer({
      directory: root,
      assetDirectory: assets,
      backend: {
        config: { dbPath: db },
        middleware: (_req: any, _res: any, next: () => void) => next(),
        close: () => {},
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const origin = `http://127.0.0.1:${(server.address() as any).port}`;
      const response = await fetch(`${origin}/assets/main-aaaaaaaa.js`);
      expect(await response.text()).toBe('retained public asset');
      expect(response.headers.get('cache-control')).toContain('immutable');
      const privateResponse = await fetch(`${origin}/assets/main-private000.js`);
      expect(privateResponse.status).toBe(404);
      expect(await privateResponse.text()).not.toContain('private license storage');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('backs up an open WAL database, restores its secret and rejects reused destinations', async () => {
    const { path, db, env, service } = await database();
    const device = service.deviceToken();
    await service.activate('LOCAL-RECOVERY-QA-KEY-12345', 'agency', 'Recovery browser', device);
    try {
      await backupServer(db, env, join(path, 'bundle'));
      await expect(backupServer(db, env, join(path, 'bundle'))).rejects.toThrow();
      const restoredDb = join(path, 'restored.sqlite'),
        restoredEnv = join(path, 'restored.env');
      expect(await restoreServer(join(path, 'bundle'), restoredDb, restoredEnv)).toMatchObject({
        status: 'restored',
        purchasesEnabled: false,
      });
      const restored = new DatabaseSync(restoredDb, { readOnly: true });
      try {
        expect(restored.prepare('SELECT count(*) AS n FROM devices WHERE active=1').get()?.n).toBe(
          1,
        );
      } finally {
        restored.close();
      }
      const text = await readFile(restoredEnv, 'utf8');
      expect(text.includes(`SCOPELEDGER_DB_PATH="${await realpath(restoredDb)}"`)).toBe(true);
      await expect(restoreServer(join(path, 'bundle'), restoredDb, restoredEnv)).rejects.toThrow(
        'unused',
      );
    } finally {
      service.close();
    }
  });
  it('rejects a mismatched secret, changed bundle and unsafe input permissions', async () => {
    const { path, db, env, service } = await database();
    try {
      await backupServer(db, env, join(path, 'bundle'));
      await writeFile(join(path, 'bundle/licenses.sqlite'), 'tampered');
      await expect(
        restoreServer(join(path, 'bundle'), join(path, 'never.sqlite'), join(path, 'never.env')),
      ).rejects.toThrow('verification');
      await writeFile(env, `SCOPELEDGER_SESSION_SECRET=${randomBytes(32).toString('hex')}`);
      await expect(backupServer(db, env, join(path, 'wrong-secret'))).rejects.toThrow();
      await chmod(env, 0o644);
      await expect(backupServer(db, env, join(path, 'unsafe'))).rejects.toThrow('mode 600');
    } finally {
      service.close();
    }
  });
  it('switches versions atomically, retains old assets and verifies rollback before changing current', async () => {
    const path = await temporary(),
      source = join(path, 'source'),
      deployment = join(path, 'deployment');
    for (const directory of [
      'dist/home',
      'dist/workspace',
      'dist/assets',
      'scripts',
      'server',
      'shared',
    ])
      await mkdir(join(source, directory), { recursive: true });
    for (const file of [
      'dist/home/index.html',
      'dist/workspace/index.html',
      'scripts/serve.mjs',
      'server/backend.mjs',
      'package.json',
      'package-lock.json',
    ])
      await writeFile(join(source, file), '{}');
    await writeFile(join(source, 'dist/assets/main-aaaaaaaa.js'), 'release A');
    await prepareRelease(source, deployment, 'release-a');
    await activateRelease(deployment, 'release-a');
    await writeFile(join(source, 'dist/assets/main-bbbbbbbb.js'), 'release B');
    const next = await prepareRelease(source, deployment, 'release-b');
    await activateRelease(deployment, 'release-b');
    expect(await readFile(join(next.directory, 'dist/assets/main-aaaaaaaa.js'), 'utf8')).toBe(
      'release A',
    );
    await activateRelease(deployment, 'release-a');
    expect(await readlink(join(deployment, 'current'))).toBe(join('releases', 'release-a'));
    expect(await readFile(join(deployment, 'asset-cache/main-bbbbbbbb.js'), 'utf8')).toBe(
      'release B',
    );
    await writeFile(join(next.directory, 'server/backend.mjs'), 'changed');
    await expect(activateRelease(deployment, 'release-b')).rejects.toThrow('checksum');
    expect(await readlink(join(deployment, 'current'))).toBe(join('releases', 'release-a'));
    await expect(prepareRelease(source, deployment, 'release-a')).rejects.toThrow();
    await expect(verifyRelease(next.directory)).rejects.toThrow();
  });
  it('prunes only expired known counters and sessions without releasing device slots or erasing audit', async () => {
    const { service } = await database();
    try {
      const now = Date.now();
      service.clock = () => now;
      service.db
        .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
        .run('expired', 'license', 'device', now - 1);
      service.db
        .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
        .run('current', 'license', 'device', now + 1000);
      for (const [operation, window] of [
        ['activate', Math.floor(now / 3600000) - 1],
        ['pdf-license', Math.floor(now / 86400000) - 1],
        ['future-operation', 0],
      ])
        service.db
          .prepare('INSERT INTO quotas VALUES(?,?,?,?)')
          .run('subject', operation, window, 1);
      service.pruneExpired();
      expect(service.db.prepare('SELECT token_hash FROM sessions').all()).toEqual([
        { token_hash: 'current' },
      ]);
      expect(service.db.prepare('SELECT operation FROM quotas').all()).toEqual([
        { operation: 'future-operation' },
      ]);
      expect(service.db.prepare('SELECT count(*) AS n FROM licenses').get().n).toBe(1);
    } finally {
      service.close();
    }
  });
  it('health is alive while readiness correctly rejects missing licensing, with no secrets or cookies', async () => {
    const path = await temporary();
    await writeFile(join(path, 'release.json'), JSON.stringify({ id: 'tested-release' }));
    const server = createScopeLedgerServer({ directory: path, readinessProbe: async () => true });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const origin = `http://127.0.0.1:${(server.address() as any).port}`;
      const alive = await fetch(`${origin}/api/health`);
      expect(alive.status).toBe(200);
      expect(await alive.json()).toEqual({ status: 'alive', release: 'tested-release' });
      const ready = await fetch(`${origin}/api/ready`);
      expect(ready.status).toBe(503);
      expect(await ready.json()).toMatchObject({ status: 'not_ready', purchasesEnabled: false });
      expect(ready.headers.get('set-cookie')).toBeNull();
      expect((await fetch(`${origin}/api/health`, { method: 'POST' })).status).toBe(405);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('allows exact inline script hashes and refuses broad script/connection execution', () => {
    const policy = contentPolicy(
      '<script>window.ready=true;</script><script src="/app.js"></script>',
    );
    expect(policy).toContain("script-src 'self' 'sha256-");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain("script-src 'unsafe-inline'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("connect-src 'self'");
  });
});
describe('workspace launch safeguards', () => {
  it('does not silently select another project for a saved document whose source is in Trash', () => {
    const base = createWorkspace();
    const w = issueDocument(base, base.changes[0].id, 'brief', { demo: true });
    w.projects[0].deletedAt = new Date().toISOString();
    const route = readWorkspaceRoute(
      w,
      new URL(`https://scopeledger.site/workspace/?view=documents&document=${w.documents[0].id}`),
    );
    expect(route?.target.view).toBe('projects');
    expect(route?.message).toContain('unavailable');
  });
  it('measures UTF-8 capacity and refuses oversize without changing the previous object', () => {
    const w = createWorkspace(),
      before = serializeWorkspace(w);
    const next = structuredClone(w);
    next.clients[0].notes = '界'.repeat(Math.ceil(MAX_WORKSPACE_BYTES / 3));
    expect(workspaceCapacity(next).bytes).toBeGreaterThan(MAX_WORKSPACE_BYTES);
    expect(() => assertWorkspaceCapacity(next)).toThrow('was not applied');
    expect(serializeWorkspace(w)).toBe(before);
  });
  it('keeps defaults confirmation durable and requires review again after a relevant change', () => {
    const w = confirmDefaults(createWorkspace());
    expect(defaultsReviewed(w.agency)).toBe(true);
    expect(defaultsReviewed(parseBackup(serializeWorkspace(w)).agency)).toBe(true);
    for (const patch of [
      { name: 'My studio' },
      { defaultCurrency: 'GBP' as const },
      { defaultRate: '75' },
      { defaultTarget: '40' },
    ])
      expect(defaultsReviewed({ ...w.agency, ...patch })).toBe(false);
    expect(() =>
      confirmDefaults({ ...w, agency: { ...w.agency, defaultTarget: '100' } }),
    ).toThrow();
  });
  it('requires reviewed defaults for real document issuance while leaving the sample usable', () => {
    let w = createWorkspace();
    const changeId = w.changes[0].id;
    expect(
      documentReadiness(w, changeId, 'brief').some((item) => item.key === 'agency.defaults'),
    ).toBe(false);
    w.projects[0].sample = false;
    expect(
      documentReadiness(w, changeId, 'brief').find((item) => item.key === 'agency.defaults')
        ?.complete,
    ).toBe(false);
    w = confirmDefaults(w);
    expect(
      documentReadiness(w, changeId, 'brief').find((item) => item.key === 'agency.defaults')
        ?.complete,
    ).toBe(true);
  });
  it('resolves links only to matching local records and excludes record names and secrets from URLs', () => {
    const w = createProject(createWorkspace(), {
      name: 'Private client project',
      client: 'Private client',
    });
    const projectId = w.context.projectId,
      changeId = w.context.changeId;
    const url = new URL('http://127.0.0.1/workspace/');
    const href = workspaceRouteUrl(url, { view: 'workspace', projectId, changeId });
    expect(href).not.toContain('Private');
    expect(readWorkspaceRoute(w, new URL(href, url))?.target).toMatchObject({
      projectId,
      changeId,
    });
    expect(readWorkspaceRoute(w, new URL(`${href}&document=unknown`, url))?.target.view).toBe(
      'projects',
    );
    expect(
      readWorkspaceRoute(
        w,
        new URL(`?view=workspace&project=${w.projects[0].id}&change=${changeId}`, url),
      )?.target.view,
    ).toBe('projects');
  });
});
