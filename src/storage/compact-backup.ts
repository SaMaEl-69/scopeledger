import { MAX_WORKSPACE_BYTES } from './limits';
const FORMAT = 'scopeledger-compact-backup';
const imageKeys = new Set(['logoDataUrl', 'imageDataUrl']);
const imagePattern = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const size = (value: string) => new TextEncoder().encode(value).byteLength;

/** Save each image once; restored snapshots retain their original embedded images. */
export function compactBackup(raw: string): string {
  let workspace: unknown;
  try {
    workspace = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (
    !workspace ||
    typeof workspace !== 'object' ||
    !('schemaVersion' in workspace) ||
    workspace.schemaVersion !== 3
  )
    return raw;
  try {
    const images: string[] = [],
      ids = new Map<string, number>();
    const packed = JSON.parse(
      JSON.stringify(workspace, (key, value) => {
        if (!imageKeys.has(key) || typeof value !== 'string' || !imagePattern.test(value))
          return value;
        let index = ids.get(value);
        if (index === undefined) {
          index = images.length;
          images.push(value);
          ids.set(value, index);
        }
        return { $scopeledgerImage: index };
      }),
    );
    if (!images.length) return raw;
    const output = JSON.stringify({ format: FORMAT, version: 1, images, workspace: packed });
    return size(output) < size(raw) ? output : raw;
  } catch {
    // An unreadable recovery copy must remain exportable in its original form.
    return raw;
  }
}

export function expandCompactBackup(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== FORMAT)
    return value;
  const envelope = value as Record<string, unknown>;
  const invalid = () => {
    throw new Error('This compact backup is malformed. Your workspace is untouched.');
  };
  if (
    Object.keys(envelope).sort().join(',') !== 'format,images,version,workspace' ||
    envelope.version !== 1 ||
    !Array.isArray(envelope.images) ||
    envelope.images.length > 10000
  )
    return invalid();
  const images = envelope.images;
  for (const image of images)
    if (typeof image !== 'string' || image.length > 700000 || !imagePattern.test(image))
      return invalid();
  if (
    !envelope.workspace ||
    typeof envelope.workspace !== 'object' ||
    Array.isArray(envelope.workspace)
  )
    return invalid();
  let expandedBytes = size(JSON.stringify(envelope.workspace));
  const used = new Set<number>();
  const visit = (object: Record<string, unknown> | unknown[], depth: number) => {
    if (depth > 32) return invalid();
    for (const [key, child] of Object.entries(object)) {
      if (!child || typeof child !== 'object') continue;
      if ('$scopeledgerImage' in child) {
        const ref = child as Record<string, unknown>,
          index = ref.$scopeledgerImage;
        if (
          !imageKeys.has(key) ||
          Object.keys(ref).length !== 1 ||
          typeof index !== 'number' ||
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= images.length
        )
          return invalid();
        expandedBytes += JSON.stringify(images[index]).length - JSON.stringify(ref).length;
        if (expandedBytes > MAX_WORKSPACE_BYTES)
          throw new Error(
            'Expanded backup exceeds the 50 MiB workspace limit. Your workspace is untouched.',
          );
        used.add(index);
        Object.defineProperty(object, key, {
          value: images[index],
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else visit(child as Record<string, unknown>, depth + 1);
    }
  };
  visit(envelope.workspace as Record<string, unknown>, 0);
  if (used.size !== images.length) return invalid();
  return envelope.workspace;
}
