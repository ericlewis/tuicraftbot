import { EventEmitter } from "node:events";
import { Terminal } from "@xterm/headless";
import { Client, type ClientChannel } from "ssh2";

type BridgeStatus = "idle" | "connecting" | "connected" | "closed" | "error";
type Direction = "from-game" | "to-game";

type InstrumentEvent = {
  id: number;
  type: string;
  ts: string;
  data: unknown;
};

type RawChunk = {
  ts: string;
  direction: Direction;
  bytes: number;
  base64: string;
  escaped: string;
  source?: string;
};

type ScreenSnapshot = {
  cols: number;
  rows: number;
  cursorX: number;
  cursorY: number;
  title: string;
  lines: string[];
  text: string;
  frame: number;
  ts: string;
};

type BotMode = "smoke" | "explore" | "stress" | "win";
type BotStatus = "idle" | "running" | "completed" | "stopped" | "error";

type BotLog = {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
  data?: unknown;
};

type BotRunOptions = {
  mode?: BotMode;
  durationMs?: number;
  intervalMs?: number;
  maxActions?: number;
  accountUsername?: string;
  accountPassword?: string;
  characterName?: string;
};

type BotRunSummary = {
  id?: string;
  mode?: BotMode;
  status: BotStatus;
  startedAt?: string;
  stoppedAt?: string;
  durationMs?: number;
  intervalMs?: number;
  maxActions?: number;
  actionCount: number;
  reconnectCount?: number;
  lastActionAt?: string;
  accountUsername?: string;
  characterName?: string;
  findings: string[];
};

class RingBuffer<T> {
  private values: T[] = [];

  constructor(private readonly capacity: number) {}

  push(value: T): void {
    this.values.push(value);
    if (this.values.length > this.capacity) {
      this.values.splice(0, this.values.length - this.capacity);
    }
  }

  toArray(limit = this.capacity): T[] {
    return this.values.slice(Math.max(0, this.values.length - limit));
  }
}

type BridgeOptions = {
  host: string;
  port: number;
  username: string;
  cols: number;
  rows: number;
  width: number;
  height: number;
  expectedFingerprint?: string;
};

const KEY_BYTES: Record<string, string> = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  enter: "\r",
  return: "\r",
  escape: "\x1b",
  esc: "\x1b",
  tab: "\t",
  backspace: "\x7f",
  delete: "\x1b[3~",
  home: "\x1b[H",
  end: "\x1b[F",
  pageup: "\x1b[5~",
  pagedown: "\x1b[6~",
  ctrl_c: "\x03",
  ctrl_d: "\x04",
  ctrl_l: "\x0c",
  space: " ",
  w: "w",
  a: "a",
  s: "s",
  d: "d",
  q: "q",
  e: "e"
};

class GameBridge {
  private conn?: Client;
  private channel?: ClientChannel;
  private terminal: Terminal;
  private readonly events = new RingBuffer<InstrumentEvent>(1000);
  private readonly rawChunks = new RingBuffer<RawChunk>(500);
  private readonly emitter = new EventEmitter();
  private eventId = 0;
  private status: BridgeStatus = "idle";
  private lastError?: string;
  private connectedAt?: string;
  private closedAt?: string;
  private lastActivityAt?: string;
  private inboundBytes = 0;
  private outboundBytes = 0;
  private frame = 0;
  private title = "";
  private screenTimer?: Timer;

  constructor(private options: BridgeOptions) {
    this.terminal = this.createTerminal(options.cols, options.rows);
  }

  getEvents(limit?: number): InstrumentEvent[] {
    return this.events.toArray(limit);
  }

  getRaw(limit?: number): RawChunk[] {
    return this.rawChunks.toArray(limit);
  }

  getSummary(): Record<string, unknown> {
    return {
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
      status: this.status,
      cols: this.options.cols,
      rows: this.options.rows,
      width: this.options.width,
      height: this.options.height,
      connectedAt: this.connectedAt,
      closedAt: this.closedAt,
      lastActivityAt: this.lastActivityAt,
      inboundBytes: this.inboundBytes,
      outboundBytes: this.outboundBytes,
      frame: this.frame,
      lastError: this.lastError
    };
  }

  subscribe(listener: (event: InstrumentEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  async start(): Promise<void> {
    if (this.status === "connecting" || this.status === "connected") {
      return;
    }

    this.resetTerminal();
    this.status = "connecting";
    this.lastError = undefined;
    this.closedAt = undefined;
    this.emit("status", this.getSummary());

    const conn = new Client();
    this.conn = conn;

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const fail = (error: Error) => {
        this.lastError = error.message;
        this.status = "error";
        this.closedAt = new Date().toISOString();
        this.emit("error", { message: error.message });
        this.emit("status", this.getSummary());
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      conn.on("ready", () => {
        conn.shell(
          {
            term: "xterm-256color",
            cols: this.options.cols,
            rows: this.options.rows,
            width: this.options.width,
            height: this.options.height
          },
          (error, channel) => {
            if (error) {
              fail(error);
              return;
            }

            this.channel = channel;
            this.status = "connected";
            this.connectedAt = new Date().toISOString();
            this.lastActivityAt = this.connectedAt;
            this.emit("status", this.getSummary());

            channel.on("data", (data: Buffer) => this.handleGameData(data));
            channel.stderr.on("data", (data: Buffer) => this.handleGameData(data, "stderr"));
            channel.on("close", () => this.handleClose("channel closed"));
            channel.on("exit", (code: number | null, signal: string | null) => {
              this.emit("exit", { code, signal });
            });

            if (!settled) {
              settled = true;
              resolve();
            }
          }
        );
      });

      conn.on("error", fail);
      conn.on("close", () => this.handleClose("connection closed"));
      conn.on("end", () => this.handleClose("connection ended"));

      conn.connect({
        host: this.options.host,
        port: this.options.port,
        username: this.options.username,
        readyTimeout: 15_000,
        keepaliveInterval: 10_000,
        keepaliveCountMax: 3,
        hostHash: "sha256",
        hostVerifier: (hashedKey: string) => {
          if (!this.options.expectedFingerprint) {
            return true;
          }
          const normalized = this.options.expectedFingerprint.replace(/^SHA256:/, "");
          return hashedKey === normalized;
        }
      });
    });
  }

  async restart(): Promise<void> {
    this.stop();
    await sleep(150);
    await this.start();
  }

  stop(): void {
    if (this.channel) {
      this.channel.end();
      this.channel = undefined;
    }
    if (this.conn) {
      this.conn.end();
      this.conn = undefined;
    }
    this.handleClose("stopped");
  }

  resize(cols: number, rows: number, width?: number, height?: number): ScreenSnapshot {
    this.options = {
      ...this.options,
      cols,
      rows,
      width: width ?? this.options.width,
      height: height ?? this.options.height
    };
    this.terminal.resize(cols, rows);
    this.channel?.setWindow(rows, cols, this.options.height, this.options.width);
    const snapshot = this.getScreen();
    this.emit("screen", snapshot);
    return snapshot;
  }

  publish(type: string, data: unknown): void {
    this.emit(type, data);
  }

  sendInput(input: { key?: string; text?: string; repeat?: number; source?: string; redact?: boolean }): void {
    const repeat = clampInteger(input.repeat ?? 1, 1, 100);
    const text = input.text ?? (input.key ? KEY_BYTES[input.key.toLowerCase()] : undefined);
    if (!text) {
      throw new Error("Provide text or a supported key");
    }
    for (let i = 0; i < repeat; i += 1) {
      this.writeToGame(text, input.source ?? "api", input.redact ?? false);
    }
  }

  getScreen(): ScreenSnapshot {
    const buffer = this.terminal.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < this.options.rows; y += 1) {
      lines.push(buffer.getLine(y)?.translateToString(false) ?? "");
    }
    return {
      cols: this.options.cols,
      rows: this.options.rows,
      cursorX: buffer.cursorX,
      cursorY: buffer.cursorY,
      title: this.title,
      lines,
      text: lines.join("\n"),
      frame: this.frame,
      ts: new Date().toISOString()
    };
  }

