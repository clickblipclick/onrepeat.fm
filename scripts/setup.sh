#!/usr/bin/env bash
# One-command local bootstrap: install deps, create per-app .env.local files,
# generate a session secret, and apply database migrations.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ Installing dependencies…"
pnpm install

echo "▸ Ensuring per-app .env.local files…"
for app in web ingester resolver; do
  example="apps/$app/.env.example"
  envfile="apps/$app/.env.local"
  if [ ! -f "$example" ]; then
    echo "  (no $example — skipping)"
  elif [ -f "$envfile" ]; then
    echo "  $envfile already present — leaving it untouched"
  else
    cp "$example" "$envfile"
    echo "  created $envfile (from .env.example)"
  fi
done

# Generate a real SESSION_SECRET for the web app if it's still the placeholder.
web_env="apps/web/.env.local"
if [ -f "$web_env" ] && grep -q "replace-me-with-a-32" "$web_env"; then
  secret="$(openssl rand -base64 32)"
  tmp="$(mktemp)"
  sed "s|^SESSION_SECRET=.*|SESSION_SECRET=${secret}|" "$web_env" > "$tmp" && mv "$tmp" "$web_env"
  echo "  generated SESSION_SECRET in $web_env"
fi

echo "▸ Applying database migrations (DATABASE_URL or localhost:5432)…"
if pnpm db:migrate; then
  echo "  migrations applied"
else
  echo "  ⚠ migrations failed — is Postgres running on :5432? (Postgres.app, or 'pnpm db:up')"
fi

echo "✓ Setup complete. Start everything with:  pnpm dev"
