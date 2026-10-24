'use client';
import { useState } from 'react';

export default function Gallery({ name, photos, previews }: { name: string; photos: string[]; previews: string[] }) {
  // Actual garment photos first, styled photos after.
  const imgs = [...photos, ...previews];
  const [i, setI] = useState(0);
  if (!imgs.length) return <div className="gallery-main"><div className="state" style={{ border: 0 }}>Photos coming soon</div></div>;
  const cur = imgs[Math.min(i, imgs.length - 1)];
  return (
    <div>
      <div className="gallery-main">
        <img src={cur} alt={name} />
      </div>
      {imgs.length > 1 && (
        <div className="thumbs" role="list" aria-label="More photos">
          {imgs.map((src, k) => (
            <button key={src + k} type="button" role="listitem" className="thumb" aria-current={k === i} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}`}>
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {!photos.length && previews.length > 0 && (
        <p className="photo-note">Styled photos. Real photos of this dress are coming soon — message us to see it before booking.</p>
      )}
    </div>
  );
}