  private createTerminal(cols: number, rows: number): Terminal {
    const terminal = new Terminal({
      cols,
      rows,
      allowProposedApi: true,
      scrollback: 500
    });

    terminal.onData((data) => {
      this.writeToGame(data, "terminal-reply");
    });
    terminal.onTitleChange((title) => {
      this.title = title;
    });

    return terminal;
  }

  private resetTerminal(): void {
    this.terminal.dispose();
    this.title = "";
    this.terminal = this.createTerminal(this.options.cols, this.options.rows);
    this.frame = 0;
  }

  private handleGameData(data: Buffer, source = "stdout"): void {
    this.inboundBytes += data.length;
    this.lastActivityAt = new Date().toISOString();
    this.rawChunks.push({
      ts: this.lastActivityAt,
      direction: "from-game",
      bytes: data.length,
      base64: data.toString("base64"),
      escaped: escapeControlBytes(data),
      source
    });
    this.emit("raw", { direction: "from-game", bytes: data.length, source });

    this.writeProbeResponses(data);
    this.terminal.write(data, () => this.scheduleScreenEvent());
  }

  private writeToGame(data: string | Buffer, source: string, redact = false): void {
    if (!this.channel || this.status !== "connected") {
      throw new Error("SSH session is not connected");
    }
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.channel.write(buffer);
    this.outboundBytes += buffer.length;
    const ts = new Date().toISOString();
    this.lastActivityAt = ts;
    this.rawChunks.push({
      ts,
      direction: "to-game",
      bytes: buffer.length,
      base64: redact ? "" : buffer.toString("base64"),
      escaped: redact ? "[redacted]" : escapeControlBytes(buffer),
      source
    });
    this.emit("input", { bytes: buffer.length, source });
  }

  private writeProbeResponses(data: Buffer): void {
    if (!this.channel || this.status !== "connected") {
      return;
    }

    const text = data.toString("latin1");
    const responses: string[] = [];

    if (text.includes("\x1b[14t")) {
      responses.push(`\x1b[4;${this.options.height};${this.options.width}t`);
    }
    if (text.includes("\x1b[18t")) {
      responses.push(`\x1b[8;${this.options.rows};${this.options.cols}t`);
    }
    if (/\x1b\]10;\?(\x07|\x1b\\)/.test(text)) {
      responses.push("\x1b]10;rgb:ffff/ffff/ffff\x07");
    }
    if (/\x1b\]11;\?(\x07|\x1b\\)/.test(text)) {
      responses.push("\x1b]11;rgb:0000/0000/0000\x07");
    }
    if (text.includes("\x1b[?u")) {
      responses.push("\x1b[?0u");
    }
    if (text.includes("\x1b[>0q") || text.includes("\x1b[>q")) {
      responses.push("\x1bP>|xterm.js(5.5.0)\x1b\\");
    }
    if (text.includes("\x1bP+q4d73\x1b\\")) {
      responses.push("\x1bP0+r4d73\x1b\\");
    }

    for (const response of responses) {
      this.writeToGame(response, "probe-reply");
    }
  }

  private scheduleScreenEvent(): void {
    if (this.screenTimer) {
      return;
    }
    this.screenTimer = setTimeout(() => {
      this.screenTimer = undefined;
      this.frame += 1;
      this.emit("screen", this.getScreen());
    }, 50);
  }

  private handleClose(reason: string): void {
    if (this.status === "closed" || this.status === "idle") {
      return;
    }
    this.status = "closed";
    this.closedAt = new Date().toISOString();
    this.emit("close", { reason });
    this.emit("status", this.getSummary());
  }

  private emit(type: string, data: unknown): void {
    const event: InstrumentEvent = {
      id: ++this.eventId,
      type,
      ts: new Date().toISOString(),
      data
    };
    this.events.push(event);
    this.emitter.emit("event", event);
  }
}

type BotAction = {
  label: string;
  key?: string;
  text?: string;
  command?: string;
  redact?: boolean;
};

type Point = {
  x: number;
  y: number;
};

type GameEntity = Point & {
  kind: string;
};

type ParsedGameState = {
  mapName?: string;
  mapLevel?: number;
  level: number;
  hp?: { current: number; max: number };
  xp?: { current: number; max: number };
  gold?: number;
  targetLevel?: number;
  inTown: boolean;
  inDungeon: boolean;
  player?: Point;
  entities: GameEntity[];
  grid: string[][];
  text: string;
  questInProgress: boolean;
  questComplete: boolean;
  dead: boolean;
  winText: boolean;
};

