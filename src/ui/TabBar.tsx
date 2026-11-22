import { useRef, useState } from 'react';
import { Icon } from './look';

/**
 * Barra de pestañas flotante «de cristal». La píldora de la pestaña activa se desliza entre iconos;
 * se puede arrastrar el dedo por la barra (la píldora lo sigue y la pestaña bajo el dedo se agranda)
 * y al soltar se abre esa pestaña. Un toque normal también funciona.
 */
export function TabBar<T extends string>({
  tabs,
  active,
  label,
  onSelect,
}: {
  tabs: T[];
  active: T;
  label: (t: T) => string;
  onSelect: (t: T) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<number | null>(null); // posición de la píldora (en pestañas) mientras se arrastra
  const start = useRef<{ x: number; moved: boolean } | null>(null);
  const n = tabs.length;
  const index = tabs.indexOf(active);

  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const pad = 6;
    const pos = ((clientX - r.left - pad) / (r.width - 2 * pad)) * n - 0.5;
    return Math.max(0, Math.min(n - 1, pos));
  };

  const onDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, moved: false };
    ref.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    if (!start.current.moved && Math.abs(e.clientX - start.current.x) < 6) return;
    start.current.moved = true;
    setDrag(at(e.clientX));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const t = tabs[Math.round(at(e.clientX))];
    start.current = null;
    setDrag(null);
    if (t !== active) onSelect(t);
  };

  const pos = drag ?? index;
  const hover = Math.round(pos);
  return (
    <nav
      ref={ref}
      className={`glassbar${drag != null ? ' dragging' : ''}`}
      style={{ '--n': n, '--pos': pos } as React.CSSProperties}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { start.current = null; setDrag(null); }}
    >
      <span className="lens" aria-hidden />
      {tabs.map((t, i) => (
        <button
          key={t}
          className={`${t === active ? 'active' : ''}${drag != null && i === hover ? ' hover' : ''}`}
          aria-current={t === active ? 'page' : undefined}
          // La selección la hace onPointerUp; con teclado, Enter/Espacio llegan como click sin puntero
          onClick={(e) => e.detail === 0 && onSelect(t)}
        >
          <Icon name={t} />
          <span>{label(t)}</span>
        </button>
      ))}
    </nav>
  );
}
