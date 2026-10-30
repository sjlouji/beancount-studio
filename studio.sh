#!/usr/bin/env bash
# Beancount Studio launcher — one command for the Docker stacks in deploy/.
#
#   ./studio.sh            same as "dev"
#   ./studio.sh dev        hot-reload development stack  → http://localhost:3000 (Ctrl-C stops it)
#   ./studio.sh local      production images on this machine → https://localhost:${BS_LOCAL_PORT:-8443}
#   ./studio.sh local trust  trust Caddy's local root certificate once (macOS keychain, asks for sudo)
#   ./studio.sh prod       production stack, Caddy with TLS for DOMAIN from deploy/.env
#
# Keeping the data (local and prod; the stack can keep running):
#   ./studio.sh local backup [DIR]       one archive with the database and every ledger, in DIR (default backups/)
#   ./studio.sh local restore ARCHIVE    replace the database and the ledgers with the archive's (asks first; --yes skips)
#   ./studio.sh local update             back up, pull the latest code, rebuild and restart (--no-backup skips the backup)
#
# Anything else after the mode is passed to docker compose for that stack, for example:
#   ./studio.sh dev down        ./studio.sh prod logs -f        ./studio.sh local ps
#
# local and prod create deploy/.env from .env.example when it does not exist yet and generate
# BS_SECRET_KEY and POSTGRES_PASSWORD if they are missing. dev only reads deploy/.env if present.
# COMPOSE_PROJECT_NAME=other runs a second, separate instance with its own containers and volumes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$ROOT/deploy"
ENV_FILE="$DEPLOY/.env"
BACKUPS="$ROOT/backups"
# Where the command was typed; paths given on the command line are relative to it, not to deploy/.
INVOKED_FROM="$PWD"
# The Compose project the data commands address; its volumes are <project>_studio-data and <project>_postgres-data.
PROJECT="${COMPOSE_PROJECT_NAME:-beancount-studio}"
DATA_VOLUME="${PROJECT}_studio-data"
# Who owns /data in the API image (apps/api/Dockerfile); restored files must belong to it.
API_UID=10001

die() { printf 'studio: %s\n' "$*" >&2; exit 1; }
say() { printf 'studio: %s\n' "$*"; }

compose() { docker compose "${files[@]}" "$@"; }

# Reads KEY=value from deploy/.env (last match wins, quotes stripped); prints nothing if unset.
env_value() {
  [[ -f $ENV_FILE ]] || return 0
  sed -nE "s/^$1=[\"']?([^\"'#[:space:]]*).*/\1/p" "$ENV_FILE" | tail -1
}

# Sets KEY in deploy/.env to a generated value when it is missing, empty or still commented out.
ensure_secret() {
  local key=$1 value
  [[ -n "$(env_value "$key")" ]] && return 0
  command -v openssl >/dev/null || die "openssl is required to generate $key"
  value="$(openssl rand -hex 32)"
  if grep -qE "^#? ?$key=" "$ENV_FILE"; then
    sed -i.bak -E "s|^#? ?$key=.*|$key=$value|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
  say "generated $key in deploy/.env"
}

ensure_env() {
  if [[ ! -f $ENV_FILE ]]; then
    [[ -f $DEPLOY/.env.example ]] || die "deploy/.env.example is missing"
    cp "$DEPLOY/.env.example" "$ENV_FILE"
    say "created deploy/.env from .env.example (edit it for DOMAIN and AI settings)"
  fi
  ensure_secret BS_SECRET_KEY
  ensure_secret POSTGRES_PASSWORD
}

# prod needs a real public host name; the template ships a placeholder that Let's Encrypt refuses.
require_domain() {
  case "$domain" in
    ""|localhost|example.*|*.example.com|*.example.org|*.example.net|*.example)
      die "DOMAIN in deploy/.env is '${domain:-unset}'. Set it to this machine's public host name, or use './studio.sh local' on a machine without one." ;;
  esac
}