type BotRunState = {
  id: string;
  mode: BotMode;
  status: BotStatus;
  startedAt: string;
  stoppedAt?: string;
  startedMs: number;
  durationMs: number;
  intervalMs: number;
  maxActions: number;
  actionCount: number;
  lastActionAt?: string;
  accountUsername: string;
  accountPassword: string;
  characterName: string;
  reuseExistingAccount: boolean;
  findings: string[];
  findingKeys: Set<string>;
  smokeStep: number;
  stopRequested: boolean;
  reconnectCount: number;
  nextReconnectLogAt: number;
  lastAttackAt: number;
  questAccepted: boolean;
  questComplete: boolean;
};

class BotRunner {
  private run?: BotRunState;
  private readonly logs = new RingBuffer<BotLog>(1000);

  constructor(private readonly bridge: GameBridge) {}

  getSummary(): BotRunSummary {
    if (!this.run) {
      return {
        status: "idle",
        actionCount: 0,
        findings: []
      };
    }

    return {
      id: this.run.id,
      mode: this.run.mode,
      status: this.run.status,
      startedAt: this.run.startedAt,
      stoppedAt: this.run.stoppedAt,
      durationMs: this.run.durationMs,
      intervalMs: this.run.intervalMs,
      maxActions: this.run.maxActions,
      actionCount: this.run.actionCount,
      reconnectCount: this.run.reconnectCount,
      lastActionAt: this.run.lastActionAt,
      accountUsername: this.run.accountUsername,
      characterName: this.run.characterName,
      findings: [...this.run.findings]
    };
  }

  getLogs(limit?: number): BotLog[] {
    return this.logs.toArray(limit);
  }

  start(options: BotRunOptions = {}): BotRunSummary {
    if (this.run?.status === "running") {
      throw new Error("Bot is already running");
    }

    const mode = options.mode ?? "smoke";
    const defaults = defaultBotOptions(mode);
    const suffix = Math.random().toString(36).slice(2, 8);
    const requestedUsername = options.accountUsername?.trim();
    const requestedPassword = options.accountPassword?.trim();
    const requestedCharacter = options.characterName?.trim();
    const reuseExistingAccount = Boolean(requestedUsername && requestedPassword);
    const run: BotRunState = {
      id: `bot-${Date.now().toString(36)}-${suffix}`,
      mode,
      status: "running",
      startedAt: new Date().toISOString(),
      startedMs: Date.now(),
      durationMs: clampInteger(options.durationMs ?? defaults.durationMs, 5_000, 600_000),
      intervalMs: clampInteger(options.intervalMs ?? defaults.intervalMs, 100, 10_000),
      maxActions: clampInteger(options.maxActions ?? defaults.maxActions, 1, 5_000),
      actionCount: 0,
      accountUsername: requestedUsername || `codex${Date.now().toString(36).slice(-7)}${suffix.slice(0, 2)}`,
      accountPassword: requestedPassword || `codex-pass-${suffix}`,
      characterName: requestedCharacter || `Codex${suffix}`,
      reuseExistingAccount,
      findings: [],
      findingKeys: new Set(),
      smokeStep: 0,
      stopRequested: false,
      reconnectCount: 0,
      nextReconnectLogAt: 0,
      lastAttackAt: 0,
      questAccepted: false,
      questComplete: false
    };

    this.run = run;
    this.log("info", "bot started", { mode: run.mode, durationMs: run.durationMs, maxActions: run.maxActions });
    this.publishStatus();
    void this.loop(run);
    return this.getSummary();
  }

  stop(reason = "stopped"): BotRunSummary {
    if (this.run?.status === "running") {
      this.run.stopRequested = true;
      this.run.status = "stopped";
      this.run.stoppedAt = new Date().toISOString();
      this.log("warn", reason);
      this.publishStatus();
    }
    return this.getSummary();
  }

  private async loop(run: BotRunState): Promise<void> {
    try {
      while (
        this.run === run &&
        run.status === "running" &&
        !run.stopRequested &&
        Date.now() - run.startedMs < run.durationMs &&
        run.actionCount < run.maxActions
      ) {
        const connected = await this.ensureConnected(run);
        if (!connected) {
          await sleep(Math.max(2_000, run.intervalMs));
          continue;
        }
        await this.tick(run);
        await sleep(this.nextDelay(run));
      }

      if (this.run === run && run.status === "running") {
        run.status = "completed";
        run.stoppedAt = new Date().toISOString();
        this.log("info", "bot completed", { actions: run.actionCount, findings: run.findings.length });
        this.publishStatus();
      }
    } catch (error) {
      if (this.run === run) {
        run.status = "error";
        run.stoppedAt = new Date().toISOString();
        this.addFinding(run, `bot error: ${error instanceof Error ? error.message : String(error)}`);
        this.log("error", "bot failed", { error: error instanceof Error ? error.message : String(error) });
        this.publishStatus();
      }
    }
  }

  private async ensureConnected(run: BotRunState): Promise<boolean> {
    const summary = this.bridge.getSummary();
    if (summary.status === "connected") {
      return true;
    }
    if (summary.status === "connecting") {
      return false;
    }

    try {
      run.reconnectCount += 1;
      this.logReconnect(run, `remote session ${String(summary.status)}, reconnecting`);
      await this.bridge.start();
      return this.bridge.getSummary().status === "connected";
    } catch (error) {
      this.logReconnect(run, `remote reconnect failed: ${error instanceof Error ? error.message : String(error)}`);
      this.publishStatus();
      return false;
    }
  }

  private async tick(run: BotRunState): Promise<void> {
    const screen = this.bridge.getScreen();
    this.detectFindings(run, screen.text);

    const setupAction = this.chooseSetupAction(run, screen.text);
    if (setupAction) {
      await this.sendAction(run, setupAction);
      return;
    }

    if (!this.isInWorld(screen.text)) {
      await this.sendAction(run, { label: "nudge unknown screen", key: "enter" });
      return;
    }

    const action =
      run.mode === "smoke"
        ? this.nextSmokeAction(run)
        : run.mode === "win"
          ? this.nextWinAction(run, screen)
          : this.nextExplorationAction(run, run.mode === "stress");
    if (!action) {
      run.status = "completed";
      run.stoppedAt = new Date().toISOString();
      this.log("info", "smoke script completed", { actions: run.actionCount });
      this.publishStatus();
      return;
    }

    await this.sendAction(run, action);
  }

