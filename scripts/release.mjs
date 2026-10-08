import {
  cp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  lstat,
  readlink,
  symlink,
  rename,
  rm,
} from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(id);
const privateReleasePath = (name) =>
  /(^|\/)\.|\.env(?:\.|$)|\.(?:db|sqlite3?|sql|pem|key|p12|pfx|bak)(?:-wal|-shm|-journal)?$/i.test(
    name,
  );
async function files(root, directory = root, installed = false) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (installed && directory === root && entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Release inputs must not contain symbolic links.');
    if (entry.isDirectory()) result.push(...(await files(root, path, installed)));
    else if (entry.isFile()) result.push(relative(root, path).split(sep).join('/'));
    else throw new Error('Release input is not a regular file.');
  }
  return result.sort();
}
export async function stampBuild(directory = 'dist') {
  const root = resolve(directory),
    names = (await files(root)).filter((name) => name !== 'release.json');
  const sha = createHash('sha256');
  for (const name of names) {
    sha.update(name);
    sha.update(await readFile(join(root, name)));
  }
  const id = `${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')}-${sha.digest('hex').slice(0, 12)}`;
  await writeFile(
    join(root, 'release.json'),
    JSON.stringify({ id, builtAt: new Date().toISOString() }) + '\n',
  );
  return id;
}
export async function prepareRelease(source, deployment, id) {
  if (!validId(id)) throw new Error('Invalid release identity.');
  const root = resolve(deployment);
  await mkdir(join(root, 'releases'), { recursive: true });
  const target = join(root, 'releases', id);
  await mkdir(target); // exclusive; a version is immutable
  try {
    for (const name of [
      'dist',
      'server',
      'shared',
      'scripts',
      'package.json',
      'package-lock.json',
    ]) {
      const original = join(resolve(source), name);
      if ((await lstat(original)).isSymbolicLink())
        throw new Error('Release sources must be regular paths.');
      if ((await lstat(original)).isDirectory()) await files(original);
      await cp(original, join(target, name), { recursive: true, errorOnExist: true, force: false });
    }
    // Preserve hashed assets referenced by older open tabs, including after rollback.
    await mkdir(join(root, 'asset-cache'), { recursive: true });
    const assets = join(target, 'dist/assets');
    await mkdir(assets, { recursive: true });
    for (const name of await files(assets)) {
      if (name.includes('/') || !/^[\w.-]+-[\w-]{8,}\.[\w.]+$/.test(name))
        throw new Error('Unexpected build asset name.');
      const bytes = await readFile(join(assets, name)),
        cached = join(root, 'asset-cache', name);
      try {
        if (hash(await readFile(cached)) !== hash(bytes))
          throw new Error('Hashed asset collision.');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await writeFile(cached, bytes, { flag: 'wx' });
      }
    }
    for (const name of await files(join(root, 'asset-cache'))) {
      if (name.includes('/')) throw new Error('Unexpected retained asset path.');
      await cp(join(root, 'asset-cache', name), join(assets, name), { force: false });
    }
    await writeFile(join(target, 'dist/release.json'), JSON.stringify({ id }) + '\n');
    const manifest = {};
    for (const name of await files(target)) {
      if (privateReleasePath(name)) throw new Error('Private file refused in release.');
      manifest[name] = hash(await readFile(join(target, name)));
    }
    await writeFile(join(target, 'manifest.json'), JSON.stringify({ id, files: manifest }) + '\n', {
      flag: 'wx',
    });
    await verifyRelease(target);
    return { id, directory: target };
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}
export async function verifyRelease(target) {
  const root = await lstat(target),
    manifestFile = await lstat(join(target, 'manifest.json'));
  if (
    root.isSymbolicLink() ||
    !root.isDirectory() ||
    !manifestFile.isFile() ||
    manifestFile.isSymbolicLink() ||
    manifestFile.size > 2000000
  )
    throw new Error('Invalid release paths.');
  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
  if (
    !validId(manifest.id) ||
    !manifest.files ||
    typeof manifest.files !== 'object' ||
    Array.isArray(manifest.files) ||
    Object.keys(manifest.files).length > 10000
  )
    throw new Error('Invalid manifest.');
  // npm ci adds only node_modules. Runtime files must match the packaged tree;
  // recursive inventory also refuses symlinks in parent directories.
  const names = (await files(target, target, true)).filter((name) => name !== 'manifest.json');
  if (
    names.length !== Object.keys(manifest.files).length ||
    names.some((name) => !Object.hasOwn(manifest.files, name))
  )
    throw new Error('Release contains unmanifested or missing files.');
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (
      !name ||
      name.length > 500 ||
      privateReleasePath(name) ||
      !/^(?:(?:dist|server|shared|scripts)\/|package(?:-lock)?\.json$)/.test(name) ||
      typeof expected !== 'string' ||
      !/^[a-f0-9]{64}$/.test(expected) ||
      name.includes('\\') ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      !resolve(target, name).startsWith(resolve(target) + sep)
    )
      throw new Error('Invalid manifest path.');
    if (
      (await lstat(join(target, name))).isSymbolicLink() ||
      hash(await readFile(join(target, name))) !== expected
    )
      throw new Error('Release checksum failed.');
  }
  for (const name of [
    'dist/home/index.html',
    'dist/workspace/index.html',
    'scripts/serve.mjs',
    'server/backend.mjs',
  ])
    if (!manifest.files[name]) throw new Error('Release is incomplete.');
  return manifest;
}
export async function activateRelease(deployment, id) {
  if (!validId(id)) throw new Error('Invalid release identity.');
  const root = resolve(deployment),
    target = join(root, 'releases', id),
    lock = join(root, '.release-lock');
  await mkdir(lock); // serialize switching and refuse concurrent deploys
  const temporary = join(root, '.current-next');
  try {
    const manifest = await verifyRelease(target);
    if (manifest.id !== id) throw new Error('Release identity does not match its directory.');
    let previous = null;
    try {
      const current = await lstat(join(root, 'current'));
      if (!current.isSymbolicLink()) throw new Error('Current must be a managed symlink.');
      previous = await readlink(join(root, 'current'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await symlink(join('releases', id), temporary);
    await rename(temporary, join(root, 'current'));
    return { id, previous };
  } finally {
    await rm(temporary, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, first, second, third] = process.argv.slice(2);
    if (operation === 'stamp') console.log(await stampBuild(first));
    else if (operation === 'prepare' && first && second && third)
      console.log(JSON.stringify(await prepareRelease(first, second, third)));
    else if (operation === 'activate' && first && second)
      console.log(JSON.stringify(await activateRelease(first, second)));
    else
      throw new Error(
        'Usage: release.mjs stamp [DIST] | prepare SOURCE DEPLOYMENT ID | activate DEPLOYMENT ID',
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
