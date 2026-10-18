import { readFileSync } from 'node:fs'

import { expect, test } from './fixtures'

// Logged-out smoke suite. A production `next start` serves the public routes against a
// seeded Postgres (global-setup.ts); each test asserts the route renders, the seeded
// content shows up where it should, and nothing errors in the browser console. The
// final test reads the server's own output for errors. Logged-in flows (OAuth) are out
// of scope here.

test.describe('pages', () => {
  test('home shows the explore feed and a sign-in prompt when logged out', async ({
    page,
    seed,
  }) => {
    const res = await page.goto('/')
    expect(res?.status()).toBe(200)
    // `exact`: the header has its own lowercase "sign in" link.
    await expect(
      page.getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(seed.current.title, { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: seed.displayName }).first(),
    ).toBeVisible()
  })

  test('client-side navigation from the home page reaches /login', async ({
    page,
  }) => {
    await page.goto('/')
    // A <Link> transition: the client router fetches the RSC payload rather than
    // reloading the document, so this covers the app-router navigation path.
    await page.getByRole('link', { name: 'Sign in', exact: true }).click()
    await page.waitForURL('**/login')
    await expect(
      page.getByRole('heading', { name: 'Sign in to onrepeat' }),
    ).toBeVisible()
  })

  test('explore lists the newest jam first', async ({ page, seed }) => {
    const res = await page.goto('/explore')
    expect(res?.status()).toBe(200)
    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(2)
    await expect(cards.first()).toContainText(seed.current.title)
    await expect(cards.last()).toContainText(seed.archive.title)
  })

  for (const path of ['/about', '/privacy', '/terms']) {
    test(`${path} renders`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })
  }

  test('login renders the handle form and the typeahead finds the seeded account', async ({
    page,
    seed,
  }) => {
    const res = await page.goto('/login')
    expect(res?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { name: 'Sign in to onrepeat' }),
    ).toBeVisible()
    // Typing drives the debounced /api/typeahead fetch and the floating listbox, which
    // only works once the client bundle has hydrated.
    await page.getByRole('combobox', { name: 'Bluesky handle' }).fill('smo')
    await expect(page.getByRole('listbox')).toContainText(`@${seed.handle}`)
  })

  test('profile shows the current jam and the archive', async ({
    page,
    seed,
  }) => {
    const res = await page.goto(`/profile/${seed.handle}`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      seed.displayName,
    )
    await expect(
      page.getByRole('heading', { name: 'On repeat', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(seed.current.title, { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Archive', exact: true }),
    ).toBeVisible()
    // Archive tiles are artwork-only links, titled "Title — Artist".
    await expect(
      page.locator(
        `a[href="/profile/${seed.handle}/jam/${seed.archive.rkey}"]`,
      ),
    ).toHaveAttribute('title', `${seed.archive.title} — ${seed.archive.artist}`)
    // The profile wears its owner's theme.
    await expect(page.locator('html')).toHaveAttribute('data-theme', seed.theme)
  })

  test('unknown profile is a 404', async ({ page }) => {
    const res = await page.goto('/profile/nobody.example')
    expect(res?.status()).toBe(404)
    await expect(page.getByText('Nothing here.')).toBeVisible()
  })

  test('jam permalink renders the track, caption and share metadata', async ({
    page,
    seed,
  }) => {
    const res = await page.goto(
      `/profile/${seed.handle}/jam/${seed.current.rkey}`,
    )
    expect(res?.status()).toBe(200)
    await expect(
      page.getByText(seed.current.title, { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(seed.current.artist, { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(seed.current.caption, { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Liked by', exact: true }),
    ).toBeVisible()
    await expect(page).toHaveTitle(
      `${seed.current.title} — ${seed.current.artist} · onrepeat.fm`,
    )
    await expect(
      page.locator('meta[property="og:description"]'),
    ).toHaveAttribute(
      'content',
      `${seed.displayName} has this on repeat right now.`,
    )
    await expect(
      page.getByRole('button', {
        name: `Play ${seed.current.title} by ${seed.current.artist}`,
      }),
    ).toBeVisible()
  })

  test('footer display-mode switch pins dark mode across a refresh', async ({
    page,
    seed,
  }) => {
    await page.goto('/about')
    const dark = page
      .getByRole('group', { name: 'Display mode' })
      .getByRole('button', { name: 'Dark' })
    await dark.click()
    await expect(dark).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark')
    // The pick is a cookie the server reads back on the next render.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark')
  })
})

test.describe('routes without a page', () => {
  test('jam opengraph image is a PNG', async ({ request, seed }) => {
    const res = await request.get(
      `/profile/${seed.handle}/jam/${seed.current.rkey}/opengraph-image`,
    )
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('image/png')
    const body = await res.body()
    expect(body.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(body.length).toBeGreaterThan(10_000)
  })

  test('/api/latest returns the seeded jams newest-first', async ({
    request,
    seed,
  }) => {
    const res = await request.get('/api/latest')
    expect(res.status()).toBe(200)
    const body = (await res.json()) as {
      feed: { uri: string; title: string; author: { handle?: string } }[]
    }
    expect(body.feed.map((j) => j.title)).toEqual([
      seed.current.title,
      seed.archive.title,
    ])
    expect(body.feed[0]?.author.handle).toBe(seed.handle)
  })

  test('/api/actor/[did] returns that author’s jams', async ({
    request,
    seed,
  }) => {
    const res = await request.get(`/api/actor/${seed.did}`)
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { jams: { title: string }[] }
    expect(body.jams.map((j) => j.title)).toEqual([
      seed.current.title,
      seed.archive.title,
    ])
  })

  test('/api/feed requires a session', async ({ request }) => {
    const res = await request.get('/api/feed')
    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'login required' })
  })

  test('/api/typeahead proxies the public AppView', async ({
    request,
    seed,
  }) => {
    const res = await request.get('/api/typeahead?q=smo')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({
      actors: [
        { handle: seed.handle, displayName: seed.displayName },
        { handle: seed.liker.handle, displayName: seed.liker.displayName },
      ],
    })
  })

  test('OAuth client metadata and JWKS are served from runtime env', async ({
    request,
  }) => {
    const publicUrl = process.env.SMOKE_PUBLIC_URL
    const meta = await request.get('/oauth-client-metadata.json')
    expect(meta.status()).toBe(200)
    const metaBody = (await meta.json()) as Record<string, unknown>
    expect(metaBody.client_id).toBe(`${publicUrl}/oauth-client-metadata.json`)
    expect(metaBody.jwks_uri).toBe(`${publicUrl}/.well-known/jwks.json`)
    expect(metaBody.redirect_uris).toEqual([`${publicUrl}/oauth/callback`])

    const jwks = await request.get('/.well-known/jwks.json')
    expect(jwks.status()).toBe(200)
    const { keys } = (await jwks.json()) as {
      keys: Record<string, unknown>[]
    }
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatchObject({
      kty: 'EC',
      crv: 'P-256',
      kid: 'onrepeat-1',
    })
    // Public half only — the private scalar must never leave the server.
    expect(keys[0]).not.toHaveProperty('d')
  })
})

// Lines the server may legitimately print:
//  - React's Flight server (bundled inside Next) logs this when the browser drops a
//    response mid-stream. Closing a page right after its assertions pass does that to
//    in-flight <Link> prefetches (`?_rsc=`), so it is expected noise here, not an app
//    error; the page tests already assert status and content for every route. If a
//    React/Next bump rewords it, update the pattern.
//  - Node's own `(node:1234) DeprecationWarning: …` / `ExperimentalWarning: …` lines
//    are about the runtime, not about the app breaking.
const EXPECTED_NOISE = [/The destination stream closed early/, /^\(node:\d+\)/]

test('the server logged no errors while serving the suite', async ({
  page,
}) => {
  // Let anything the last request triggered reach the log first.
  await page.waitForTimeout(500)
  const log = readFileSync(process.env.SMOKE_SERVER_LOG!, 'utf8')
  const suspicious = log
    .split('\n')
    .filter((line) => /error|unhandled|⨯|warn/i.test(line))
    .filter((line) => !EXPECTED_NOISE.some((re) => re.test(line)))
  expect(suspicious, `server output:\n${log}`).toEqual([])
})
