interface EdgeRuntimeGlobal {
  EdgeRuntime?: {
    waitUntil?: (work: Promise<unknown>) => void;
  };
}

/**
 * Encuela trabajo que no debe bloquear la respuesta HTTP (p. ej. el 200 a Meta).
 * En Supabase Edge usa waitUntil; si no existe, dispara el promise sin await.
 */
export function scheduleBackgroundWork(
  work: Promise<unknown>,
  label = 'background',
): void {
  const wrapped = Promise.resolve(work).catch((error) => {
    console.error(`[${label}]`, error);
  });
  const runtime = globalThis as typeof globalThis & EdgeRuntimeGlobal;
  if (typeof runtime.EdgeRuntime?.waitUntil === 'function') {
    runtime.EdgeRuntime.waitUntil(wrapped);
  }
}
