// Vitest setupFile for the integration suite (wired in vitest.int.config.ts).
//
// Integration tests TRUNCATE tables, so they must never run against the dev/app
// database (onrepeat_test). This runs before each int test file is imported, so the
// files' top-level `process.env.DATABASE_URL ?? <default>` pick up the value set here.
// The dedicated DB is DATABASE_URL_INTTEST (default: onrepeat_inttest), independent of
// any ambient DATABASE_URL (which usually points at dev).
import { assertInttestUrl } from './inttest-guard'

const DEFAULT_INTTEST_DB =
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_inttest'

const url = process.env.DATABASE_URL_INTTEST ?? DEFAULT_INTTEST_DB
assertInttestUrl(url) // throws unless this is a safe, local, opted-in *_inttest DB

process.env.DATABASE_URL = url
