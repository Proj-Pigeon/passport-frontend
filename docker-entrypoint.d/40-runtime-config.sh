#!/bin/sh
set -eu

escape() {
  printf '%s' "$1" | tr -d '\r\n' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

target=/usr/share/nginx/html/config.js
api_base=${VITE_API_BASE:-}
admin_origin=${VITE_ADMIN_ORIGIN:-}
account_origin=${VITE_ACCOUNT_ORIGIN:-}
turnstile_site_key=${VITE_TURNSTILE_SITE_KEY:-}
turnstile_action=${VITE_TURNSTILE_ACTION:-auth}

printf 'window.__PASSPORT_CONFIG__ = {"apiBase":"%s","adminBase":"%s","accountBase":"%s","turnstileSiteKey":"%s","turnstileAction":"%s"};\n' \
  "$(escape "$api_base")" "$(escape "$admin_origin")" "$(escape "$account_origin")" "$(escape "$turnstile_site_key")" "$(escape "$turnstile_action")" > "$target"
