import { test as base, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuration, LicenseService } from '../../server/licensing.mjs';
import { createBackend } from '../../server/backend.mjs';
import { createScopeLedgerServer } from '../../scripts/serve.mjs';

type LocalApp = { origin: string; keys: { individual: string; agency: string } };

// Each engine gets a real, isolated development backend. Sharing the owner's
// server would consume its persisted IP quota and make repeated runs unreliable.
export const test = base.extend<{}, { localApp: LocalApp }>({
  localApp: [
    async ({}, use) => {
      if (process.env.NODE_ENV === 'production')
        throw new Error('Generated-key browser tests cannot run in production.');
      const directory = await mkdtemp(join(tmpdir(), 'scopeledger-browser-qa-'));
      const config = configuration({
        NODE_ENV: 'development',
        SCOPELEDGER_MODE: 'local-test',
        SCOPELEDGER_ORIGIN: 'http://127.0.0.1:5180',
        SCOPELEDGER_SESSION_SECRET: randomBytes(32).toString('hex'),
        SCOPELEDGER_DB_PATH: join(directory, 'licenses.sqlite'),
      });
      const service = new LicenseService(config);
      const keys = {
        individual: `LOCAL-BROWSER-${randomBytes(24).toString('hex')}`,
        agency: `LOCAL-BROWSER-${randomBytes(24).toString('hex')}`,
      };
      service.seedLocalKey(keys.individual, 'individual');
      service.seedLocalKey(keys.agency, 'agency');
      const server = createScopeLedgerServer({ backend: createBackend({ config, service }) });
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('Local test server unavailable.');
        config.origin = `http://127.0.0.1:${address.port}`;
        await use({ origin: config.origin, keys });
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(directory, { recursive: true, force: true });
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ localApp }, use) => use(localApp.origin),
});

export { expect };