# Exports Caddy's local root certificate from its volume and trusts it system-wide.
trust_local_ca() {
  local cert
  cert="$(mktemp -t studio-local-root)"
  compose run --rm --no-deps --entrypoint cat caddy /data/caddy/pki/authorities/local/root.crt > "$cert" 2>/dev/null \
    || die "could not read Caddy's local root certificate; start the stack once with './studio.sh local'"
  [[ -s $cert ]] || die "Caddy has not created its local certificate authority yet; start the stack once with './studio.sh local'"
  case "$(uname -s)" in
    Darwin)
      say "adding Caddy's local root certificate to the System keychain (macOS asks for your password)"
      sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$cert"
      say "trusted; browsers and the desktop app now accept $url"
      ;;
    *)
      say "root certificate saved at $cert"
      say "add it to the system trust store, e.g. copy it to /usr/local/share/ca-certificates/ and run update-ca-certificates"
      ;;
  esac
}

wait_for() { # url seconds
  local deadline=$(( $(date +%s) + $2 ))
  until curl -fsk -o /dev/null "$1"; do
    (( $(date +%s) < deadline )) || return 1
    sleep 2
  done
}

open_url() {
  if command -v open >/dev/null; then open "$1"
  elif command -v xdg-open >/dev/null; then xdg-open "$1" >/dev/null 2>&1
  fi
}

# ------------------------------------------------------------------- data commands

require_data_mode() {
  [[ $mode != dev ]] || die "the dev stack keeps its ledgers in apps/api/data on this machine and a throwaway database; backup, restore and update are for local and prod"
}

require_volume() {
  docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 \
    || die "volume $DATA_VOLUME does not exist; start the stack once with './studio.sh $mode' first"
}

# The database container, started and healthy; the other services are left as they are.
start_db() { compose up -d --wait --no-build postgres >/dev/null; }

# An absolute path for a command-line path, which is relative to where the command was typed.
absolute() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$INVOKED_FROM" "$1" ;; esac; }

db_query() { compose exec -T postgres psql -U studio -d "${2:-studio}" -tAqc "$1" | tr -d '[:space:]'; }

code_version() { sed -nE 's/^__version__ = "([^"]+)".*/\1/p' "$ROOT/apps/api/app/__init__.py"; }

# The newest migration in this checkout; a backup made by newer code carries one this code cannot run.
code_schema() {
  ls "$ROOT/apps/api/app/db/migrations/versions" | sed -nE 's/^([0-9]+)_.*\.py$/\1/p' | sort | tail -1
}

manifest_value() { sed -nE "s/^$1=(.*)\$/\1/p" "$2" | head -1; }