  private chooseSetupAction(run: BotRunState, text: string): BotAction | undefined {
    if (/Press any key to dismiss/i.test(text)) {
      return { label: "dismiss modal", key: "space" };
    }
    if (/Please log in or register/i.test(text)) {
      if (run.reuseExistingAccount) {
        return { label: "choose login", text: "1\r" };
      }
      return { label: "choose register", text: "2\r" };
    }
    if (/Please enter your account username/i.test(text)) {
      return { label: "enter account username", text: `${run.accountUsername}\r` };
    }
    if (/Please enter your password/i.test(text)) {
      return { label: "enter account password", text: `${run.accountPassword}\r`, redact: true };
    }
    if (/Choose a unique username/i.test(text)) {
      return { label: "enter generated username", text: `${run.accountUsername}\r` };
    }
    if (/Choose a password/i.test(text)) {
      return { label: "enter generated password", text: `${run.accountPassword}\r`, redact: true };
    }
    if (/Select a character/i.test(text)) {
      if (run.reuseExistingAccount) {
        const characterSlot = run.characterName
          ? text.match(new RegExp(`Type\\s+(\\d+)\\s+to\\s+load:\\s+${escapeRegExp(run.characterName)}\\b`, "i"))?.[1]
          : undefined;
        const firstSlot = text.match(/Type\s+(\d+)\s+to\s+load:/i)?.[1];
        const slot = characterSlot ?? firstSlot;
        if (slot) {
          return { label: "load existing character", text: `${slot}\r` };
        }
      }
      return { label: "create new character", text: "new\r" };
    }
    if (/Type 'new' to create a new character/i.test(text)) {
      return { label: "create new character", text: "new\r" };
    }
    if (/Choose Character Class/i.test(text)) {
      return { label: "choose warrior", text: "1\r" };
    }
    if (/Enter a name for your new character/i.test(text)) {
      return { label: "enter generated character", text: `${run.characterName}\r` };
    }
    if (/Invalid choice/i.test(text) && /Account Login|Account Registration/i.test(text)) {
      return { label: "recover registration choice", text: "2\r" };
    }
    return undefined;
  }

