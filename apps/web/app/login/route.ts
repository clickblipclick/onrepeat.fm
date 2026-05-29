import { NextRequest, NextResponse } from 'next/server'
import { oauthClient } from '../../lib/oauth-client'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const handle = String(form.get('handle') ?? '').trim()
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 })
  const url = await oauthClient.authorize(handle)
  return NextResponse.redirect(url.toString())
}
