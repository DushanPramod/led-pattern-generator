#!/usr/bin/env bash
#
#  LED Pattern Generator - local compile bridge (macOS / Linux)
#  ============================================================
#
#  A browser cannot run a compiler, so the hosted app hands that one job to
#  this script: it finds (or installs) arduino-cli, then serves the same small
#  HTTP API the local dev server exposes, on 127.0.0.1. The page in your
#  browser talks to it directly and reports the real Flash and SRAM figures
#  instead of estimating them.
#
#  Nothing is installed system-wide, no sudo is needed, and Node.js is not
#  involved - the server itself is the Python 3 that ships with macOS and with
#  every mainstream Linux.
#
#  Run it:
#      bash led-bridge.sh
#
#  Options:
#      --origin URL   Extra web origin allowed to talk to the bridge. Repeatable.
#                     The copy downloaded from the app already has its own
#                     origin baked in; you only need this if you self-host.
#      --port N       Force a port. By default the first free port in 8787-8790.
#      --no-install   Never download anything; fail if arduino-cli is missing.
#      --add-to-path  Add arduino-cli to your PATH without asking.
#      --no-path      Never touch your shell profile, and do not ask.
#      --help         This text.
#
#  Stop it with Ctrl+C.

set -euo pipefail

BRIDGE_VERSION="1.0.0"

# The app rewrites this line when you download the script from it, so the copy
# you get already trusts the site it came from and nothing else.
APP_ORIGIN="__APP_ORIGIN__"

INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/led-pattern-generator"
CLI_DIR="$INSTALL_ROOT/arduino-cli"

ORIGINS=()
PORT=0
NO_INSTALL=0
ADD_TO_PATH=0
NO_PATH=0

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_DIM=$'\033[2m'
else
  C_RESET=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_DIM=""
fi

step() { printf '  %s->%s %s\n' "$C_CYAN" "$C_RESET" "$1"; }
ok()   { printf '     %s%s%s\n' "$C_GREEN" "$1" "$C_RESET"; }
note() { printf '     %s%s%s\n' "$C_DIM" "$1" "$C_RESET"; }
warn() { printf '  %s!%s  %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
fail() { printf '  %sx%s  %s\n' "$C_RED" "$C_RESET" "$1" >&2; }

# Piping the script into bash leaves $0 as "bash", with no file to read back.
usage() {
  if [ -r "$0" ] && head -n1 "$0" | grep -q bash; then
    sed -n '2,40p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'
  else
    cat <<'HELP'
LED Pattern Generator - compile bridge

  --origin URL   Extra web origin allowed to talk to the bridge (repeatable)
  --port N       Force a port; by default the first free one in 8787-8790
  --no-install   Never download anything; fail if arduino-cli is missing
  --add-to-path  Add arduino-cli to your PATH without asking
  --no-path      Never touch your shell profile, and do not ask
HELP
  fi
}

# A prompt has to come from the terminal, not from stdin: piping this script
# into bash leaves stdin pointing at the pipe.
ask() {
  local prompt="$1" answer=""
  if [ -e /dev/tty ]; then
    printf '%s' "$prompt" > /dev/tty
    read -r answer < /dev/tty || answer=""
  fi
  printf '%s' "$answer"
}

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --origin)      ORIGINS+=("${2:-}"); shift 2 ;;
    --origin=*)    ORIGINS+=("${1#*=}"); shift ;;
    --port)        PORT="${2:-0}"; shift 2 ;;
    --port=*)      PORT="${1#*=}"; shift ;;
    --no-install)  NO_INSTALL=1; shift ;;
    --add-to-path) ADD_TO_PATH=1; shift ;;
    --no-path)     NO_PATH=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *)             fail "Unknown option: $1"; echo; usage; exit 2 ;;
  esac
done

case "$APP_ORIGIN" in
  __*) : ;;                       # placeholder left as shipped
  *)   ORIGINS+=("$APP_ORIGIN") ;;
esac

printf '\n  %sLED Pattern Generator - compile bridge%s\n' "$C_CYAN" "$C_RESET"
printf '  %sv%s%s\n\n' "$C_DIM" "$BRIDGE_VERSION" "$C_RESET"