  private isInWorld(text: string): boolean {
    return /\[Map:/.test(text) || /Character Stats/.test(text) || /Combat Log/.test(text);
  }

  private nextSmokeAction(run: BotRunState): BotAction | undefined {
    const actions: BotAction[] = [
      { label: "open help", command: "/help" },
      { label: "move north", key: "w" },
      { label: "move west", key: "a" },
      { label: "move south", key: "s" },
      { label: "move east", key: "d" },
      { label: "attack", key: "space" },
      { label: "open stats", command: `/stats ${run.characterName}` },
      { label: "open changelog", command: "/changelog" },
      { label: "dismiss final modal", key: "space" }
    ];
    return actions[run.smokeStep++];
  }

  private nextExplorationAction(run: BotRunState, stress: boolean): BotAction {
    const roll = Math.random();
    if (!stress && roll < 0.08) {
      return this.commandAction(run);
    }
    if (stress && roll < 0.18) {
      return this.commandAction(run);
    }
    if (roll > 0.9) {
      return { label: "attack", key: "space" };
    }

    const movement = ["w", "a", "s", "d"] as const;
    const key = movement[Math.floor(Math.random() * movement.length)];
    return { label: `move ${key.toUpperCase()}`, key };
  }

  private commandAction(run: BotRunState): BotAction {
    const commands = [
      "/help",
      "/changelog",
      `/stats ${run.characterName}`,
      "/inventory",
      "/quests",
      "/who"
    ];
    const text = commands[Math.floor(Math.random() * commands.length)];
    return { label: `command ${text.trim()}`, command: text.trim() };
  }

  private nextWinAction(run: BotRunState, screen: ScreenSnapshot): BotAction | undefined {
    const state = this.parseGameState(screen);
    if (state.winText) {
      run.status = "completed";
      run.stoppedAt = new Date().toISOString();
      this.log("info", "win text detected", { map: state.mapName, actions: run.actionCount });
      this.publishStatus();
      return undefined;
    }

    if (state.dead) {
      return { label: "recover from death", command: "/stuck" };
    }

    if (state.questInProgress) {
      run.questAccepted = true;
    }
    if (state.questComplete) {
      run.questComplete = true;
    }

    if (state.inTown) {
      const hpRatio = state.hp ? state.hp.current / state.hp.max : 1;
      if (state.hp && hpRatio < 0.95) {
        const healStep = this.stepToward(state, ["I"], "onto");
        if (healStep) {
          return { label: "go to inn to heal", key: healStep };
        }
        return { label: "rest in town", key: "space" };
      }

      if (run.questComplete || state.questComplete) {
        const questStep = this.stepToward(state, ["Q"], "adjacent");
        if (questStep) {
          return { label: "return to quest board", key: questStep };
        }
        run.questComplete = false;
        run.questAccepted = false;
        return { label: "claim quest reward", command: "/quest claim" };
      }

      if (!run.questAccepted && !state.questInProgress) {
        const questStep = this.stepToward(state, ["Q"], "adjacent");
        if (questStep) {
          return { label: "go to quest board", key: questStep };
        }
        run.questAccepted = true;
        return { label: "accept elite quest", command: "/quest accept" };
      }

      const doorStep = this.stepToward(state, ["D"], "onto");
      if (doorStep) {
        return { label: "enter dungeon", key: doorStep };
      }
      return { label: "probe town", key: "d" };
    }

    if (state.inDungeon) {
      const hpRatio = state.hp ? state.hp.current / state.hp.max : 1;
      const targetIsRisky = Boolean(state.targetLevel && state.targetLevel > state.level);
      if (targetIsRisky) {
        const exitStep = this.stepToward(state, ["D"], "onto");
        if (exitStep) {
          return { label: "avoid over-level target", key: exitStep };
        }
        return { label: "avoid over-level target", key: "s" };
      }
      if (hpRatio < (targetIsRisky ? 0.82 : 0.65)) {
        const exitStep = this.stepToward(state, ["D"], "onto");
        if (exitStep) {
          return { label: "retreat to door", key: exitStep };
        }
      }

      const shouldHuntBoss =
        run.questAccepted &&
        Boolean(state.hp && hpRatio > 0.88) &&
        state.level >= Math.max(3, state.mapLevel ?? 3);
      const adjacentEnemy = this.hasAdjacent(state, shouldHuntBoss ? ["M", "B"] : ["M"]);
      if (adjacentEnemy) {
        run.lastAttackAt = Date.now();
        return { label: "attack adjacent enemy", key: "space" };
      }

      const targetKinds = shouldHuntBoss ? ["B", "M"] : ["M"];
      const fightStep = this.stepToward(state, targetKinds, "adjacent");
      if (fightStep) {
        return { label: shouldHuntBoss ? "hunt elite or boss" : "hunt mob", key: fightStep };
      }

      const canGoDeeper = state.level >= (state.mapLevel ?? 1) + 1 && hpRatio > 0.85;
      if (canGoDeeper) {
        const deeperStep = this.stepToward(state, ["D"], "onto");
        if (deeperStep) {
          return { label: "take dungeon door", key: deeperStep };
        }
      }
    }

    return this.nextExplorationAction(run, false);
  }

  private parseGameState(screen: ScreenSnapshot): ParsedGameState {
    const mapName = screen.text.match(/\[Map: ([^\]]+)\]/)?.[1];
    const mapLevelMatch = mapName?.match(/\(Lvl\s+(\d+)\)/);
    const characterText = screen.lines.slice(0, 12).join("\n");
    const levelMatch =
      characterText.match(/\bLvl\s+(\d+)\s+\((Warrior|Rogue|Mage)\)/) ??
      characterText.match(/\(Lvl\s+(\d+)\)/);
    const level = Number(levelMatch?.[1] ?? 1);
    const hpMatch = screen.text.match(/(?:Your\s+)?HP:\s*(\d+)\/(\d+)/);
    const xpMatch = screen.text.match(/XP:\s*(\d+)\/(\d+)/);
    const goldMatch = screen.text.match(/GP:\s*(\d+)g/);
    const targetLevelMatch = screen.text.match(/--- Target ---[\s\S]*?Level:\s*(\d+)/);
    const grid: string[][] = [];
    const entities: GameEntity[] = [];
    let player: Point | undefined;

    for (let y = 2; y <= 18; y += 1) {
      const row = [...(screen.lines[y]?.slice(1, 84) ?? "")];
      grid[y] = row;
      for (let x = 0; x < row.length; x += 1) {
        const kind = row[x];
        if (kind === "@") {
          player = { x, y };
        }
        if ("DQSICMB".includes(kind)) {
          entities.push({ x, y, kind });
        }
      }
    }

    return {
      mapName,
      mapLevel: mapLevelMatch ? Number(mapLevelMatch[1]) : undefined,
      level,
      hp: hpMatch ? { current: Number(hpMatch[1]), max: Number(hpMatch[2]) } : undefined,
      xp: xpMatch ? { current: Number(xpMatch[1]), max: Number(xpMatch[2]) } : undefined,
      gold: goldMatch ? Number(goldMatch[1]) : undefined,
      targetLevel: targetLevelMatch ? Number(targetLevelMatch[1]) : undefined,
      inTown: Boolean(mapName && /Town|Abbey/i.test(mapName)),
      inDungeon: Boolean(mapName && !/Town|Abbey/i.test(mapName)),
      player,
      entities,
      grid,
      text: screen.text,
      questInProgress: /Status:\s*In Progress|Quest '.*' accepted|Progress:\s*Kill/i.test(screen.text),
      questComplete: /Status:\s*Complete|Quest complete|Reward claimed/i.test(screen.text),
      dead: hpMatch ? Number(hpMatch[1]) <= 0 : /You are dead|You have died/i.test(screen.text),
      winText: /you win|victory|congratulations|world saved|final boss defeated|game cleared/i.test(screen.text)
    };
  }

  private hasAdjacent(state: ParsedGameState, kinds: string[]): boolean {
    if (!state.player) {
      return false;
    }
    return state.entities.some((entity) => {
      return kinds.includes(entity.kind) && manhattan(state.player!, entity) === 1;
    });
  }

  private stepToward(state: ParsedGameState, kinds: string[], mode: "onto" | "adjacent"): string | undefined {
    if (!state.player) {
      return undefined;
    }
    const targets = state.entities.filter((entity) => kinds.includes(entity.kind));
    if (targets.length === 0) {
      return undefined;
    }
    const path = this.pathfind(state, targets, mode);
    return path[0];
  }

  private pathfind(state: ParsedGameState, targets: GameEntity[], mode: "onto" | "adjacent"): string[] {
    if (!state.player) {
      return [];
    }

    const targetKeys = new Set(targets.map((target) => `${target.x},${target.y}`));
    const queue: Point[] = [state.player];
    const previous = new Map<string, (Point & { key: string }) | null>([[`${state.player.x},${state.player.y}`, null]]);
    const directions: Array<[string, number, number]> = [
      ["w", 0, -1],
      ["s", 0, 1],
      ["a", -1, 0],
      ["d", 1, 0]
    ];
    let found: Point | undefined;

    while (queue.length > 0 && !found) {
      const current = queue.shift()!;
      if (mode === "onto" && targetKeys.has(`${current.x},${current.y}`)) {
        found = current;
        break;
      }
      if (
        mode === "adjacent" &&
        targets.some((target) => manhattan(current, target) === 1)
      ) {
        found = current;
        break;
      }

      for (const [key, dx, dy] of directions) {
        const next = { x: current.x + dx, y: current.y + dy };
        const nextKey = `${next.x},${next.y}`;
        if (previous.has(nextKey)) {
          continue;
        }
        if (!this.isWalkable(state.grid[next.y]?.[next.x], mode === "onto" && targetKeys.has(nextKey))) {
          continue;
        }
        previous.set(nextKey, { ...current, key });
        queue.push(next);
      }
    }

    if (!found) {
      return [];
    }

    const keys: string[] = [];
    let current = found;
    while (`${current.x},${current.y}` !== `${state.player.x},${state.player.y}`) {
      const prev = previous.get(`${current.x},${current.y}`);
      if (!prev) {
        break;
      }
      keys.push(prev.key);
      current = { x: prev.x, y: prev.y };
    }
    return keys.reverse();
  }

