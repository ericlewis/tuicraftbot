# World of TUICraft Instrumentation

Local API and browser console for instrumenting the SSH-hosted TUICraft game at
`worldoftuicraft.thoughtlesslabs.com`.

## Run

```sh
bun install
bun run dev
```

Open `http://localhost:8787`.

`bun run dev` uses Bun hot reload and keeps the local process alive while
reloading the HTTP handler and bot methods. Use `bun run dev:restart` only when
you intentionally want file changes to restart the whole process.

## Configuration

Environment variables:

- `WORLD_TUICRAFT_HOST`: SSH host, defaults to `worldoftuicraft.thoughtlesslabs.com`
- `WORLD_TUICRAFT_PORT`: SSH port, defaults to `22`
- `WORLD_TUICRAFT_USER`: SSH username, defaults to the local `USER`
- `WORLD_TUICRAFT_COLS`: remote terminal columns, defaults to `120`
- `WORLD_TUICRAFT_ROWS`: remote terminal rows, defaults to `36`
- `WORLD_TUICRAFT_WIDTH`: terminal pixel width, defaults to `1200`
- `WORLD_TUICRAFT_HEIGHT`: terminal pixel height, defaults to `720`
- `WORLD_TUICRAFT_HOST_FINGERPRINT`: optional SHA256 host key fingerprint
- `WORLD_TUICRAFT_AUTOSTART`: set to `false` to avoid connecting on boot
- `PORT`: API port, defaults to `8787`

## API

- `GET /api/session`: connection state and counters
- `POST /api/session/start`: start the SSH session
- `POST /api/session/restart`: reconnect
- `POST /api/session/stop`: close the session
- `GET /api/screen`: current terminal buffer as JSON
- `GET /api/raw?limit=50`: recent raw SSH output/input chunks
- `GET /api/events`: server-sent event stream
- `POST /api/input`: send input, for example `{"key":"up"}` or `{"text":"hello"}`
- `POST /api/resize`: resize terminal, for example `{"cols":140,"rows":40}`

## Bot automation

The browser console includes bot controls, and the same controls are available
over HTTP:

- `GET /api/bot`: current bot run status
- `GET /api/bot/log?limit=100`: recent bot log entries
- `POST /api/bot/start`: start a run
- `POST /api/bot/stop`: stop the current run

Example:

```sh
curl -X POST http://localhost:8787/api/bot/start \
  -H 'content-type: application/json' \
  --data '{"mode":"stress","durationSeconds":10,"intervalMs":120,"maxActions":80}'
```

To resume an existing character, include the account credentials. Passwords are
used only for the login prompt and are redacted from raw telemetry:

```sh
curl -X POST http://localhost:8787/api/bot/start \
  -H 'content-type: application/json' \
  --data '{"mode":"win","accountUsername":"codex...","accountPassword":"...","characterName":"Codex..."}'
```

The same resume flow is available as an environment-driven helper so credentials
do not need to be committed:

```sh
BOT_ACCOUNT_USERNAME=codex... \
BOT_ACCOUNT_PASSWORD=... \
BOT_CHARACTER_NAME=Codex... \
bun run bot:resume
```

`bot:resume` defaults to a 1200 ms action interval and `BOT_MAX_RECONNECTS=6`
so server restarts, kicks, or bans do not cause aggressive reconnect loops. The
bot also stops with an error finding when the visible terminal reports a kick,
ban, rate limit, access denial, or terminated session.

Modes:

- `smoke`: creates a disposable account/character if needed, opens help,
  moves in each direction, attacks, checks stats, and opens the changelog.
- `explore`: slower random movement plus command probing.
- `stress`: faster bounded movement/command probing for short load tests.
- `win`: progression-oriented play. It accepts/turns in quests, pathfinds over
  the visible TUI map, enters/exits dungeons, fights with conservative HP
  thresholds, and looks for explicit win/victory text.

Win mode asks a small OpenAI model ensemble to arbitrate risky tactical choices
such as boss engagement, retreat, and adjacent combat by default. The judge can
only choose from deterministic candidate actions, so it cannot invent arbitrary
commands:

