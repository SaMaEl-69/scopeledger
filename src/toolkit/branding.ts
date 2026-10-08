export const LOGO_MAX_BYTES = 300 * 1024;
export async function prepareLogo(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type))
    throw new Error('Choose a PNG or JPEG logo. SVG and remote images are not supported.');
  if (file.size > LOGO_MAX_BYTES) throw new Error('Choose a logo no larger than 300 KB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((file.type === 'image/png' && !png) || (file.type === 'image/jpeg' && !jpeg))
    throw new Error('The file contents do not match a supported PNG or JPEG image.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This logo could not be decoded. Choose another PNG or JPEG.');
  });
  try {
    if (bitmap.width < 64 || bitmap.height < 64 || bitmap.width > 2048 || bitmap.height > 2048)
      throw new Error('Logo width and height must each be from 64 to 2048 pixels.');
    const ratio = bitmap.width / bitmap.height;
    if (ratio > 8 || ratio < 1 / 8) throw new Error('Use a logo aspect ratio between 1:8 and 8:1.');
    const scale = Math.min(1, 600 / bitmap.width, 240 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/png');
    if (data.length > 410_000)
      throw new Error('The fitted logo is still too large. Try a simpler or smaller image.');
    return data;
  } finally {
    bitmap.close();
  }
}