# ---------------------------------------------------------------------------
# Finding arduino-cli
# ---------------------------------------------------------------------------

CLI=""

probe_cli() {
  local candidate="$1"
  [ -n "$candidate" ] || return 1
  [ -x "$candidate" ] || command -v "$candidate" >/dev/null 2>&1 || return 1
  "$candidate" version >/dev/null 2>&1 || return 1
  CLI="$candidate"
  return 0
}

# Just the number. `arduino-cli version` prints a whole line of commit and date
# as well, which reads badly after a label.
cli_version() {
  local reported
  reported="$("$CLI" version --format json 2>/dev/null |
    tr -d ' \t\n' | sed -n 's/.*"VersionString":"\([^"]*\)".*/\1/p')"
  if [ -n "$reported" ]; then
    printf '%s' "$reported"
  else
    "$CLI" version 2>/dev/null | head -n1
  fi
}

find_cli() {
  local bundled=()
  case "$(uname -s)" in
    Darwin)
      bundled+=("/Applications/Arduino IDE.app/Contents/resources/app/lib/backend/resources/arduino-cli")
      bundled+=("$HOME/Applications/Arduino IDE.app/Contents/resources/app/lib/backend/resources/arduino-cli")
      ;;
    *)
      bundled+=("/opt/Arduino IDE/resources/app/lib/backend/resources/arduino-cli")
      bundled+=("$HOME/.local/share/arduino-ide/resources/app/lib/backend/resources/arduino-cli")
      ;;
  esac

  local candidate
  for candidate in "${ARDUINO_CLI_PATH:-}" "${ARDUINO_CLI:-}" "$CLI_DIR/arduino-cli" \
                   "$(command -v arduino-cli 2>/dev/null || true)" "${bundled[@]}"; do
    probe_cli "$candidate" && return 0
  done
  return 1
}

# ---------------------------------------------------------------------------
# Installing arduino-cli
#
# Into your own home directory, from Arduino's official download host. No
# package manager, no sudo, nothing registered: deleting the folder undoes it.
# ---------------------------------------------------------------------------

cli_tarball() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin)
      case "$arch" in
        arm64|aarch64) echo "arduino-cli_latest_macOS_ARM64.tar.gz" ;;
        *)             echo "arduino-cli_latest_macOS_64bit.tar.gz" ;;
      esac ;;
    Linux)
      case "$arch" in
        x86_64|amd64)  echo "arduino-cli_latest_Linux_64bit.tar.gz" ;;
        aarch64|arm64) echo "arduino-cli_latest_Linux_ARM64.tar.gz" ;;
        armv7*|armv6*) echo "arduino-cli_latest_Linux_ARMv7.tar.gz" ;;
        i?86)          echo "arduino-cli_latest_Linux_32bit.tar.gz" ;;
        *)             echo "" ;;
      esac ;;
    *) echo "" ;;
  esac
}

download() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$dest"
  else
    fail "Neither curl nor wget is installed, so nothing can be downloaded."
    return 1
  fi
}

install_cli() {
  local tarball url tmp
  tarball="$(cli_tarball)"
  if [ -z "$tarball" ]; then
    fail "No arduino-cli build for $(uname -s)/$(uname -m)."
    note "Install it yourself: https://arduino.github.io/arduino-cli/latest/installation/"
    return 1
  fi
  url="https://downloads.arduino.cc/arduino-cli/$tarball"

  step "Downloading arduino-cli"
  note "$url"
  tmp="$(mktemp -d)"
  if ! download "$url" "$tmp/cli.tar.gz"; then
    rm -rf "$tmp"
    return 1
  fi

  step "Unpacking into $CLI_DIR"
  mkdir -p "$CLI_DIR"
  # The tarball holds arduino-cli plus a LICENSE and a README; only the binary
  # is wanted, but older tarballs have laid it out differently, so fall back.
  tar -xzf "$tmp/cli.tar.gz" -C "$CLI_DIR" arduino-cli 2>/dev/null ||
    tar -xzf "$tmp/cli.tar.gz" -C "$CLI_DIR"
  rm -rf "$tmp"
  chmod +x "$CLI_DIR/arduino-cli" 2>/dev/null || true

  if ! probe_cli "$CLI_DIR/arduino-cli"; then
    fail "arduino-cli was installed but will not run."
    return 1
  fi
  ok "arduino-cli $(cli_version) installed"
}