```sh
TUICRAFT_JUDGE_MODELS='gpt-5.5:medium,gpt-5.4-mini:low,gpt-5.4-nano:low' \
bun run bot:resume
```

The default budget is 96 total model calls, which is 32 tactical decisions with
the default three-model ensemble. Use `TUICRAFT_JUDGE_MAX_CALLS`,
`TUICRAFT_JUDGE_COOLDOWN_MS`, and `TUICRAFT_JUDGE_TIMEOUT_MS` to bound cost and
latency. Use `TUICRAFT_JUDGE_ENABLED=false` to disable ensemble judging.

Chat participation is enabled by default, but gated: the bot only replies when
the visible chat appears to address `Codex...`/`codex` or when a reply is
strategically needed. It does not proactively spam chat. Use
`TUICRAFT_CHAT_ENABLED=false` to disable it.

The bot watches the visible terminal for obvious failure text such as
`Error:`, `Unhandled`, `Exception`, `undefined`, and `NaN`. If the remote game
server reboots or drops the SSH session during a run, the bot keeps the local
API alive, logs reconnect attempts, and resumes within its duration/action
budget when the game returns.

Generated bot passwords are redacted in `/api/raw`.

## State art generator

Generate a consistent TUICraft tactical concept prompt from the current local
screen:

```sh
bun run art:state -- --prompt-only
```

With `OPENAI_API_KEY` set, the script calls the OpenAI Images API. Pass the
reference image to keep the same portrait/map composition and style:

```sh
OPENAI_API_KEY=... \
bun run art:state -- \
  --reference "/Users/ericlewis/Downloads/Generated image 1.png" \
  --out output/tuicraft-state.png
```

Defaults are `gpt-image-2`, `2048x1152`, and `medium` quality. Override them
with `--model`, `--size`, and `--quality`, or the `TUICRAFT_ART_MODEL`,
`TUICRAFT_ART_SIZE`, and `TUICRAFT_ART_QUALITY` environment variables. Use
`--template` to ignore the live screen and regenerate from the base
Codex9tqnwg/Northshire/Fargodeep template.

To generate ongoing state-art captures through the MCP control server every
five minutes while a run is active:

```sh
bun run art:watch -- \
  --interval-seconds 300 \
  --duration-seconds 1800 \
  --max-captures 6 \
  --reference "/Users/ericlewis/Downloads/Generated image 1.png"
```

Use `--prompt-only` to write prompts without calling the image API.

## MCP server

Run a local stdio MCP server that wraps the instrumentation API, bot controls,
manual input, session reconnect, and art generator:

```sh
bun run mcp
```

Typical local client configuration points at the command above from this repo
directory. The server reads `TUICRAFT_API` for the local API base and can reuse
`BOT_ACCOUNT_USERNAME`, `BOT_ACCOUNT_PASSWORD`, and `BOT_CHARACTER_NAME` for
the `tuicraft_start_bot` tool without committing credentials.

Exposed tools:

- `tuicraft_get_session`: SSH bridge status and counters
- `tuicraft_start_session`: start the SSH bridge
- `tuicraft_stop_session`: stop the SSH bridge
- `tuicraft_get_screen`: current screen plus parsed state summary
- `tuicraft_get_bot`: bot status and recent logs
- `tuicraft_get_raw`: recent redacted SSH telemetry chunks
- `tuicraft_start_bot`: bounded bot run with reconnect caps
- `tuicraft_stop_bot`: stop current bot run
- `tuicraft_send_input`: manual key/text input
- `tuicraft_enter_command`: submit a slash/chat command line
- `tuicraft_resize_terminal`: resize the local terminal/PTY
- `tuicraft_restart_session`: reconnect SSH bridge
- `tuicraft_state_art`: generate the state-art prompt or image output
- `tuicraft_snapshot`: capture session, screen summary, bot/logs, optional raw
  telemetry, and optional state-art output

Resources are available at `tuicraft://screen`, `tuicraft://bot`, and
`tuicraft://session`, `tuicraft://bot/log`, and `tuicraft://raw`.
