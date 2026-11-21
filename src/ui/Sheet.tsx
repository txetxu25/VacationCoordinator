import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Hoja inferior con barrita: se cierra arrastrándola hacia abajo desde la barrita o el título,
 * tocando fuera o con Escape. Se abre y se cierra con animación.
 */
export function Sheet({ label, title, onClose, children }: { label: string; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const [drag, setDrag] = useState(0);
  const [closing, setClosing] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const onDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, t: Date.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (start.current) setDrag(Math.max(0, e.clientY - start.current.y));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = Math.max(0, e.clientY - start.current.y);
    const fast = dy > 30 && dy / Math.max(1, Date.now() - start.current.t) > 0.6;
    start.current = null;
    if (dy > 110 || fast) close();
    else setDrag(0);
  };

  return (
    <div className={`overlay${closing ? ' closing' : ''}`} onClick={close}>
      <div
        className={`sheet${closing ? ' closing' : ''}${drag ? ' dragging' : ''}`}
        role="dialog"
        aria-label={label}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="handle" aria-hidden />
          <h2>{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
