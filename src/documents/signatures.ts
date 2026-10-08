import type { ClientDocument, DocumentSignatures } from '../domain/types';
import { signatureDimensions, signatureUploadDimensions } from '../../shared/client-document.mjs';

export function emptySignatures(kind: ClientDocument['kind']): DocumentSignatures {
  return {
    enabled: true,
    showClient: kind === 'brief',
    issuer: { name: '', role: '', date: '', imageDataUrl: '' },
    client: { name: '', role: '', date: '', imageDataUrl: '' },
  };
}

export async function prepareSignature(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type))
    throw new Error('Choose a PNG or JPEG signature image.');
  if (!file.size || file.size > 2 * 1024 * 1024)
    throw new Error('Choose a signature image no larger than 2 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((file.type === 'image/png' && !png) || (file.type === 'image/jpeg' && !jpeg))
    throw new Error('The file contents do not match a PNG or JPEG image.');
  // Reject huge declared dimensions before asking the browser to allocate a bitmap.
  signatureUploadDimensions(bytes, file.type);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This signature could not be read. Choose another PNG or JPEG.');
  });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 4096 || bitmap.height > 4096)
      throw new Error('Signature width and height must each be from 1 to 4096 pixels.');
    let scale = Math.min(1, 1280 / bitmap.width, 384 / bitmap.height);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable in this browser.');
    // A photographed signature may need a smaller fit to meet the output bound.
    // Preserve transparency and proportions rather than dropping a valid upload.
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/png');
      if (data.length < 349500) {
        signatureDimensions(data);
        return data;
      }
      scale *= 0.75;
    }
    throw new Error('This image could not be fitted. Choose a simpler signature image.');
  } finally {
    bitmap.close();
  }
}
