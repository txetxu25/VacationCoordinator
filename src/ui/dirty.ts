import { useEffect } from 'react';

/** Formularios con cambios sin guardar: evita renovar la sesión (recarga la página) por sorpresa. */
const sources = new Set<symbol>();

export const hasUnsavedChanges = () => sources.size > 0;

export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol();
    sources.add(id);
    return () => {
      sources.delete(id);
    };
  }, [dirty]);
}

/** Antes de salir de una pantalla: si hay cambios sin guardar, pide confirmación. */
export const confirmLeave = () =>
  !hasUnsavedChanges() || confirm('Hay cambios sin guardar en esta pantalla. ¿Salir y descartarlos?');
