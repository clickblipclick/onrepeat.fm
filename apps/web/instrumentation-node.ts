import { setDefaultResultOrder } from 'node:dns'
import { setDefaultAutoSelectFamily } from 'node:net'

/**
 * Force IPv4 for outbound connections (runs at server boot via instrumentation.ts).
 *
 * public.api.bsky.app (and the PDS hosts) are dual-stack, but on IPv4-only networks —
 * e.g. behind a v4-only VPN — the IPv6 route is black-holed. Node's Happy-Eyeballs then
 * races both families on each cold connection, wasting ~250ms and intermittently failing
 * the whole connect with `AggregateError: ETIMEDOUT`, which surfaced as
 * "[web] profile hydration failed; serving DID-only authors".
 *
 * Resolving IPv4-first and disabling the dual-stack race sends undici (global fetch)
 * straight to the reachable address. Harmless where IPv6 works, and trivially reversible.
 */
setDefaultResultOrder('ipv4first')
setDefaultAutoSelectFamily(false)
