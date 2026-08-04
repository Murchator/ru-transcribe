// Screenshots go to the model as data URLs. Two competing pressures: the text
// annotations must stay legible, but the whole request has to fit inside the
// ~4.5 MB body limit serverless hosts impose. 2000 px on the long edge at JPEG
// 0.85 keeps small handwriting readable at roughly 400 KB an image.

const MAX_DIMENSION = 2000;
const QUALITY = 0.85;
export const MAX_IMAGES = 6;

export async function fileToDataUrl(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`"${file.name}" isn't an image.`);
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(
      `Couldn't read "${file.name}". If it came from an iPhone, save it as JPEG or PNG first.`
    );
  });

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  // Screenshots often have transparency; flatten onto white so text stays dark.
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", QUALITY);
}

export function approxBytes(dataUrl) {
  // base64 carries 3 bytes per 4 characters
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.round((base64.length * 3) / 4);
}
