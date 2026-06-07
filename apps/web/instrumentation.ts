/**
 * Next.js runs register() once when each server runtime boots. The Node-only network
 * tuning lives in ./instrumentation-node so its `node:` imports never reach the Edge
 * build (which can't resolve them): with NEXT_RUNTIME inlined per target, this dynamic
 * import is dead-code-eliminated for every runtime except nodejs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