do_backup() { # [DIR]
  require_data_mode
  local dir stamp name work
  [[ $# -le 1 ]] || die "usage: ./studio.sh $mode backup [DIR]"
  dir="$(absolute "${1:-$BACKUPS}")"
  mkdir -p "$dir"
  dir="$(cd "$dir" && pwd)"
  stamp="$(date +%Y-%m-%d-%H%M%S)"
  name="beancount-studio-$mode-$stamp"
  work="$dir/.$name"
  mkdir "$work"
  trap 'rm -rf "$work"' EXIT
  say "backing up the $mode stack into $dir/$name.tar"
  require_volume
  start_db
  # Files first, then the database. A ledger created in between then has a directory but no row,
  # which the API ignores; the other order would leave a row whose files are missing.
  docker run --rm -v "$DATA_VOLUME:/data:ro" -v "$work:/backup" alpine:3 sh -ec '
    cd /data
    names=$(ls -A | grep -vx tmp || true)
    if [ -n "$names" ]; then tar czf /backup/data.tar.gz $names; else tar czf /backup/data.tar.gz -T /dev/null; fi' \
    || die "could not read volume $DATA_VOLUME"
  compose exec -T postgres pg_dump -U studio -d studio --format=custom --no-owner > "$work/database.dump" \
    || die "pg_dump failed"
  printf 'format=1\ncreated=%s\nmode=%s\nproject=%s\nversion=%s\nschema=%s\npostgres=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$mode" "$PROJECT" "$(code_version)" \
    "$(db_query 'SELECT version_num FROM alembic_version')" "$(db_query 'SHOW server_version')" \
    > "$work/manifest.txt"
  tar cf "$dir/$name.tar" -C "$work" manifest.txt database.dump data.tar.gz
  rm -rf "$work"
  trap - EXIT
  say "done: $dir/$name.tar ($(du -h "$dir/$name.tar" | awk '{print $1}'))"
}

do_restore() { # ARCHIVE [--yes]
  require_data_mode
  local archive="" yes=0 arg work made made_mode schema answer
  for arg in "$@"; do
    case "$arg" in
      --yes|-y) yes=1 ;;
      -*) die "unknown option '$arg' (usage: ./studio.sh $mode restore ARCHIVE [--yes])" ;;
      *) archive="$arg" ;;
    esac
  done
  [[ -n $archive ]] || die "usage: ./studio.sh $mode restore ARCHIVE [--yes]"
  archive="$(absolute "$archive")"
  [[ -f $archive ]] || die "$archive does not exist"
  mkdir -p "$BACKUPS"
  work="$(mktemp -d "$BACKUPS/.restore-XXXXXX")"
  trap 'rm -rf "$work"' EXIT
  tar xf "$archive" -C "$work" 2>/dev/null || die "could not unpack $archive"
  [[ -f $work/manifest.txt && -f $work/database.dump && -f $work/data.tar.gz ]] \
    || die "$archive is not a Beancount Studio backup (no manifest, database dump and data archive)"
  made="$(manifest_value created "$work/manifest.txt")"
  made_mode="$(manifest_value mode "$work/manifest.txt")"
  schema="$(manifest_value schema "$work/manifest.txt")"
  if [[ -n $schema && $schema > "$(code_schema)" ]]; then
    die "this backup carries database revision $schema, newer than this checkout's $(code_schema); update the code first, then restore"
  fi
  say "restoring $(basename "$archive") (made $made from the $made_mode stack, database revision ${schema:-unknown})"
  say "this replaces every ledger, upload, account and setting of the $mode stack (volume $DATA_VOLUME)"
  if (( ! yes )); then
    [[ -t 0 ]] || die "not running in a terminal; pass --yes to restore without asking"
    read -r -p "studio: type 'restore' to continue: " answer
    [[ $answer == restore ]] || die "cancelled, nothing was changed"
  fi
  require_volume
  start_db
  say "stopping the API while the data is replaced"
  compose stop api >/dev/null
  say "files: replacing the contents of $DATA_VOLUME"
  docker run --rm -v "$DATA_VOLUME:/data" -v "$work:/backup:ro" alpine:3 sh -ec "
    find /data -mindepth 1 -maxdepth 1 ! -name tmp -exec rm -rf {} +
    tar xzf /backup/data.tar.gz -C /data
    chown -R $API_UID:$API_UID /data" \
    || die "replacing the files failed; the API is stopped, check volume $DATA_VOLUME before './studio.sh $mode'"
  say "database: replacing studio"
  compose exec -T postgres psql -U studio -d postgres -v ON_ERROR_STOP=1 -q \
    -c "DROP DATABASE IF EXISTS studio WITH (FORCE)" -c "CREATE DATABASE studio OWNER studio" >/dev/null \
    || die "could not recreate the database; the API is stopped, check the postgres container before './studio.sh $mode'"
  compose exec -T postgres pg_restore -U studio -d studio --no-owner --exit-on-error < "$work/database.dump" \
    || die "pg_restore failed; the API is stopped and the database is incomplete, restore again or check the postgres container"
  rm -rf "$work"
  trap - EXIT
  say "starting the stack; the API applies any migrations newer than the backup"
  compose up -d >/dev/null
  wait_for "$url/api/healthz" 180 || die "containers are up but $url/api/healthz is not answering; run './studio.sh $mode logs'"
  say "restored; $url is up"
}

