/**
 * Azure Vision rejects images over 4 MB or larger than 10000×10000 pixels, and
 * a phone photo of a book page is routinely both. Shrinking in the browser
 * before upload keeps scans inside those limits — and uploads far quicker.
 */

/** Longest edge we send. Well under Azure's cap, still sharp enough to read. */
const MAX_EDGE = 2400;

/** Target file size. Azure's limit is 4 MB; leave headroom. */
const MAX_BYTES = 3_500_000;

/**
 * Downscale and re-encode an image for OCR. Returns the original file
 * untouched if it is already small enough, or if the browser cannot decode it
 * (an unusual format, say) — the server still validates either way.
 */
export async function prepareForScan(file: File): Promise<File> {
  const alreadySmall = file.size <= MAX_BYTES;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // undecodable here; let the server have its say
  }

  const longestEdge = Math.max(bitmap.width, bitmap.height);
  if (alreadySmall && longestEdge <= MAX_EDGE) {
    bitmap.close();
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / longestEdge);
  const width = Math.max(50, Math.round(bitmap.width * scale));
  const height = Math.max(50, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }

  // White backdrop so transparent PNGs do not come out as black pages.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Step the quality down until it fits, rather than guessing once.
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_BYTES) {
      return new File([blob], renameToJpg(file.name), { type: 'image/jpeg' });
    }
  }

  const fallback = await toBlob(canvas, 0.4);
  return fallback
    ? new File([fallback], renameToJpg(file.name), { type: 'image/jpeg' })
    : file;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function renameToJpg(name: string): string {
  return name.replace(/\.[^.]+$/, '') + '.jpg';
}
