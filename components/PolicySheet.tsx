'use client';
import { useEffect, useRef } from 'react';

// Shows a policy on the same page, so the customer never leaves the form (and loses what they typed).
export default function PolicySheet({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const buttons = sheetRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', esc);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="sheet-title">{title}</h2>
          <button type="button" ref={closeRef} className="remove" onClick={onClose}>Close</button>
        </div>
        <div className="sheet-body">
          <p className="pre">{text || 'This section is being finalised. Please message Flora on Facebook for the current terms.'}</p>
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn block" onClick={onClose}>Back to my request</button>
        </div>
      </div>
    </div>
  );
}
