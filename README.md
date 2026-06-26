# World of TUICraft Instrumentation

Local API and browser console for instrumenting the SSH-hosted TUICraft game at
`worldoftuicraft.thoughtlesslabs.com`.

## Run

```sh
bun install
bun run start
```

Open `http://localhost:8787`.

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

Modes:

- `smoke`: creates a disposable account/character if needed, opens help,
  moves in each direction, attacks, checks stats, and opens the changelog.
- `explore`: slower random movement plus command probing.
- `stress`: faster bounded movement/command probing for short load tests.
- `win`: progression-oriented play. It accepts/turns in quests, pathfinds over
  the visible TUI map, enters/exits dungeons, fights with conservative HP
  thresholds, and looks for explicit win/victory text.

The bot watches the visible terminal for obvious failure text such as
`Error:`, `Unhandled`, `Exception`, `undefined`, and `NaN`. If the remote game
server reboots or drops the SSH session during a run, the bot keeps the local
API alive, logs reconnect attempts, and resumes within its duration/action
budget when the game returns.

Generated bot passwords are redacted in `/api/raw`.
