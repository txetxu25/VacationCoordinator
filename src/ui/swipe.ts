import { useEffect } from 'react';

/**
 * Deslizar el dedo en horizontal para cambiar de pestaña. No se activa al empezar el gesto en un
 * campo de texto, en una zona con desplazamiento horizontal propio o con una hoja inferior abierta.
 */
export function useSwipe(el: HTMLElement | null, onSwipe: (dir: 1 | -1) => void) {
  useEffect(() => {
    if (!el) return;
    let start: { x: number; y: number; t: number; scrollers: [HTMLElement, number][] } | null = null;

    // Campos y hojas abiertas: nunca. Zonas con desplazamiento horizontal propio (tablas anchas):
    // solo si el gesto no las ha desplazado, es decir, si ya estaban en el borde.
    const blocked = (target: EventTarget | null) => {
      const t = target as HTMLElement | null;
      if (t?.closest?.('.overlay, .tl')) return true;
      // Un campo solo bloquea si se está escribiendo en él (para poder mover el cursor o seleccionar)
      const field = t?.closest?.('input, select, textarea');
      return !!field && field === document.activeElement;
    };
    const scrollers = (target: EventTarget | null) => {
      const out: [HTMLElement, number][] = [];
      for (let n = target as HTMLElement | null; n && n !== el; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 2) out.push([n, n.scrollLeft]);
      }
      return out;
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start =
        e.touches.length === 1 && !blocked(e.target)
          ? { x: t.clientX, y: t.clientY, t: Date.now(), scrollers: scrollers(e.target) }
          : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const quick = Date.now() - start.t < 700;
      const scrolled = start.scrollers.some(([n, left]) => Math.abs(n.scrollLeft - left) > 1);
      start = null;
      if (quick && !scrolled && Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [el, onSwipe]);
}