  private isWalkable(char: string | undefined, isTarget: boolean): boolean {
    if (!char || char === "█" || char === " " || char === "P") {
      return false;
    }
    if (["M", "B"].includes(char)) {
      return isTarget;
    }
    return true;
  }

  private async sendAction(run: BotRunState, action: BotAction): Promise<void> {
    try {
      if (action.command) {
        await this.sendCommand(run, action.command);
      } else {
        if (action.key && ["w", "a", "s", "d", "space", "enter"].includes(action.key)) {
          this.bridge.sendInput({ key: "escape", source: `bot:${run.mode}` });
        }
        this.bridge.sendInput({
          key: action.key,
          text: action.text,
          source: `bot:${run.mode}`,
          redact: action.redact
        });
      }
    } catch (error) {
      this.logReconnect(run, `input paused: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    run.actionCount += 1;
    run.lastActionAt = new Date().toISOString();
    this.bridge.publish("bot_action", {
      id: run.id,
      mode: run.mode,
      action: action.label,
      count: run.actionCount
    });
    if (run.mode !== "stress" || run.actionCount % 10 === 0 || action.text) {
      this.log("info", action.label, { count: run.actionCount });
    }
    this.publishStatus();
  }

  private async sendCommand(run: BotRunState, command: string): Promise<void> {
    this.bridge.sendInput({ key: "escape", source: `bot:${run.mode}` });
    await sleep(40);
    this.bridge.sendInput({ text: "/", source: `bot:${run.mode}` });
    await sleep(80);
    this.bridge.sendInput({ text: command, source: `bot:${run.mode}` });
    await sleep(40);
    this.bridge.sendInput({ key: "enter", source: `bot:${run.mode}` });
  }

  private detectFindings(run: BotRunState, text: string): void {
    const patterns = [
      /Error:\s*[^\n│]+/gi,
      /Unhandled[^\n│]*/gi,
      /Exception[^\n│]*/gi,
      /Traceback[^\n│]*/gi,
      /\bundefined\b/gi,
      /\bNaN\b/g
    ];

    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        this.addFinding(run, normalizeWhitespace(match[0]));
      }
    }
  }

  private addFinding(run: BotRunState, finding: string): void {
    const key = finding.toLowerCase();
    if (run.findingKeys.has(key)) {
      return;
    }
    run.findingKeys.add(key);
    run.findings.push(finding);
    this.log("warn", "finding detected", { finding });
  }

  private logReconnect(run: BotRunState, message: string): void {
    const now = Date.now();
    if (now < run.nextReconnectLogAt) {
      return;
    }
    run.nextReconnectLogAt = now + 5_000;
    this.log("warn", message, { reconnectCount: run.reconnectCount });
  }

  private nextDelay(run: BotRunState): number {
    const jitter = Math.floor(Math.random() * Math.min(150, Math.max(20, run.intervalMs / 3)));
    return run.intervalMs + jitter;
  }

  private log(level: BotLog["level"], message: string, data?: unknown): void {
    const entry: BotLog = {
      ts: new Date().toISOString(),
      level,
      message,
      data
    };
    this.logs.push(entry);
    this.bridge.publish("bot_log", entry);
  }

  private publishStatus(): void {
    this.bridge.publish("bot_status", this.getSummary());
  }
}

const bridge = new GameBridge({
  host: process.env.WORLD_TUICRAFT_HOST ?? "worldoftuicraft.thoughtlesslabs.com",
  port: readIntegerEnv("WORLD_TUICRAFT_PORT", 22),
  username: process.env.WORLD_TUICRAFT_USER ?? process.env.USER ?? "player",
  cols: readIntegerEnv("WORLD_TUICRAFT_COLS", 120),
  rows: readIntegerEnv("WORLD_TUICRAFT_ROWS", 36),
  width: readIntegerEnv("WORLD_TUICRAFT_WIDTH", 1200),
  height: readIntegerEnv("WORLD_TUICRAFT_HEIGHT", 720),
  expectedFingerprint: process.env.WORLD_TUICRAFT_HOST_FINGERPRINT
});
const bot = new BotRunner(bridge);

const port = readIntegerEnv("PORT", 8787);

const server = Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      if (request.method === "GET" && url.pathname === "/") {
        return html(INDEX_HTML);
      }
      if (request.method === "GET" && url.pathname === "/api/session") {
        return json(bridge.getSummary());
      }
      if (request.method === "POST" && url.pathname === "/api/session/start") {
        await bridge.start();
        return json(bridge.getSummary());
      }
      if (request.method === "POST" && url.pathname === "/api/session/restart") {
        await bridge.restart();
        return json(bridge.getSummary());
      }
      if (request.method === "POST" && url.pathname === "/api/session/stop") {
        bridge.stop();
        return json(bridge.getSummary());
      }
      if (request.method === "GET" && url.pathname === "/api/screen") {
        return json(bridge.getScreen());
      }
      if (request.method === "GET" && url.pathname === "/api/raw") {
        return json({ chunks: bridge.getRaw(readLimit(url, 50)) });
      }
      if (request.method === "GET" && url.pathname === "/api/bot") {
        return json(bot.getSummary());
      }
      if (request.method === "GET" && url.pathname === "/api/bot/log") {
        return json({ logs: bot.getLogs(readLimit(url, 100)) });
      }
      if (request.method === "POST" && url.pathname === "/api/bot/start") {
        const body = await readJson(request);
        return json(bot.start(parseBotOptions(body)));
      }
      if (request.method === "POST" && url.pathname === "/api/bot/stop") {
        return json(bot.stop());
      }
      if (request.method === "GET" && url.pathname === "/api/events") {
        return eventStream(bridge);
      }
      if (request.method === "POST" && url.pathname === "/api/input") {
        const body = await readJson(request);
        bridge.sendInput({
          key: stringValue(body.key),
          text: stringValue(body.text),
          repeat: numberValue(body.repeat),
          source: "api",
          redact: Boolean(body.redact)
        });
        return json({ ok: true, session: bridge.getSummary() });
      }
      if (request.method === "POST" && url.pathname === "/api/resize") {
        const body = await readJson(request);
        const cols = clampInteger(numberValue(body.cols) ?? 120, 20, 300);
        const rows = clampInteger(numberValue(body.rows) ?? 36, 10, 120);
        const width = clampInteger(numberValue(body.width) ?? cols * 10, 100, 5000);
        const height = clampInteger(numberValue(body.height) ?? rows * 20, 100, 5000);
        return json(bridge.resize(cols, rows, width, height));
      }
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }

    return json({ error: "Not found" }, 404);
  }
});

console.log(`World of TUICraft instrumentation API listening on http://localhost:${server.port}`);

if (process.env.WORLD_TUICRAFT_AUTOSTART !== "false") {
  bridge.start().catch((error) => {
    console.error("Failed to start TUICraft session:", error);
  });
}

function eventStream(activeBridge: GameBridge): Response {
  const encoder = new TextEncoder();
  let heartbeat: Timer | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      unsubscribe = activeBridge.subscribe((event) => {
        controller.enqueue(encoder.encode(formatSse(event)));
      });
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 5_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) {
        clearInterval(heartbeat);
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...corsHeaders()
    }
  });
}

function formatSse(event: InstrumentEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function html(value: string): Response {
  return new Response(value, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON body must be an object");
  }
  return parsed as Record<string, unknown>;
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clampInteger(value, 1, 10_000);
}

function readLimit(url: URL, fallback: number): number {
  return clampInteger(Number(url.searchParams.get("limit") ?? fallback), 1, 500);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseBotOptions(body: Record<string, unknown>): BotRunOptions {
  const mode = stringValue(body.mode);
  const durationSeconds = numberValue(body.durationSeconds);
  const durationMs = numberValue(body.durationMs) ?? (durationSeconds ? durationSeconds * 1000 : undefined);
  return {
    mode: mode === "smoke" || mode === "explore" || mode === "stress" || mode === "win" ? mode : undefined,
    durationMs,
    intervalMs: numberValue(body.intervalMs),
    maxActions: numberValue(body.maxActions),
    accountUsername: nonEmptyStringValue(body.accountUsername),
    accountPassword: nonEmptyStringValue(body.accountPassword),
    characterName: nonEmptyStringValue(body.characterName)
  };
}

function defaultBotOptions(mode: BotMode): Required<Pick<BotRunOptions, "durationMs" | "intervalMs" | "maxActions">> {
  if (mode === "win") {
    return { durationMs: 600_000, intervalMs: 700, maxActions: 2_000 };
  }
  if (mode === "stress") {
    return { durationMs: 60_000, intervalMs: 125, maxActions: 600 };
  }
  if (mode === "explore") {
    return { durationMs: 180_000, intervalMs: 450, maxActions: 500 };
  }
  return { durationMs: 60_000, intervalMs: 650, maxActions: 60 };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function nonEmptyStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeControlBytes(data: Buffer): string {
  return data
    .toString("latin1")
    .replace(/\x1b/g, "\\e")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (char) => {
      return `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`;
    });
}

const INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>World of TUICraft Instrumentation</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0d10;
      --panel: #121820;
      --panel-2: #18212b;
      --text: #eef3f7;
      --muted: #93a4b3;
      --accent: #30d4a4;
      --warn: #f3b35c;
      --line: #2b3946;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 16px;
      min-height: 100vh;
      padding: 16px;
    }
    .terminal, aside {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      min-width: 0;
    }
    .terminal {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: var(--panel-2);
    }
    h1 {
      margin: 0;
      font-size: 14px;
      font-weight: 650;
      letter-spacing: 0;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--warn);
    }
    .dot.connected { background: var(--accent); }
    pre {
      margin: 0;
      padding: 14px;
      min-height: 0;
      overflow: auto;
      color: #f7fbff;
      background: #050708;
      font: 13px/1.12 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      white-space: pre;
    }
    aside {
      padding: 12px;
      display: grid;
      align-content: start;
      gap: 12px;
    }
    .group {
      display: grid;
      gap: 8px;
    }
    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    button, input, select {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #1d2732;
      color: var(--text);
      min-height: 34px;
      padding: 0 10px;
      font: inherit;
    }
    button {
      cursor: pointer;
      min-width: 42px;
    }
    button:hover {
      border-color: var(--accent);
    }
    button.primary {
      background: #13362f;
      border-color: #206a59;
    }
    input, select {
      width: 100%;
    }
    input[type="number"] {
      width: 92px;
    }
    .bot-log {
      display: grid;
      gap: 4px;
      max-height: 190px;
      overflow: auto;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0c1117;
      color: var(--muted);
      font: 12px/1.35 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }
    .bot-log div {
      overflow-wrap: anywhere;
    }
    dl {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 6px 10px;
      margin: 0;
      color: var(--muted);
      font-size: 12px;
    }
    dt { color: #c8d3dd; }
    dd {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (max-width: 860px) {
      main { grid-template-columns: 1fr; }
      aside { order: -1; }
      pre { min-height: 60vh; }
    }
  </style>
</head>
<body>
  <main>
    <section class="terminal">
      <header>
        <h1>World of TUICraft</h1>
        <span class="status"><span id="dot" class="dot"></span><span id="status">starting</span></span>
      </header>
      <pre id="screen"></pre>
    </section>
    <aside>
      <div class="group">
        <div class="row">
          <button class="primary" data-action="start">Start</button>
          <button data-action="restart">Restart</button>
          <button data-action="stop">Stop</button>
        </div>
      </div>
      <div class="group">
        <div class="row">
          <select id="bot-mode" aria-label="Bot mode">
            <option value="smoke">smoke</option>
            <option value="explore">explore</option>
            <option value="stress">stress</option>
            <option value="win">win</option>
          </select>
          <input id="bot-duration" aria-label="Bot seconds" type="number" min="5" max="600" value="60">
        </div>
        <input id="bot-account" autocomplete="off" spellcheck="false" placeholder="Account username">
        <input id="bot-password" autocomplete="off" spellcheck="false" type="password" placeholder="Account password">
        <input id="bot-character" autocomplete="off" spellcheck="false" placeholder="Character name">
        <div class="row">
          <button class="primary" data-bot-action="start">Run Bot</button>
          <button data-bot-action="stop">Stop Bot</button>
        </div>
        <dl id="bot-meta"></dl>
        <div id="bot-log" class="bot-log"></div>
      </div>
      <div class="group">
        <div class="row">
          <button data-key="up">Up</button>
        </div>
        <div class="row">
          <button data-key="left">Left</button>
          <button data-key="down">Down</button>
          <button data-key="right">Right</button>
        </div>
        <div class="row">
          <button data-key="w">W</button>
          <button data-key="a">A</button>
          <button data-key="s">S</button>
          <button data-key="d">D</button>
        </div>
        <div class="row">
          <button data-key="enter">Enter</button>
          <button data-key="escape">Esc</button>
          <button data-key="q">Q</button>
        </div>
      </div>
      <form id="text-form" class="group">
        <input id="text-input" autocomplete="off" spellcheck="false" placeholder="Text input">
      </form>
      <dl id="meta"></dl>
    </aside>
  </main>
  <script>
    const screenEl = document.getElementById("screen");
    const statusEl = document.getElementById("status");
    const dotEl = document.getElementById("dot");
    const metaEl = document.getElementById("meta");
    const textForm = document.getElementById("text-form");
    const textInput = document.getElementById("text-input");
    const botMode = document.getElementById("bot-mode");
    const botDuration = document.getElementById("bot-duration");
    const botAccount = document.getElementById("bot-account");
    const botPassword = document.getElementById("bot-password");
    const botCharacter = document.getElementById("bot-character");
    const botMetaEl = document.getElementById("bot-meta");
    const botLogEl = document.getElementById("bot-log");

    const keyMap = new Map([
      ["ArrowUp", "up"],
      ["ArrowDown", "down"],
      ["ArrowLeft", "left"],
      ["ArrowRight", "right"],
      ["Enter", "enter"],
      ["Escape", "escape"]
    ]);

    function renderScreen(snapshot) {
      screenEl.textContent = snapshot.text || snapshot.lines.join("\n");
      screenEl.scrollTop = 0;
    }

    function renderSession(session) {
      statusEl.textContent = session.status;
      dotEl.classList.toggle("connected", session.status === "connected");
      metaEl.innerHTML = [
        ["host", session.host],
        ["user", session.username],
        ["frame", session.frame],
        ["in", session.inboundBytes],
        ["out", session.outboundBytes],
        ["last", session.lastActivityAt || ""],
        ["error", session.lastError || ""]
      ].map(([key, value]) => "<dt>" + key + "</dt><dd>" + value + "</dd>").join("");
    }

    function renderBot(bot) {
      botMetaEl.innerHTML = [
        ["bot", bot.status],
        ["mode", bot.mode || ""],
        ["actions", bot.actionCount],
        ["char", bot.characterName || ""],
        ["findings", (bot.findings || []).length]
      ].map(([key, value]) => "<dt>" + escapeHtml(String(key)) + "</dt><dd>" + escapeHtml(String(value)) + "</dd>").join("");
    }

    function renderBotLogs(logs) {
      botLogEl.innerHTML = logs.slice(-18).map((entry) => {
        const data = entry.data ? " " + JSON.stringify(entry.data) : "";
        return "<div>[" + escapeHtml(entry.level) + "] " + escapeHtml(entry.message + data) + "</div>";
      }).join("");
      botLogEl.scrollTop = botLogEl.scrollHeight;
    }

    function appendBotLog(entry) {
      const div = document.createElement("div");
      const data = entry.data ? " " + JSON.stringify(entry.data) : "";
      div.textContent = "[" + entry.level + "] " + entry.message + data;
      botLogEl.append(div);
      while (botLogEl.children.length > 18) botLogEl.firstChild.remove();
      botLogEl.scrollTop = botLogEl.scrollHeight;
    }

    function escapeHtml(value) {
      return value.replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }

    async function post(path, body = {}) {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        console.warn(await response.text());
      }
      return response.json().catch(() => ({}));
    }

    async function refresh() {
      const [session, screen, bot, botLog] = await Promise.all([
        fetch("/api/session").then((r) => r.json()),
        fetch("/api/screen").then((r) => r.json()),
        fetch("/api/bot").then((r) => r.json()),
        fetch("/api/bot/log").then((r) => r.json())
      ]);
      renderSession(session);
      renderScreen(screen);
      renderBot(bot);
      renderBotLogs(botLog.logs || []);
    }

    document.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      const key = target.dataset.key;
      const action = target.dataset.action;
      const botAction = target.dataset.botAction;
      if (key) post("/api/input", { key });
      if (action === "start") post("/api/session/start").then(renderSession);
      if (action === "restart") post("/api/session/restart").then(renderSession);
      if (action === "stop") post("/api/session/stop").then(renderSession);
      if (botAction === "start") {
        const payload = {
          mode: botMode.value,
          durationSeconds: Number(botDuration.value) || 60
        };
        if (botAccount.value.trim() && botPassword.value.trim()) {
          payload.accountUsername = botAccount.value.trim();
          payload.accountPassword = botPassword.value.trim();
          payload.characterName = botCharacter.value.trim();
        }
        post("/api/bot/start", payload).then(renderBot);
      }
      if (botAction === "stop") post("/api/bot/stop").then(renderBot);
    });

    textForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = textInput.value;
      textInput.value = "";
      if (value) post("/api/input", { text: value + "\r" });
    });

    document.addEventListener("keydown", (event) => {
      if (event.target === textInput) return;
      const mapped = keyMap.get(event.key) || (/^[wasdq e]$/.test(event.key) ? event.key : undefined);
      if (mapped) {
        event.preventDefault();
        post("/api/input", { key: mapped === " " ? "space" : mapped });
      }
    });

    const events = new EventSource("/api/events");
    events.addEventListener("screen", (event) => renderScreen(JSON.parse(event.data).data));
    events.addEventListener("status", (event) => renderSession(JSON.parse(event.data).data));
    events.addEventListener("bot_status", (event) => renderBot(JSON.parse(event.data).data));
    events.addEventListener("bot_log", (event) => appendBotLog(JSON.parse(event.data).data));
    events.addEventListener("error", refresh);
    events.addEventListener("close", refresh);

    refresh();
  </script>
</body>
</html>`;
