/**
 * One-line tracer for the resolve pipeline (enqueue → worker pickup → outcome), so you
 * can see it working in dev. On by default; set `RESOLVE_LOG=0` to silence (e.g. in prod).
 * Spans two processes — `enqueue`/`skip` log from the ingester, `start`/`resolved` from
 * the resolver — so grep `[resolve]` across both to follow a track end to end.
 */
export function resolveLog(...args: unknown[]): void {
  if (process.env.RESOLVE_LOG !== '0') console.log('[resolve]', ...args)
}
