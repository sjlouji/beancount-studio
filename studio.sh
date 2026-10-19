#!/usr/bin/env bash
# Beancount Studio launcher — one command for the Docker stacks in deploy/.
#
#   ./studio.sh            same as "dev"
#   ./studio.sh dev        hot-reload development stack  → http://localhost:3000 (Ctrl-C stops it)
#   ./studio.sh local      production images on this machine → https://localhost:${BS_LOCAL_PORT:-8443}
#   ./studio.sh local trust  trust Caddy's local root certificate once (macOS keychain, asks for sudo)
#   ./studio.sh prod       production stack, Caddy with TLS for DOMAIN from deploy/.env
#
# Anything else after the mode is passed to docker compose for that stack, for example:
#   ./studio.sh dev down        ./studio.sh prod logs -f        ./studio.sh local ps
#
# local and prod create deploy/.env from .env.example when it does not exist yet and generate
# BS_SECRET_KEY and POSTGRES_PASSWORD if they are missing. dev only reads deploy/.env if present.
set -euo pipefail

DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")/deploy" && pwd)"
ENV_FILE="$DEPLOY/.env"

die() { printf 'studio: %s\n' "$*" >&2; exit 1; }
say() { printf 'studio: %s\n' "$*"; }

mode="${1:-dev}"
if (( $# )); then shift; fi

case "$mode" in
  dev)   files=(-f docker-compose.dev.yml) ;;
  local) files=(-f docker-compose.prod.yml -f docker-compose.local.yml) ;;
  prod)  files=(-f docker-compose.prod.yml) ;;
  -h|--help|help) sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) die "unknown mode '$mode' (expected dev, local or prod; try --help)" ;;
esac

command -v docker >/dev/null || die "docker is not installed"
command -v curl >/dev/null || die "curl is required to wait for the stack"
docker info >/dev/null 2>&1 || die "Docker is not running"

cd "$DEPLOY"
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

case "$mode" in
  dev)   url="http://localhost:3000" ;;
  local) ensure_env; url="https://localhost:${BS_LOCAL_PORT:-$(env_value BS_LOCAL_PORT)}"
         [[ $url == https://localhost: ]] && url="https://localhost:8443" ;;
  prod)  ensure_env; domain="$(env_value DOMAIN)"; url="https://$domain" ;;
esac

if [[ $mode == local && ${1:-} == trust ]]; then
  trust_local_ca
  exit
fi

# Pass-through: ./studio.sh <mode> <docker compose arguments>
if (( $# )); then
  compose "$@"
  exit
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
