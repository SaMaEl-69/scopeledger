import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeUploadImage,
  uploadImageDimensions,
  IMAGE_UPLOAD_MAX_BYTES,
} from '../src/documents/image-import';
import { logo } from './server/fixtures.mjs';
const ascii = (bytes: Uint8Array, offset: number, text: string) =>
  bytes.set(
    [...text].map((c) => c.charCodeAt(0)),
    offset,
  );
function header(format: string, width = 240, height = 120) {
  const bytes = new Uint8Array(format === 'avif' ? 44 : 54),
    view = new DataView(bytes.buffer);
  if (format === 'gif') {
    ascii(bytes, 0, 'GIF89a');
    view.setUint16(6, width, true);
    view.setUint16(8, height, true);
  } else if (format === 'bmp') {
    ascii(bytes, 0, 'BM');
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, -height, true);
  } else if (format === 'webp') {
    ascii(bytes, 0, 'RIFF');
    ascii(bytes, 8, 'WEBP');
    ascii(bytes, 12, 'VP8X');
    view.setUint32(24, width - 1, true);
    bytes[27] = (height - 1) & 255;
    bytes[28] = ((height - 1) >> 8) & 255;
    bytes[29] = ((height - 1) >> 16) & 255;
  } else {
    view.setUint32(0, 24);
    ascii(bytes, 4, 'ftyp');
    ascii(bytes, 8, 'avif');
    ascii(bytes, 16, 'mif1');
    ascii(bytes, 20, 'avif');
    view.setUint32(24, 20);
    ascii(bytes, 28, 'ispe');
    view.setUint32(36, width);
    view.setUint32(40, height);
  }
  return bytes;
}
afterEach(() => vi.unstubAllGlobals());
describe('bounded, static image imports', () => {
  it.each(['gif', 'bmp', 'webp', 'avif'])(
    'checks %s dimensions and oversized compressed headers before decoding',
    async (format) => {
      expect(uploadImageDimensions(header(format), `image/${format}`)).toEqual({
        width: 240,
        height: 120,
      });
      const decode = vi.fn();
      vi.stubGlobal('createImageBitmap', decode);
      await expect(
        decodeUploadImage(
          new File([header(format, 4097)], `too-wide.${format}`, { type: `image/${format}` }),
        ),
      ).rejects.toThrow(/4096/);
      expect(decode).not.toHaveBeenCalled();
      expect(() => uploadImageDimensions(header(format).slice(0, 10), `image/${format}`)).toThrow(
        /contents/,
      );
    },
  );
  it('accepts a 2 MiB input and rejects larger or disguised files before decoding', async () => {
    const png = Uint8Array.from(Buffer.from(logo.split(',')[1], 'base64'));
    const bytes = new Uint8Array(IMAGE_UPLOAD_MAX_BYTES);
    bytes.set(png);
    const bitmap = { width: 1, height: 1, close: vi.fn() },
      decode = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal('createImageBitmap', decode);
    expect(await decodeUploadImage(new File([bytes], 'boundary.png', { type: 'image/png' }))).toBe(
      bitmap,
    );
    decode.mockClear();
    await expect(
      decodeUploadImage(
        new File([new Uint8Array(IMAGE_UPLOAD_MAX_BYTES + 1)], 'too-large.png', {
          type: 'image/png',
        }),
      ),
    ).rejects.toThrow(/2 MiB/);
    await expect(
      decodeUploadImage(new File([header('gif')], 'fake.webp', { type: 'image/webp' })),
    ).rejects.toThrow(/contents/);
    await expect(
      decodeUploadImage(new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow(/PNG, JPEG/);
    expect(decode).not.toHaveBeenCalled();
  });
  it('supports a missing MIME type and BMP aliases, and closes invalid decoded resources', async () => {
    const bitmap = { width: 240, height: 120, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    expect(await decodeUploadImage(new File([header('webp')], 'mark.webp'))).toBe(bitmap);
    expect(
      await decodeUploadImage(new File([header('bmp')], 'mark.bmp', { type: 'image/x-ms-bmp' })),
    ).toBe(bitmap);
    bitmap.width = 5000;
    await expect(
      decodeUploadImage(new File([header('gif')], 'mark.gif', { type: 'image/gif' })),
    ).rejects.toThrow(/4096/);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it('bounds AVIF boxes and rejects unsupported brands rather than guessing dimensions', () => {
    const bytes = header('avif'),
      view = new DataView(bytes.buffer);
    view.setUint32(24, 1);
    view.setBigUint64(32, 2n ** 63n);
    expect(() => uploadImageDimensions(bytes, 'image/avif')).toThrow(/contents/);
    const unsupported = header('avif');
    ascii(unsupported, 8, 'heic');
    ascii(unsupported, 20, 'heic');
    expect(() => uploadImageDimensions(unsupported, 'image/avif')).toThrow(/contents/);
  });
});
