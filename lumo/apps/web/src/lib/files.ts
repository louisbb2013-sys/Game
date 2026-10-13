export interface PreparedFile {
  kind: 'image' | 'pdf' | 'text';
  mime: string;
  name: string;
  data: string; // base64
  preview?: string; // object URL for thumbnails
}

const MAX_SIDE = 1800;

function toBase64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Photos are resized and re-encoded on the phone: faster uploads, readable by the AI, no location metadata. */
async function compressImage(file: File): Promise<PreparedFile> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.85));
  return { kind: 'image', mime: 'image/jpeg', name: file.name, data: toBase64(await blob.arrayBuffer()), preview: URL.createObjectURL(blob) };
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  if (file.type.startsWith('image/')) return compressImage(file);
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    if (file.size > 15_000_000) throw new Error('file_too_large');
    return { kind: 'pdf', mime: 'application/pdf', name: file.name, data: toBase64(await file.arrayBuffer()) };
  }
  if (file.size > 900_000) throw new Error('file_too_large');
  // .txt / .md / Quizlet & Anki exports (.csv/.tsv)
  const text = await file.text();
  return { kind: 'text', mime: 'text/plain', name: file.name, data: toBase64(new TextEncoder().encode(text).buffer as ArrayBuffer) };
}