profile_file() {
  case "$(basename "${SHELL:-/bin/bash}")" in
    zsh)  echo "$HOME/.zshrc" ;;
    bash) [ "$(uname -s)" = "Darwin" ] && echo "$HOME/.bash_profile" || echo "$HOME/.bashrc" ;;
    fish) echo "$HOME/.config/fish/config.fish" ;;
    *)    echo "$HOME/.profile" ;;
  esac
}

add_to_path() {
  [ "$NO_PATH" -eq 1 ] && return 0
  case ":$PATH:" in *":$CLI_DIR:"*) return 0 ;; esac

  local rc line answer
  rc="$(profile_file)"
  if [ "$ADD_TO_PATH" -eq 0 ]; then
    echo
    printf '     Add arduino-cli to your PATH, so you can run it from any terminal?\n'
    printf '     %sThis appends one line to %s.%s\n' "$C_DIM" "$rc" "$C_RESET"
    answer="$(ask '     [Y/n] ')"
    case "$answer" in [nN]*) note "Left your profile alone. The bridge does not need it."; return 0 ;; esac
  fi

  case "$rc" in
    *config.fish) line="set -gx PATH \$PATH $CLI_DIR" ;;
    *)            line="export PATH=\"\$PATH:$CLI_DIR\"" ;;
  esac
  mkdir -p "$(dirname "$rc")"
  if [ -f "$rc" ] && grep -qF "$CLI_DIR" "$rc"; then
    note "$rc already mentions it."
  else
    printf '\n# added by the LED Pattern Generator compile bridge\n%s\n' "$line" >> "$rc"
    ok "Added to $rc"
  fi
  export PATH="$PATH:$CLI_DIR"
  note "Open a new terminal for arduino-cli to be found there."
}

# ---------------------------------------------------------------------------
# The AVR core
#
# A fresh arduino-cli has no board support at all, and compiling for an Uno
# without arduino:avr fails with a message nobody should have to decode.
# ---------------------------------------------------------------------------

ensure_core() {
  step "Checking board support"
  if "$CLI" core list 2>/dev/null | grep -q "arduino:avr"; then
    ok "arduino:avr is installed"
    return 0
  fi
  step "Installing Arduino AVR board support (one time, ~50 MB)"
  "$CLI" core update-index >/dev/null 2>&1 || warn "Could not refresh the package index."
  if "$CLI" core install arduino:avr; then
    ok "arduino:avr installed"
  else
    warn "arduino:avr did not install."
    note "The bridge still starts; compiling for an AVR board will fail until it does."
  fi
}

# ---------------------------------------------------------------------------
# Python 3 - the server itself
# ---------------------------------------------------------------------------

