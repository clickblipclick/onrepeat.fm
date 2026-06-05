import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createBoss,
  createResolveQueue,
  enqueueResolve,
  RESOLVE_QUEUE,
} from './queue'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'
const boss = createBoss(url)

describe('resolve queue', () => {
  beforeAll(async () => {
    await boss.start()
    await createResolveQueue(boss)
    await boss.deleteAllJobs(RESOLVE_QUEUE)
  })

  afterAll(async () => {
    await boss.deleteAllJobs(RESOLVE_QUEUE)
    await boss.stop({ graceful: false })
  })

  it('enqueues a resolve job and dedups by singletonKey', async () => {
    const job = {
      identity: 'isrc:USRC12300001',
      sourceUrl: 'https://open.spotify.com/track/1',
      provider: 'spotify',
    }
    const first = await enqueueResolve(boss, job)
    const second = await enqueueResolve(boss, job)
    expect(first).toBeTypeOf('string') // job id
    expect(second).toBeNull() // deduped while the first is still queued
  })
})
