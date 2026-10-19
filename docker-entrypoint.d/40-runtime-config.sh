#!/bin/sh
set -eu

json_string() {
  printf '%s' "$1" | od -An -v -tu1 | LC_ALL=C awk '
    {
      for (i = 1; i <= NF; i++) bytes[++count] = $i + 0
    }
    END {
      printf "\""
      for (i = 1; i <= count; i++) {
        byte = bytes[i]
        if (byte == 226 && bytes[i + 1] == 128 && (bytes[i + 2] == 168 || bytes[i + 2] == 169)) {
          printf "\\u202%x", bytes[i + 2] - 160
          i += 2
        }
        else if (byte < 32 || byte == 34 || byte == 38 || byte == 60 || byte == 62 || byte == 92 || byte == 127)
          printf "\\u%04x", byte
        else
          printf "%c", byte
      }
      printf "\""
    }
  '
}

target=/usr/share/nginx/html/config.js
api_base=${VITE_API_BASE:-}
admin_origin=${VITE_ADMIN_ORIGIN:-}
account_origin=${VITE_ACCOUNT_ORIGIN:-}
turnstile_site_key=${VITE_TURNSTILE_SITE_KEY:-}
turnstile_action=${VITE_TURNSTILE_ACTION:-auth}

printf 'window.__PASSPORT_CONFIG__ = {"apiBase":%s,"adminBase":%s,"accountBase":%s,"turnstileSiteKey":%s,"turnstileAction":%s};\n' \
  "$(json_string "$api_base")" "$(json_string "$admin_origin")" "$(json_string "$account_origin")" "$(json_string "$turnstile_site_key")" "$(json_string "$turnstile_action")" > "$target"