find_python() {
  local candidate
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 &&
       "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)' 2>/dev/null; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

python_hint() {
  fail "Python 3.7 or newer is required, and none was found."
  echo
  if [ "$(uname -s)" = "Darwin" ]; then
    note "macOS ships it with the developer tools. Install them with:"
    note "    xcode-select --install"
    note "or, if you use Homebrew:  brew install python3"
  elif command -v apt-get >/dev/null 2>&1; then
    note "sudo apt-get install -y python3"
  elif command -v dnf >/dev/null 2>&1; then
    note "sudo dnf install -y python3"
  elif command -v pacman >/dev/null 2>&1; then
    note "sudo pacman -S python"
  elif command -v zypper >/dev/null 2>&1; then
    note "sudo zypper install python3"
  else
    note "Install python3 with your distribution's package manager."
  fi
  echo
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

step "Looking for arduino-cli"
if find_cli; then
  ok "arduino-cli $(cli_version)"
  note "$CLI"
elif [ "$NO_INSTALL" -eq 1 ]; then
  fail "arduino-cli was not found, and --no-install was given."
  note "Install it from https://arduino.github.io/arduino-cli/latest/installation/"
  exit 1
else
  note "Not found - installing a private copy. No sudo needed."
  install_cli || exit 1
  add_to_path
fi

ensure_core

PYTHON="$(find_python || true)"
if [ -z "$PYTHON" ]; then
  python_hint
  exit 1
fi

SERVER="$(mktemp "${TMPDIR:-/tmp}/led-bridge-XXXXXX.py")"
cleanup() { rm -f "$SERVER"; }
trap cleanup EXIT INT TERM

cat > "$SERVER" <<'PYTHON_SERVER'
"""
The compile bridge itself.

Same HTTP API as the app's dev server exposes, so the page in the browser
cannot tell which one it is talking to. Everything about the compile - the
build directory keyed by content, the result cache, four builds at a time -
mirrors what the dev server does, because the optimiser leans on all three.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BRIDGE_VERSION = "1.0.0"
MARKER = "led-pattern-generator/arduino"
PORT_RANGE = (8787, 8788, 8789, 8790)
MAX_BATCH = 32
COMPILE_TIMEOUT = 180
MAX_BUILD_DIRS = 80
CONCURRENCY = max(2, min(4, (os.cpu_count() or 2) - 1))

BUILD_ROOT = os.path.join(tempfile.gettempdir(), "led-pattern-generator-build")
LOCALHOST_ORIGIN = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")

CLI = ""
ALLOWED = set()
COMPILES = 0

_cache = {}
_inflight = {}
_lock = threading.Lock()
_boards = {}


# ---------------------------------------------------------------------------
# arduino-cli
# ---------------------------------------------------------------------------

def run_cli(args, timeout=60):
    """Returns (returncode, stdout, stderr). A failed build still reports on stdout."""
    try:
        p = subprocess.run(
            [CLI, *args], capture_output=True, text=True, timeout=timeout,
        )
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired as exc:
        out = exc.stdout or ""
        err = exc.stderr or ""
        if isinstance(out, bytes):
            out = out.decode("utf-8", "replace")
        if isinstance(err, bytes):
            err = err.decode("utf-8", "replace")
        return -1, out, (err + f"\nTimed out after {timeout} seconds.")


def read_report(stdout):
    """arduino-cli prints its JSON report after any progress chatter."""
    at = stdout.find("{")
    if at < 0:
        return None
    try:
        return json.loads(stdout[at:])
    except ValueError:
        return None


def sizes(report):
    """Flash is the `text` section, SRAM globals the `data` section."""
    builder = (report or {}).get("builder_result") or report or {}
    sections = builder.get("executable_sections_size") or []
    out = {"flash": None, "flashMax": None, "sram": None, "sramMax": None}
    for s in sections:
        if s.get("name") == "text":
            out["flash"], out["flashMax"] = s.get("size"), s.get("max_size")
        elif s.get("name") == "data":
            out["sram"], out["sramMax"] = s.get("size"), s.get("max_size")
    return out


def safe_name(name):
    safe = re.sub(r"[^A-Za-z0-9_]", "_", name or "").strip("_")
    return (safe or "LedPattern")[:48]


def sketch_hash(sketch, fqbn):
    h = hashlib.sha1()
    h.update(fqbn.encode())
    h.update(b"\0")
    h.update(sketch.encode())
    return h.hexdigest()[:12]


def prune_builds():
    """A long optimiser search would otherwise fill the temp drive."""
    try:
        entries = [
            (os.path.getmtime(p), p)
            for p in (os.path.join(BUILD_ROOT, n) for n in os.listdir(BUILD_ROOT))
            if os.path.isdir(p)
        ]
        for _, path in sorted(entries, reverse=True)[MAX_BUILD_DIRS:]:
            shutil.rmtree(path, ignore_errors=True)
    except OSError:
        pass  # housekeeping must never fail a compile


def run_compile(sketch, fqbn, name):
    global COMPILES
    digest = sketch_hash(sketch, fqbn)
    safe = safe_name(name)
    root = os.path.join(BUILD_ROOT, digest)
    sketch_dir = os.path.join(root, safe)
    os.makedirs(sketch_dir, exist_ok=True)
    with open(os.path.join(sketch_dir, safe + ".ino"), "w", encoding="utf-8") as fh:
        fh.write(sketch)

    started = time.time()
    COMPILES += 1
    code, stdout, stderr = run_cli(
        [
            "compile", "--fqbn", fqbn, "--format", "json", "--no-color",
            "--build-path", os.path.join(root, "build"), sketch_dir,
        ],
        timeout=COMPILE_TIMEOUT,
    )
    report = read_report(stdout)
    ok = bool(report and report.get("success") is True)

    error = ""
    if not ok:
        parts = [report.get(k) for k in ("error", "compiler_err")] if report else []
        parts = [p for p in parts if isinstance(p, str) and p]
        if not parts and stderr:
            parts = [stderr]
        error = "\n\n".join(parts) or "Compilation failed."

    result = {
        "ok": ok,
        "fqbn": fqbn,
        **sizes(report),
        "output": (report or {}).get("compiler_out") if isinstance((report or {}).get("compiler_out"), str) else "",
        "error": error,
        "cached": False,
        "ms": int((time.time() - started) * 1000),
    }
    prune_builds()
    return result


def compile_one(sketch, fqbn, name):
    """
    One compile, deduplicated.

    The optimiser often asks for the same sketch twice in one round - a pass
    that does not apply produces byte-identical output to the baseline - and
    since the build directory is keyed by content, two such compiles would
    otherwise run in the same directory and corrupt each other.
    """
    key = fqbn + "::" + sketch_hash(sketch, fqbn)
    with _lock:
        hit = _cache.get(key)
        if hit:
            return {**hit, "cached": True}
        event = _inflight.get(key)
        owner = event is None
        if owner:
            event = threading.Event()
            _inflight[key] = event

    if not owner:
        event.wait(COMPILE_TIMEOUT + 30)
        with _lock:
            hit = _cache.get(key)
        if hit:
            return {**hit, "cached": True}
        return run_compile(sketch, fqbn, name)

    try:
        result = run_compile(sketch, fqbn, name)
        if result["ok"]:
            with _lock:
                _cache[key] = result
        return result
    finally:
        with _lock:
            _inflight.pop(key, None)
        event.set()


def compile_many(jobs, fqbn, name):
    """Four at a time: past that they only contend for the same cores."""
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = [pool.submit(compile_one, j["sketch"], fqbn, name) for j in jobs]
        return [f.result() for f in futures]


def list_boards():
    if "boards" in _boards:
        return _boards["boards"]
    _, stdout, _ = run_cli(["board", "listall", "--format", "json"])
    report = read_report(stdout) or {}
    found = [
        {"fqbn": b["fqbn"], "name": b["name"]}
        for b in report.get("boards") or []
        if b.get("fqbn") and b.get("name")
    ]
    found.sort(key=lambda b: b["name"])
    _boards["boards"] = found
    return found


def board_limits(fqbn):
    """Flash and SRAM ceilings come from the board's own build properties."""
    key = "limits:" + fqbn
    if key in _boards:
        return _boards[key]
    _, stdout, _ = run_cli(["board", "details", "--fqbn", fqbn, "--format", "json"])
    report = read_report(stdout) or {}
    props = {}
    for entry in report.get("build_properties") or []:
        at = entry.find("=")
        if at > 0:
            props[entry[:at]] = entry[at + 1:]

    def positive(name):
        try:
            value = int(props.get(name, ""))
        except ValueError:
            return None
        return value if value > 0 else None

    limits = {
        "fqbn": fqbn,
        "flashMax": positive("upload.maximum_size"),
        "sramMax": positive("upload.maximum_data_size"),
        "mcu": props.get("build.mcu"),
    }
    _boards[key] = limits
    return limits


# ---------------------------------------------------------------------------
# HTTP
#
# Only the browser enforces CORS, so the Origin header is checked here too: a
# page on some other site can still send a request to 127.0.0.1, and it gets a
# 403 before anything is compiled on its behalf.
# ---------------------------------------------------------------------------

def origin_allowed(origin):
    if not origin:
        return True  # curl, or a same-origin GET
    o = origin.rstrip("/").lower()
    return o in ALLOWED or bool(LOCALHOST_ORIGIN.match(o))


STATUS_PAGE = """<!doctype html><meta charset="utf-8"><title>LED compile bridge</title>
<style>
  body{{font:15px/1.6 system-ui,sans-serif;margin:0;padding:2.5rem;background:#0f1115;color:#e6e8ee}}
  h1{{font-size:1.15rem;margin:0 0 .25rem}}
  .ok{{color:#4ade80;font-weight:600}}
  dl{{display:grid;grid-template-columns:auto 1fr;gap:.35rem 1rem;margin:1.5rem 0 0}}
  dt{{color:#8b93a7}} code{{background:#1b1f2a;padding:.1rem .35rem;border-radius:4px}}
</style>
<h1>LED Pattern Generator - compile bridge</h1>
<p class="ok">Running.</p>
<p>Leave this running and go back to the app; the Memory tab will pick it up.</p>
<dl>
  <dt>Bridge</dt><dd>v{version} on <code>http://127.0.0.1:{port}</code></dd>
  <dt>arduino-cli</dt><dd><code>{cli}</code></dd>
  <dt>Allowed origins</dt><dd>{origins}</dd>
  <dt>Compiles served</dt><dd>{compiles}</dd>
</dl>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "led-bridge/" + BRIDGE_VERSION
    protocol_version = "HTTP/1.1"

    # ---- plumbing ----

    def log_message(self, fmt, *args):
        pass  # the interesting lines are printed by the handlers themselves

    def _cors(self, origin):
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type, x-led-bridge")
        self.send_header("Access-Control-Max-Age", "600")
        # Chrome's Private Network Access check: a page on the public internet
        # may only reach 127.0.0.1 if the preflight is answered with this.
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send(self, status, body, content_type, origin):
        payload = body.encode("utf-8")
        self.send_response(status)
        self._cors(origin)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        # A HEAD asks for the headers alone. Uptime checks use it, and a body
        # after one leaves the connection out of step with what was promised.
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _json(self, status, body, origin):
        self._send(status, json.dumps({"marker": MARKER, **body}), "application/json; charset=utf-8", origin)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    # ---- methods ----

    def do_OPTIONS(self):  # noqa: N802
        origin = self.headers.get("Origin") or ""
        allowed = origin_allowed(origin)
        self.send_response(204 if allowed else 403)
        self._cors(origin if allowed else "")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        self._dispatch("GET")

    def do_HEAD(self):  # noqa: N802
        self._dispatch("GET")

    def do_POST(self):  # noqa: N802
        self._dispatch("POST")

    def _dispatch(self, method):
        origin = self.headers.get("Origin") or ""
        if not origin_allowed(origin):
            print("  !  refused a request from " + origin)
            self._json(403, {"error": "This origin is not allowed to use the bridge."}, "")
            return
        echo = origin

        path, _, query = self.path.partition("?")
        path = path.rstrip("/") or "/"

        try:
            if path in ("/", "/index.html"):
                self._send(200, self._status_page(), "text/html; charset=utf-8", echo)
                return
            if not path.startswith("/api/arduino"):
                self._json(404, {"error": "No such route."}, echo)
                return

            route = path[len("/api/arduino"):] or "/"
            if route == "/status" and method == "GET":
                self._json(200, {
                    "available": True,
                    "version": cli_version(),
                    "path": CLI,
                    "bridge": {"version": BRIDGE_VERSION, "port": self.server.server_address[1],
                               "platform": sys.platform},
                }, echo)
            elif route == "/boards" and method == "GET":
                self._json(200, {"boards": list_boards()}, echo)
            elif route == "/board" and method == "GET":
                fqbn = parse_query(query).get("fqbn")
                if not fqbn:
                    self._json(400, {"error": "fqbn is required"}, echo)
                else:
                    self._json(200, board_limits(fqbn), echo)
            elif route == "/compile" and method == "POST":
                self._compile(echo)
            elif route == "/compile-batch" and method == "POST":
                self._compile_batch(echo)
            else:
                self._json(404, {"error": "No such route."}, echo)
        except Exception as exc:  # noqa: BLE001 - one bad request must not stop the server
            print("  x  request failed: " + str(exc))
            try:
                self._json(500, {"error": str(exc)}, echo)
            except OSError:
                pass

    def _compile(self, echo):
        body = self._body()
        sketch, fqbn = body.get("sketch"), body.get("fqbn")
        if not sketch or not fqbn:
            self._json(400, {"error": "sketch and fqbn required"}, echo)
            return
        result = compile_one(sketch, fqbn, body.get("name") or "LedPattern")
        print("     compile {} - flash {}, sram {}, {} ms".format(
            fqbn, result["flash"], result["sram"], result["ms"]))
        self._json(200, result, echo)

    def _compile_batch(self, echo):
        body = self._body()
        fqbn = body.get("fqbn")
        jobs = body.get("jobs") or []
        if not fqbn or not jobs:
            self._json(400, {"error": "jobs and fqbn required"}, echo)
            return
        if len(jobs) > MAX_BATCH:
            self._json(400, {"error": "at most {} jobs".format(MAX_BATCH)}, echo)
            return
        if any(not j.get("id") or not j.get("sketch") for j in jobs):
            self._json(400, {"error": "every job needs an id and a sketch"}, echo)
            return

        started = time.time()
        results = compile_many(jobs, fqbn, body.get("name") or "LedPattern")
        fresh = sum(0 if r["cached"] else 1 for r in results)
        print("     batch of {} ({} compiled) in {:.1f}s".format(
            len(jobs), fresh, time.time() - started))
        self._json(200, {"results": [
            {
                "id": job["id"], "ok": r["ok"], "flash": r["flash"], "sram": r["sram"],
                "flashMax": r["flashMax"], "sramMax": r["sramMax"],
                "error": r["error"], "cached": r["cached"], "ms": r["ms"],
            }
            for job, r in zip(jobs, results)
        ]}, echo)

    def _status_page(self):
        return STATUS_PAGE.format(
            version=BRIDGE_VERSION,
            port=self.server.server_address[1],
            cli=CLI,
            origins=", ".join(sorted(ALLOWED)) or "(none configured - localhost only)",
            compiles=COMPILES,
        )


def paint(code, text):
    """Colour, but only for a terminal: redirected output should stay readable."""
    if not sys.stdout.isatty():
        return text
    return "\033[{}m{}\033[0m".format(code, text)


def parse_query(query):
    from urllib.parse import parse_qs
    return {k: v[0] for k, v in parse_qs(query).items()}


_version_cache = {}


def cli_version():
    if "v" not in _version_cache:
        _, stdout, _ = run_cli(["version", "--format", "json"], timeout=20)
        report = read_report(stdout) or {}
        _version_cache["v"] = report.get("VersionString") or report.get("version") or "unknown"
    return _version_cache["v"]


def main():
    global CLI, ALLOWED
    parser = argparse.ArgumentParser()
    parser.add_argument("--cli", required=True)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--origin", action="append", default=[])
    args = parser.parse_args()

    CLI = args.cli
    ALLOWED = {o.rstrip("/").lower() for o in args.origin if o and not o.startswith("__")}
    os.makedirs(BUILD_ROOT, exist_ok=True)

    ports = (args.port,) if args.port else PORT_RANGE
    httpd = None
    for port in ports:
        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if httpd is None:
        print("  x  No free port. Tried {}. Pass --port to choose another."
              .format(", ".join(str(p) for p in ports)))
        return 1
    httpd.daemon_threads = True

    port = httpd.server_address[1]
    print("")
    print("  " + paint("32", "Bridge is running."))
    print("  " + paint("36", "http://127.0.0.1:{}".format(port)))
    print("")
    if ALLOWED:
        print("     " + paint("2", "Reachable from: " + ", ".join(sorted(ALLOWED))))
    else:
        print("  " + paint("33", "!") + "  No app origin configured, so only pages on localhost may use it.")
        print("     " + paint("2", "Download the script from the app itself, or pass --origin https://your-app-url"))
    print("     " + paint("2", "Compiling up to {} sketches at a time.".format(CONCURRENCY)))
    print("")
    print("  Go back to the app and open the Memory tab. Keep this window open.")
    print("  " + paint("2", "Press Ctrl+C to stop."))
    print("")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        print("\n  " + paint("2", "Bridge stopped."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
PYTHON_SERVER

PY_ARGS=(--cli "$CLI" --port "$PORT")
for origin in ${ORIGINS[@]+"${ORIGINS[@]}"}; do
  PY_ARGS+=(--origin "$origin")
done

# -u so the banner and each compile line appear as they happen, even when
# the output is being piped into a log rather than a terminal.
"$PYTHON" -u "$SERVER" "${PY_ARGS[@]}"
