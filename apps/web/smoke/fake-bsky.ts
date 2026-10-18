import { createServer, type Server } from 'node:http'

/**
 * A stand-in for the public Bluesky AppView (public.api.bsky.app), serving just the
 * three unauthenticated XRPC methods the web app calls while logged out: profile
 * lookup by handle or DID, batched profile hydration, and the login typeahead. The
 * server points at it through BSKY_PUBLIC_API_URL, so the suite never depends on the
 * network or on real accounts.
 */
export interface FakeActor {
  did: string
  handle: string
  displayName?: string
}

export interface FakeBsky {
  url: string
  close(): Promise<void>
}

export function startFakeBsky(actors: FakeActor[]): Promise<FakeBsky> {
  const byActor = new Map<string, FakeActor>()
  for (const a of actors) {
    byActor.set(a.did, a)
    byActor.set(a.handle, a)
  }
  const view = (a: FakeActor) => ({
    did: a.did,
    handle: a.handle,
    ...(a.displayName ? { displayName: a.displayName } : {}),
  })

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake-bsky')
    const method = url.pathname.replace(/^\/xrpc\//, '')
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    switch (method) {
      case 'app.bsky.actor.getProfile': {
        const hit = byActor.get(url.searchParams.get('actor') ?? '')
        return hit
          ? json(200, view(hit))
          : json(400, { error: 'InvalidRequest', message: 'Profile not found' })
      }
      case 'app.bsky.actor.getProfiles': {
        const hits = url.searchParams
          .getAll('actors')
          .map((a) => byActor.get(a))
          .filter((a): a is FakeActor => !!a)
        return json(200, { profiles: hits.map(view) })
      }
      case 'app.bsky.actor.searchActorsTypeahead': {
        const q = (url.searchParams.get('q') ?? '').toLowerCase()
        const hits = actors.filter(
          (a) =>
            a.handle.toLowerCase().includes(q) ||
            a.displayName?.toLowerCase().includes(q),
        )
        return json(200, { actors: hits.map(view) })
      }
      default:
        return json(501, {
          error: 'MethodNotImplemented',
          message: `fake-bsky: ${method}`,
        })
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        return reject(new Error('fake-bsky: no port'))
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((done, fail) => {
            server.closeAllConnections() // don't wait on the app's keep-alive sockets
            server.close((err) => (err ? fail(err) : done()))
          }),
      })
    })
  })
}
