import { signatureUploadDimensions } from '../../shared/client-document.mjs';

export const IMAGE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp';
export const IMAGE_UPLOAD_FORMATS = 'PNG, JPEG, WebP, GIF, AVIF or BMP';

/** Inspect dimensions before decoding; imported images become static, local PNGs. */
export function uploadImageDimensions(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, count: number) =>
    String.fromCharCode(...bytes.slice(start, start + count));
  const invalid = () => {
    throw new Error('The file contents do not match a supported image.');
  };
  let width = 0,
    height = 0;
  if (mime === 'image/png' || mime === 'image/jpeg') {
    try {
      return signatureUploadDimensions(bytes, mime);
    } catch (reason) {
      if (reason instanceof Error && /dimensions/.test(reason.message)) throw reason;
      return invalid();
    }
  }
  if (mime === 'image/gif') {
    if (bytes.length < 13 || !['GIF87a', 'GIF89a'].includes(text(0, 6))) return invalid();
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
  } else if (mime === 'image/bmp') {
    if (bytes.length < 26 || text(0, 2) !== 'BM') return invalid();
    const header = view.getUint32(14, true);
    if (header === 12) {
      width = view.getUint16(18, true);
      height = view.getUint16(20, true);
    } else if (header >= 40 && bytes.length >= 54) {
      width = view.getInt32(18, true);
      height = Math.abs(view.getInt32(22, true));
    } else return invalid();
  } else if (mime === 'image/webp') {
    if (bytes.length < 30 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP') return invalid();
    const chunk = text(12, 4);
    const uint24 = (offset: number) =>
      bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    if (chunk === 'VP8X') {
      width = uint24(24) + 1;
      height = uint24(27) + 1;
    } else if (chunk === 'VP8L' && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (chunk === 'VP8 ' && text(23, 3) === '\x9d\x01\x2a') {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else return invalid();
  } else if (mime === 'image/avif') {
    if (bytes.length < 24 || text(4, 4) !== 'ftyp') return invalid();
    const ftypLength = view.getUint32(0);
    if (ftypLength < 16 || ftypLength > bytes.length) return invalid();
    const brands = [text(8, 4)];
    for (let offset = 16; offset + 4 <= ftypLength; offset += 4) brands.push(text(offset, 4));
    if (!brands.some((brand) => brand === 'avif' || brand === 'avis')) return invalid();
    const inspect = (start: number, end: number, depth: number) => {
      if (depth > 8) return invalid();
      for (let offset = start; offset + 8 <= end;) {
        const declaredSize = view.getUint32(offset),
          type = text(offset + 4, 4);
        let size = declaredSize === 0 ? end - offset : declaredSize,
          headerSize = 8;
        if (declaredSize === 1) {
          if (offset + 16 > end) return invalid();
          const extended = view.getBigUint64(offset + 8);
          if (extended > BigInt(end - offset)) return invalid();
          size = Number(extended);
          headerSize = 16;
        }
        if (size < headerSize || offset + size > end) return invalid();
        if (type === 'ispe') {
          if (size < headerSize + 12) return invalid();
          const w = view.getUint32(offset + headerSize + 4),
            h = view.getUint32(offset + headerSize + 8);
          if (!w || !h || w > 4096 || h > 4096)
            throw new Error('Image dimensions must be 1–4096 pixels.');
          if (w * h > width * height) {
            width = w;
            height = h;
          }
        } else if (['meta', 'iprp', 'ipco'].includes(type)) {
          if (type === 'meta' && size < headerSize + 4) return invalid();
          inspect(offset + headerSize + (type === 'meta' ? 4 : 0), offset + size, depth + 1);
        }
        offset += size;
      }
    };
    inspect(0, bytes.length, 0);
  } else return invalid();
  if (!width || !height || width > 4096 || height > 4096)
    throw new Error('Image dimensions must be 1–4096 pixels.');
  return { width, height };
}

export async function decodeUploadImage(file: File): Promise<ImageBitmap> {
  if (!file.size || file.size > IMAGE_UPLOAD_MAX_BYTES)
    throw new Error('Choose an image no larger than 2 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime =
    (['image/x-ms-bmp', 'image/x-bmp'].includes(file.type) ? 'image/bmp' : file.type) ||
    (/\.png$/i.test(file.name)
      ? 'image/png'
      : /\.jpe?g$/i.test(file.name)
        ? 'image/jpeg'
        : /\.webp$/i.test(file.name)
          ? 'image/webp'
          : /\.gif$/i.test(file.name)
            ? 'image/gif'
            : /\.avif$/i.test(file.name)
              ? 'image/avif'
              : /\.bmp$/i.test(file.name)
                ? 'image/bmp'
                : '');
  if (!IMAGE_UPLOAD_ACCEPT.split(',').includes(mime))
    throw new Error(`Choose ${IMAGE_UPLOAD_FORMATS}.`);
  uploadImageDimensions(bytes, mime);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`This browser could not read the image. Try a PNG, JPEG or WebP copy.`);
  });
  if (!bitmap.width || !bitmap.height || bitmap.width > 4096 || bitmap.height > 4096) {
    bitmap.close();
    throw new Error('Image dimensions must be 1–4096 pixels.');
  }
  return bitmap;
}
