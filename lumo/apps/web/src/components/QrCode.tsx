import QR from 'qrcode';
import { useEffect, useState } from 'react';

/** A QR code for a link (generated locally, nothing is sent anywhere). */
export function QrCode({ value, label, size = 176 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QR.toDataURL(value, { margin: 1, width: size * 2, color: { dark: '#1E1B4B', light: '#FFFFFF' } }).then(setSrc, () => setSrc(null));
  }, [value, size]);
  return (
    <span className="inline-block rounded-2xl bg-white p-2 ring-1 ring-line" style={{ width: size + 16, height: size + 16 }}>
      {src && <img src={src} alt={label} width={size} height={size} />}
    </span>
  );
}

/** Copy text, falling back to the share sheet on phones. */
export async function shareOrCopy(text: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title, url: text });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
