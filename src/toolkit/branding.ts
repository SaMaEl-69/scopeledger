import { decodeUploadImage, IMAGE_UPLOAD_MAX_BYTES } from '../documents/image-import';
export const LOGO_MAX_BYTES = IMAGE_UPLOAD_MAX_BYTES;
export async function prepareLogo(file: File): Promise<string> {
  const bitmap = await decodeUploadImage(file);
  try {
    const ratio = bitmap.width / bitmap.height;
    if (ratio > 20 || ratio < 1 / 20)
      throw new Error('Use a logo aspect ratio between 1:20 and 20:1.');
    let scale = Math.min(1, 600 / bitmap.width, 240 / bitmap.height);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable in this browser.');
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/png');
      if (data.length <= 410_000) return data;
      scale *= 0.8;
    }
    throw new Error('This image could not be fitted. Choose a simpler logo image.');
  } finally {
    bitmap.close();
  }
}
