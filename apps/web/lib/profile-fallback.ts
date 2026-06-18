import type { ActorProfile } from '@onrepeat/appview'

/**
 * Decide which profile to render on /profile/[handle].
 *
 * onrepeat borrows profile identity (handle/displayName/avatar) from Bluesky's
 * AppView, so `getProfile` returns null for an account Bluesky doesn't know —
 * e.g. a fully-local dev account, or a de-indexed/taken-down DID that still has
 * jams in our index. Rather than 404 in that case, degrade to a DID-only profile
 * so the page still renders the actor's jams, mirroring how the feed degrades its
 * authors. A bare handle can't be resolved to a DID without Bluesky, so an
 * unknown handle stays unrenderable (null → notFound).
 */
export function profileOrDidFallback(
  actor: string,
  profile: ActorProfile | null,
): ActorProfile | null {
  if (profile) return profile
  if (actor.startsWith('did:')) return { did: actor, handle: actor }
  return null
}
