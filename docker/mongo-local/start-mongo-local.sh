#!/usr/bin/env bash
set -Eeuo pipefail

# Docker Desktop on Windows ignores the Unix mode requested for file-backed
# secrets. Copy the secret into the Linux VM and enforce MongoDB's required
# 0400 permissions before handing control to the official entrypoint.
install -o mongodb -g mongodb -m 0400 /run/secrets/mongo-keyfile /tmp/mongo-keyfile

# Compose's string form prepends the command name; avoid passing a second
# literal `mongod` to the official entrypoint.
if [[ "${1:-}" == "mongod" ]]; then
  shift
fi

exec /usr/local/bin/docker-entrypoint.sh mongod \
  --keyFile /tmp/mongo-keyfile \
  "$@"
