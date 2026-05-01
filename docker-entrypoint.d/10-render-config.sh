#!/bin/sh
# Render /usr/share/nginx/html/config.js from config.template.js by substituting
# ${API_BASE_URL} via envsubst. Safe against special characters in the value
# (quotes, ampersands, backslashes) — unlike raw `sed`.
#
# Runs at container start before nginx, sourced by the standard nginx image's
# /docker-entrypoint.sh loop over /docker-entrypoint.d/*.sh.

set -eu

: "${API_BASE_URL:=}"

TEMPLATE=/usr/share/nginx/html/config.template.js
TARGET=/usr/share/nginx/html/config.js

if [ ! -f "$TEMPLATE" ]; then
  echo "config template not found at $TEMPLATE" >&2
  exit 1
fi

echo "Rendering config.js (API_BASE_URL set: $([ -n "$API_BASE_URL" ] && echo yes || echo no))"
# Scope envsubst to API_BASE_URL only so any other '$'-sigil in the file
# (currently none, but future-proof) is preserved.
envsubst '${API_BASE_URL}' < "$TEMPLATE" > "$TARGET"
