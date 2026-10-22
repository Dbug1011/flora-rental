'use client';
import { useState } from 'react';

type Img = { src: string; ai: boolean };

export default function Gallery({ name, photos, previews }: { name: string; photos: string[]; previews: string[] }) {
  // Actual garment photos first, AI-styled previews after, each clearly labelled.
  const imgs: Img[] = [...photos.map((src) => ({ src, ai: false })), ...previews.map((src) => ({ src, ai: true }))];
  const [i, setI] = useState(0);
  if (!imgs.length) return <div className="gallery-main"><div className="state" style={{ border: 0 }}>Photos coming soon</div></div>;
  const cur = imgs[Math.min(i, imgs.length - 1)];
  return (
    <div>
      <div className="gallery-main">
        <img src={cur.src} alt={`${name} — ${cur.ai ? 'AI-styled preview' : 'actual garment photo'}`} />
        <span className="badge ai">{cur.ai ? 'AI-styled preview' : 'Actual photo'}</span>
      </div>
      {imgs.length > 1 && (
        <div className="thumbs" role="list" aria-label="More photos">
          {imgs.map((im, k) => (
            <button key={im.src + k} type="button" role="listitem" className="thumb" aria-current={k === i} onClick={() => setI(k)} aria-label={`Show photo ${k + 1}${im.ai ? ' (AI-styled preview)' : ''}`}>
              <img src={im.src} alt="" loading="lazy" />
              {im.ai && <span className="t-ai">AI</span>}
            </button>
          ))}
        </div>
      )}
      {previews.length > 0 && (
        <p className="ai-note">
          <strong>About these photos:</strong> images marked “AI-styled preview” show the styling mood only.
          {photos.length
            ? ' Photos marked “Actual photo” show the real garment.'
            : ' Actual garment photos are coming soon — message us and we’ll send real photos before you book.'}{' '}
          Please check the actual photos and measurements before reserving.
        </p>
      )}
    </div>
  );
}