pull_code() {
  if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    say "not a git checkout; rebuilding from the code that is here"
  elif ! git -C "$ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    say "this checkout tracks no remote branch; rebuilding from the code that is here"
  else
    say "pulling the latest code"
    git -C "$ROOT" pull --ff-only \
      || die "git pull failed (uncommitted changes, or a branch that diverged); sort it out and run update again"
  fi
}

do_update() { # [--no-backup]
  require_data_mode
  local backup=1 arg
  for arg in "$@"; do
    case "$arg" in
      --no-backup) backup=0 ;;
      *) die "unknown option '$arg' (usage: ./studio.sh $mode update [--no-backup])" ;;
    esac
  done
  [[ $mode == prod ]] && require_domain
  pull_code
  if (( backup )); then
    do_backup
  else
    say "skipping the backup"
  fi
  say "rebuilding the images and restarting the $mode stack"
  compose pull --ignore-buildable --quiet
  compose up --build -d --remove-orphans
  wait_for "$url/api/healthz" 300 \
    || die "containers are up but $url/api/healthz is not answering; run './studio.sh $mode logs'"
  say "updated; $url is up (version $(code_version))"
}

# ------------------------------------------------------------------------- main

# Everything runs from inside this function so that `update` can replace this file mid-run
# (bash parses the whole function before it starts executing it).
main() {
  mode="${1:-dev}"
  if (( $# )); then shift; fi

  case "$mode" in
    dev)   files=(-f docker-compose.dev.yml) ;;
    local) files=(-f docker-compose.prod.yml -f docker-compose.local.yml) ;;
    prod)  files=(-f docker-compose.prod.yml) ;;
    -h|--help|help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown mode '$mode' (expected dev, local or prod; try --help)" ;;
  esac

  command -v docker >/dev/null || die "docker is not installed"
  command -v curl >/dev/null || die "curl is required to wait for the stack"
  docker info >/dev/null 2>&1 || die "Docker is not running"

  cd "$DEPLOY"

  case "$mode" in
    dev)   url="http://localhost:3000" ;;
    local) ensure_env; url="https://localhost:${BS_LOCAL_PORT:-$(env_value BS_LOCAL_PORT)}"
           [[ $url == https://localhost: ]] && url="https://localhost:8443" ;;
    prod)  ensure_env; domain="$(env_value DOMAIN)"; url="https://$domain" ;;
  esac

  case "${1:-}" in
    trust)
      [[ $mode == local ]] || die "trust is for the local stack: ./studio.sh local trust"
      trust_local_ca
      return
      ;;
    backup)  shift; do_backup "$@"; return ;;
    restore) shift; do_restore "$@"; return ;;
    update)  shift; do_update "$@"; return ;;
  esac

  # Pass-through: ./studio.sh <mode> <docker compose arguments>
  if (( $# )); then
    compose "$@"
    return
  fi

  say "starting the $mode stack ($url)"
  case "$mode" in
    dev)
      trap 'echo; say "stopping the dev stack"; compose stop' INT
      compose up --build -d
      if wait_for "$url/api/healthz" 300; then
        say "ready at $url"
        open_url "$url"
      else
        say "no answer from $url/api/healthz after 5 minutes; check the logs below" >&2
      fi
      say "streaming logs — Ctrl-C stops the stack; './studio.sh dev down' removes it"
      compose logs -f || true
      ;;
    local|prod)
      hint=""
      if [[ $mode == prod ]]; then
        require_domain
        hint=" (does $domain resolve to this machine, and are ports 80 and 443 reachable?)"
      fi
      compose up --build -d
      wait_for "$url/api/healthz" 180 \
        || die "containers are up but $url/api/healthz is not answering$hint; run './studio.sh $mode logs'"
      say "ready at $url (the first account created becomes the administrator)"
      if [[ $mode == local ]]; then
        if curl -fs -o /dev/null "$url/api/healthz"; then
          open_url "$url"
        else
          say "this machine does not trust Caddy's local certificate yet; run './studio.sh local trust' once, then open $url"
        fi
      fi
      ;;
  esac
}

main "$@"
