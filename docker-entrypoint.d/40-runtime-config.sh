#!/bin/sh
set -eu

escape() {
  printf '%s' "$1" | tr -d '\r\n' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

target=/usr/share/nginx/html/config.js
api_base=${VITE_API_BASE:-}
turnstile_site_key=${VITE_TURNSTILE_SITE_KEY:-}

printf 'window.__PASSPORT_CONFIG__ = {"apiBase":"%s","turnstileSiteKey":"%s"};\n' \
  "$(escape "$api_base")" "$(escape "$turnstile_site_key")" > "$target"
