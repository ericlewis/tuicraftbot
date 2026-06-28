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
type CharacterClass = "warrior" | "rogue" | "mage";

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
  maxReconnects?: number;
  accountUsername?: string;
  accountPassword?: string;
  characterName?: string;
  characterClass?: CharacterClass;
  worldSeed?: string;
  judgeEnabled?: boolean;
  judgeModels?: string;
  judgeMaxCalls?: number;
  judgeCooldownMs?: number;
  chatEnabled?: boolean;
  chatMaxMessages?: number;
  chatCooldownMs?: number;
  tuning?: Partial<BotTuningConfig>;
};

type BotTuningConfig = {
  townHealHpRatio: number;
  questBossPreEngageRetreatHpRatio: number;
  questBossEngagedRetreatHpRatio: number;
  questBossMinFightHpRatio: number;
  safeTargetHealHpRatio: number;
  lowLevelSafeTargetHealHpRatio: number;
  unsafeTargetHealHpRatio: number;
  goDeeperHpRatio: number;
  goDeeperLevelMargin: number;
  judgeBossHpRatio: number;
  judgeMobHpRatio: number;
  judgeRetreatCandidateHpRatio: number;
  eliteQuestMinLevel: number;
  questBossMinLevel: number;
  questBossMinWeaponUpgrade: number;
  questBossMinArmorUpgrade: number;
  earlyBossAvoidPlayerLevel: number;
  earlyBossAvoidDistance: number;
  earlyBossContactDistance: number;
  maxWeaponUpgrade: number;
  maxArmorUpgrade: number;
  upgradeCostBaseGold: number;
  attackCooldownMs: number;
  spellCooldownMs: number;
  mageMeleeFinishHp: number;
  mageManaRestMs: number;
  maxAdjacentRegularMobs: number;
  targetHpResetBailCount: number;
  regularFightTimeoutMs: number;
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
  maxReconnects?: number;
  actionCount: number;
  reconnectCount?: number;
  lastActionAt?: string;
  accountUsername?: string;
  characterName?: string;
  characterClass?: CharacterClass;
  worldSeed?: string;
  accountRegistered?: boolean;
  findings: string[];
  judge?: {
    enabled: boolean;
    models: string[];
    calls: number;
    maxCalls: number;
  };
  chat?: {
    enabled: boolean;
    messages: number;
    maxMessages: number;
  };
  tuning?: BotTuningConfig;
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

const DEFAULT_JUDGE_MODELS = "gpt-5.5:medium,gpt-5.4-mini:low,gpt-5.4-nano:low";
const DEFAULT_JUDGE_MAX_CALLS = 96;
const DEFAULT_BOT_TUNING: BotTuningConfig = {
  townHealHpRatio: 0.95,
  questBossPreEngageRetreatHpRatio: 0.45,
  questBossEngagedRetreatHpRatio: 0.25,
  questBossMinFightHpRatio: 0.3,
  safeTargetHealHpRatio: 0.35,
  lowLevelSafeTargetHealHpRatio: 0.65,
  unsafeTargetHealHpRatio: 0.55,
  goDeeperHpRatio: 0.85,
  goDeeperLevelMargin: 2,
  judgeBossHpRatio: 0.35,
  judgeMobHpRatio: 0.45,
  judgeRetreatCandidateHpRatio: 0.7,
  eliteQuestMinLevel: 4,
  questBossMinLevel: 4,
  questBossMinWeaponUpgrade: 2,
  questBossMinArmorUpgrade: 2,
  earlyBossAvoidPlayerLevel: 3,
  earlyBossAvoidDistance: 3,
  earlyBossContactDistance: 1,
  maxWeaponUpgrade: 4,
  maxArmorUpgrade: 4,
  upgradeCostBaseGold: 100,
  attackCooldownMs: 3_000,
  spellCooldownMs: 1_500,
  mageMeleeFinishHp: 0,
  mageManaRestMs: 15_000,
  maxAdjacentRegularMobs: 1,
  targetHpResetBailCount: 1,
  regularFightTimeoutMs: 45_000
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

  configure(options: BridgeOptions): void {
    const resized = options.cols !== this.options.cols || options.rows !== this.options.rows;
    this.options = options;
    if (resized) {
      this.terminal.resize(options.cols, options.rows);
      this.channel?.setWindow(options.rows, options.cols, options.height, options.width);
      this.emit("screen", this.getScreen());
    }
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
  wait?: boolean;
};

type PathfindOptions = {
  blockedChars?: string[];
  avoidAdjacentKinds?: string[];
  avoidRadius?: number;
};

type JudgeConfig = {
  model: string;
  reasoningEffort?: string;
  weight: number;
};

type JudgeCandidate = {
  id: string;
  action: BotAction;
  note: string;
};

type JudgeVote = {
  model: string;
  reasoningEffort?: string;
  weight: number;
  choiceId: string;
  confidence: number;
  reason?: string;
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
  maxDepth?: number;
  className?: string;
  level: number;
  levelKnown: boolean;
  hp?: { current: number; max: number };
  xp?: { current: number; max: number };
  mana?: { current: number; max: number };
  gold?: number;
  swingReady?: boolean;
  weaponUpgrade?: number;
  armorUpgrade?: number;
  weaponMissing: boolean;
  armorMissing: boolean;
  sellableItemId?: number;
  targetName?: string;
  targetHp?: { current: number; max: number };
  targetLevel?: number;
  targetIsEliteOrBoss: boolean;
  targetIsBoss: boolean;
  targetText?: string;
  adjacentMobCount: number;
  inTown: boolean;
  inDungeon: boolean;
  player?: Point;
  entities: GameEntity[];
  grid: string[][];
  text: string;
  questInProgress: boolean;
  questComplete: boolean;
  noActiveQuest: boolean;
  manaExhausted: boolean;
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
  maxReconnects: number;
  actionCount: number;
  lastActionAt?: string;
  accountUsername: string;
  accountPassword: string;
  characterName: string;
  characterClass: CharacterClass;
  worldSeed: string;
  reuseExistingAccount: boolean;
  accountRegistered: boolean;
  findings: string[];
  findingKeys: Set<string>;
  smokeStep: number;
  stopRequested: boolean;
  reconnectCount: number;
  nextReconnectAt: number;
  nextReconnectLogAt: number;
  blankScreenCount: number;
  nextBlankScreenLogAt: number;
  lastAttackAt: number;
  lastSpellAt: number;
  questAccepted: boolean;
  questComplete: boolean;
  starterWeaponChecked: boolean;
  starterArmorChecked: boolean;
  bossLureMoves: number;
  bossChipMoves: number;
  mageNeedsManaRest: boolean;
  mageManaRestUntil: number;
  lastKnownMana?: { current: number; max: number };
  lastKnownLevel?: number;
  lastKnownClassName?: string;
  lastKnownGold?: number;
  lastKnownWeaponUpgrade?: number;
  lastKnownArmorUpgrade?: number;
  lastMerchantCheckGold?: number;
  nextMerchantCheckAt: number;
  regularTargetKey?: string;
  regularTargetLastHp?: number;
  regularTargetStartedAt: number;
  regularTargetLastProgressAt: number;
  regularTargetHpResets: number;
  lastStateSignature?: string;
  judgeEnabled: boolean;
  judgeConfigs: JudgeConfig[];
  judgeMaxCalls: number;
  judgeCalls: number;
  judgeCooldownMs: number;
  nextJudgeAt: number;
  lastJudgeSignature?: string;
  lastJudgeChoiceId?: string;
  chatEnabled: boolean;
  chatMessages: number;
  chatMaxMessages: number;
  chatCooldownMs: number;
  nextChatAt: number;
  lastChatSignature?: string;
  tuning: BotTuningConfig;
};

class BotRunner {
  private run?: BotRunState;
  private readonly logs = new RingBuffer<BotLog>(1000);

  constructor(private bridge: GameBridge) {}

  retarget(bridge: GameBridge): void {
    this.bridge = bridge;
  }

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
      maxReconnects: this.run.maxReconnects,
      actionCount: this.run.actionCount,
      reconnectCount: this.run.reconnectCount,
      lastActionAt: this.run.lastActionAt,
      accountUsername: this.run.accountUsername,
      characterName: this.run.characterName,
      characterClass: this.run.characterClass,
      worldSeed: this.run.worldSeed,
      accountRegistered: this.run.accountRegistered ?? this.run.reuseExistingAccount,
      findings: [...this.run.findings],
      judge: {
        enabled: Boolean(this.run.judgeEnabled),
        models: (this.run.judgeConfigs ?? []).map(formatJudgeConfig),
        calls: this.run.judgeCalls ?? 0,
        maxCalls: this.run.judgeMaxCalls ?? 0
      },
      chat: {
        enabled: Boolean(this.run.chatEnabled),
        messages: this.run.chatMessages ?? 0,
        maxMessages: this.run.chatMaxMessages ?? 0
      },
      tuning: this.run.tuning ?? DEFAULT_BOT_TUNING
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
    const requestedClass = options.characterClass ?? parseCharacterClass(process.env.BOT_CHARACTER_CLASS) ?? "warrior";
    const requestedWorldSeed = options.worldSeed?.trim() || process.env.BOT_WORLD_SEED?.trim();
    const reuseExistingAccount = Boolean(requestedUsername && requestedPassword);
    const judgeConfigs = parseJudgeConfigs(options.judgeModels ?? process.env.TUICRAFT_JUDGE_MODELS);
    const judgeEnabled =
      options.judgeEnabled ?? readBooleanEnv("TUICRAFT_JUDGE_ENABLED", defaultJudgeEnabled(mode));
    const chatEnabled = options.chatEnabled ?? readBooleanEnv("TUICRAFT_CHAT_ENABLED", true);
    const tuning = buildBotTuning(options.tuning);
    const run: BotRunState = {
      id: `bot-${Date.now().toString(36)}-${suffix}`,
      mode,
      status: "running",
      startedAt: new Date().toISOString(),
      startedMs: Date.now(),
      durationMs: clampInteger(options.durationMs ?? defaults.durationMs, 5_000, 3_600_000),
      intervalMs: clampInteger(options.intervalMs ?? defaults.intervalMs, 100, 10_000),
      maxActions: clampInteger(options.maxActions ?? defaults.maxActions, 1, 5_000),
      maxReconnects: clampInteger(options.maxReconnects ?? defaultReconnectLimit(mode), 0, 100),
      actionCount: 0,
      accountUsername: requestedUsername || `codex${Date.now().toString(36).slice(-7)}${suffix.slice(0, 2)}`,
      accountPassword: requestedPassword || `codex-pass-${suffix}`,
      characterName: requestedCharacter || `Codex${suffix}`,
      characterClass: requestedClass,
      worldSeed: requestedWorldSeed || "1",
      reuseExistingAccount,
      accountRegistered: reuseExistingAccount,
      findings: [],
      findingKeys: new Set(),
      smokeStep: 0,
      stopRequested: false,
      reconnectCount: 0,
      nextReconnectAt: 0,
      nextReconnectLogAt: 0,
      blankScreenCount: 0,
      nextBlankScreenLogAt: 0,
      lastAttackAt: 0,
      lastSpellAt: 0,
      questAccepted: false,
      questComplete: false,
      starterWeaponChecked: false,
      starterArmorChecked: false,
      bossLureMoves: 0,
      bossChipMoves: 0,
      mageNeedsManaRest: false,
      mageManaRestUntil: 0,
      lastKnownMana: undefined,
      lastKnownLevel: undefined,
      lastKnownClassName: undefined,
      lastKnownGold: undefined,
      lastKnownWeaponUpgrade: undefined,
      lastKnownArmorUpgrade: undefined,
      lastMerchantCheckGold: undefined,
      nextMerchantCheckAt: 0,
      regularTargetKey: undefined,
      regularTargetLastHp: undefined,
      regularTargetStartedAt: 0,
      regularTargetLastProgressAt: 0,
      regularTargetHpResets: 0,
      judgeEnabled,
      judgeConfigs,
      judgeMaxCalls: clampInteger(
        options.judgeMaxCalls ?? readIntegerEnv("TUICRAFT_JUDGE_MAX_CALLS", DEFAULT_JUDGE_MAX_CALLS),
        0,
        500
      ),
      judgeCalls: 0,
      judgeCooldownMs: clampInteger(
        options.judgeCooldownMs ?? readIntegerEnv("TUICRAFT_JUDGE_COOLDOWN_MS", 10_000),
        1_000,
        60_000
      ),
      nextJudgeAt: 0,
      chatEnabled,
      chatMessages: 0,
      chatMaxMessages: clampInteger(options.chatMaxMessages ?? readIntegerEnv("TUICRAFT_CHAT_MAX_MESSAGES", 2), 0, 10),
      chatCooldownMs: clampInteger(
        options.chatCooldownMs ?? readIntegerEnv("TUICRAFT_CHAT_COOLDOWN_MS", 240_000),
        30_000,
        900_000
      ),
      nextChatAt: 0,
      lastChatSignature: undefined,
      tuning
    };

    this.run = run;
    this.log("info", "bot started", {
      mode: run.mode,
      durationMs: run.durationMs,
      maxActions: run.maxActions,
      judgeEnabled: run.judgeEnabled,
      judgeModels: run.judgeEnabled ? run.judgeConfigs.map(formatJudgeConfig) : undefined,
      chatEnabled: run.chatEnabled,
      tuning: run.tuning
    });
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

      if (this.run === run && run.status === "running" && run.mode === "win") {
        await this.extractBeforeWinRunStop(run);
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
    if (run.reconnectCount >= run.maxReconnects) {
      this.failRun(run, "remote reconnect limit reached", { status: summary.status, reconnectCount: run.reconnectCount });
      return false;
    }
    if (Date.now() < run.nextReconnectAt) {
      return false;
    }

    try {
      run.reconnectCount += 1;
      this.logReconnect(run, `remote session ${String(summary.status)}, reconnecting`);
      await this.bridge.start();
      const connected = this.bridge.getSummary().status === "connected";
      if (!connected) {
        run.nextReconnectAt = Date.now() + reconnectBackoffMs(run.reconnectCount);
      }
      return connected;
    } catch (error) {
      this.logReconnect(run, `remote reconnect failed: ${error instanceof Error ? error.message : String(error)}`);
      run.nextReconnectAt = Date.now() + reconnectBackoffMs(run.reconnectCount);
      this.publishStatus();
      return false;
    }
  }

  private async extractBeforeWinRunStop(run: BotRunState): Promise<void> {
    const screen = this.bridge.getScreen();
    if (!screen.text.trim() || !this.isInWorld(screen.text)) {
      return;
    }
    const state = this.parseGameState(screen);
    if (!state.dead && !state.inDungeon) {
      return;
    }
    this.log("warn", "extract before bounded win run stop", {
      map: state.mapName,
      dead: state.dead,
      hp: state.hp ? `${state.hp.current}/${state.hp.max}` : undefined
    });
    await this.sendAction(run, { label: "extract before bounded win run stop", command: "/stuck" });
    await sleep(1_000);
  }

  private async tick(run: BotRunState): Promise<void> {
    const screen = this.bridge.getScreen();
    this.detectFindings(run, screen.text);
    const accessBlock = this.detectAccessBlock(screen);
    if (accessBlock) {
      this.failRun(run, accessBlock);
      return;
    }
    if (!screen.text.trim()) {
      this.waitOnBlankScreen(run);
      return;
    }

    const setupAction = this.chooseSetupAction(run, screen.text);
    if (run.status !== "running") {
      return;
    }
    if (setupAction) {
      await this.sendAction(run, setupAction);
      return;
    }

    if (!this.isInWorld(screen.text)) {
      await this.sendAction(run, { label: "nudge unknown screen", key: "enter" });
      return;
    }

    let action =
      run.mode === "smoke"
        ? this.nextSmokeAction(run)
        : run.mode === "win"
          ? this.nextWinAction(run, screen)
          : this.nextExplorationAction(run, run.mode === "stress");
    if (action && run.mode === "win") {
      action = await this.maybeJudgeWinAction(run, screen, action);
    }
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
    if (/Username ['"]?[^'"\n│]+['"]? already taken/i.test(text)) {
      this.markAccountRegistered(run, "server reported generated username already exists");
    }
    if (/Select World Instance|World Instance \(Seed\)|Enter last played world|Last Seed:|Select a character/i.test(text)) {
      this.markAccountRegistered(run, "account setup advanced past registration");
    }
    if (/Press any key to dismiss/i.test(text)) {
      return { label: "dismiss modal", key: "space" };
    }
    if (/--- INVENTORY ---|Manage Inventory|Press ESC to close inventory/i.test(text)) {
      if (/--- ACTION ---/i.test(text) && /Item:\s*Rusty Sword/i.test(text)) {
        if (!/\bWpn:\s*None\b/i.test(text)) {
          run.starterWeaponChecked = true;
          return { label: "close equipped starter weapon action", key: "escape" };
        }
        if (/▶\s*Equip Item/i.test(text)) {
          return { label: "confirm starter weapon equip", key: "enter" };
        }
        run.starterWeaponChecked = true;
        return { label: "close starter weapon action", key: "escape" };
      }
      if (/--- ACTION ---/i.test(text) && /Item:\s*Tattered Cloth Robes/i.test(text)) {
        if (!/\bArm:\s*None\b/i.test(text)) {
          run.starterArmorChecked = true;
          return { label: "close equipped starter armor action", key: "escape" };
        }
        if (/▶\s*Equip Item/i.test(text)) {
          return { label: "confirm starter armor equip", key: "enter" };
        }
        run.starterArmorChecked = true;
        return { label: "close starter armor action", key: "escape" };
      }
      if (/Rusty Sword/i.test(text) && !/Rusty Sword[^\n]*\(Equipped\)/i.test(text)) {
        if (/▶\s*Rusty Sword/i.test(text)) {
          return { label: "equip starter weapon", text: "e" };
        }
        return { label: "select starter weapon", text: "w" };
      }
      if (/Tattered Cloth Robes/i.test(text) && !/Tattered Cloth Robes[^\n]*\(Equipped\)/i.test(text)) {
        if (/▶\s*Tattered Cloth Robes/i.test(text)) {
          return { label: "equip starter armor", text: "e" };
        }
        return { label: "select starter armor", text: "s" };
      }
      run.starterArmorChecked = true;
      return { label: "close inventory", key: "escape" };
    }
    if (/Please log in or register/i.test(text)) {
      if (run.reuseExistingAccount || run.accountRegistered) {
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
      this.markAccountRegistered(run, "generated account password submitted");
      return { label: "enter generated password", text: `${run.accountPassword}\r`, redact: true };
    }
    if (/Select World Instance|World Instance \(Seed\)|Enter last played world seed|Last Seed:/i.test(text)) {
      return { label: "enter world seed", text: `${run.worldSeed}\r` };
    }
    if (/Select a character/i.test(text)) {
      if (run.reuseExistingAccount || run.accountRegistered) {
        const slot = run.characterName
          ? text.match(new RegExp(`Type\\s+(\\d+)\\s+to\\s+load:\\s+${escapeRegExp(run.characterName)}\\b`, "i"))?.[1]
          : text.match(/Type\s+(\d+)\s+to\s+load:/i)?.[1];
        if (slot) {
          return { label: "load existing character", text: `${slot}\r` };
        }
        if (run.characterName) {
          this.failRun(run, "requested character not found", { characterName: run.characterName });
          return undefined;
        }
      }
      return { label: "create new character", text: "new\r" };
    }
    if (/Type 'new' to create a new character/i.test(text)) {
      return { label: "create new character", text: "new\r" };
    }
    if (/Choose Character Class/i.test(text)) {
      return { label: `choose ${run.characterClass}`, text: `${this.classChoice(text, run.characterClass)}\r` };
    }
    if (/Enter a name for your new character/i.test(text)) {
      return { label: "enter generated character", text: `${run.characterName}\r` };
    }
    if (/Invalid choice/i.test(text) && /Account Login|Account Registration/i.test(text)) {
      return { label: "recover registration choice", text: "2\r" };
    }
    return undefined;
  }

  private classChoice(text: string, characterClass: CharacterClass): string {
    const classLabel = characterClass[0].toUpperCase() + characterClass.slice(1);
    const menuChoice = text.match(new RegExp(`(?:^|\\n)[^\\n]*?(\\d+)[^\\n]*\\b${classLabel}\\b`, "i"))?.[1];
    return menuChoice ?? ({ warrior: "1", rogue: "2", mage: "3" } satisfies Record<CharacterClass, string>)[characterClass];
  }

  private markAccountRegistered(run: BotRunState, reason: string): void {
    if (run.accountRegistered) {
      return;
    }
    run.accountRegistered = true;
    this.log("info", "generated account will use login on reconnect", { reason });
    this.publishStatus();
  }

  private detectAccessBlock(screen: ScreenSnapshot): string | undefined {
    if (this.isInWorld(screen.text)) {
      return undefined;
    }
    const normalized = normalizeWhitespace(screen.text);
    if (!normalized) {
      return undefined;
    }
    const patterns: Array<[RegExp, string]> = [
      [/\b(?:kicked|booted)\b/i, "remote says account was kicked"],
      [/\b(?:banned|ban(?:ned)?|blocked)\b/i, "remote says account is banned or blocked"],
      [/\brate\s*limit|too many (?:connections|requests|login attempts)/i, "remote rate limit detected"],
      [/\baccess denied|permission denied|account disabled|account suspended/i, "remote access denied"],
      [/\bsession (?:ended|terminated)|disconnected by (?:server|host|admin)/i, "remote session terminated"]
    ];
    for (const [pattern, message] of patterns) {
      if (pattern.test(normalized)) {
        return message;
      }
    }
    return undefined;
  }

  private waitOnBlankScreen(run: BotRunState): void {
    run.blankScreenCount += 1;
    const now = Date.now();
    if (now >= run.nextBlankScreenLogAt) {
      run.nextBlankScreenLogAt = now + 15_000;
      this.log("warn", "blank screen; waiting without input", { blankScreenCount: run.blankScreenCount });
      this.publishStatus();
    }
  }

  private failRun(run: BotRunState, message: string, data?: unknown): void {
    run.stopRequested = true;
    run.status = "error";
    run.stoppedAt = new Date().toISOString();
    this.addFinding(run, message);
    this.log("error", message, data);
    this.publishStatus();
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
    this.hydrateKnownCharacterState(run, state);
    this.rememberCharacterState(run, state);
    this.logWinState(run, state);
    if (!state.weaponMissing) {
      run.starterWeaponChecked = true;
    }
    if (!state.armorMissing) {
      run.starterArmorChecked = true;
    }
    if (state.winText) {
      run.status = "completed";
      run.stoppedAt = new Date().toISOString();
      this.log("info", "win text detected", { map: state.mapName, actions: run.actionCount });
      this.publishStatus();
      return undefined;
    }

    if (state.dead) {
      this.resetRegularTargetFight(run);
      return { label: "recover from death", command: "/stuck" };
    }

    if (state.questInProgress) {
      run.questAccepted = true;
    }
    if (state.questComplete) {
      run.questComplete = true;
    }

    if (state.inTown) {
      this.resetRegularTargetFight(run);
      run.bossLureMoves = 0;
      run.bossChipMoves = 0;
      const hpRatio = state.hp ? state.hp.current / state.hp.max : 1;
      const readyForEliteQuest = state.level >= run.tuning.eliteQuestMinLevel;
      if (run.characterClass === "mage" && state.mana && state.mana.current >= 10) {
        run.mageNeedsManaRest = false;
        run.mageManaRestUntil = 0;
      }
      if (state.hp && hpRatio < run.tuning.townHealHpRatio) {
        const healStep = this.stepToward(state, ["I"], "onto");
        if (healStep) {
          return { label: "go to inn to heal", key: healStep };
        }
        return { label: "rest in town", key: "space" };
      }
      if (run.characterClass === "mage" && run.mageNeedsManaRest) {
        const now = Date.now();
        if (run.mageManaRestUntil === 0) {
          run.mageManaRestUntil = now + run.tuning.mageManaRestMs;
        }
        if (now < run.mageManaRestUntil) {
          const manaStep = this.stepToward(state, ["I"], "onto");
          if (manaStep) {
            return { label: "go to inn to restore mage mana", key: manaStep };
          }
          return { label: "rest to restore mage mana", key: "space" };
        }
        run.mageNeedsManaRest = false;
        run.mageManaRestUntil = 0;
      }

      if (state.armorMissing && !run.starterArmorChecked) {
        return { label: "open inventory to equip starter armor", command: "/inventory" };
      }
      if (state.weaponMissing && !run.starterWeaponChecked) {
        return { label: "open inventory to equip starter weapon", command: "/inventory" };
      }

      const merchantCommand = this.nextMerchantCommand(state, run.tuning, run);
      const shouldCheckMerchant = !merchantCommand && this.shouldCheckMerchantPrices(run, state);
      if (merchantCommand || shouldCheckMerchant) {
        const merchantStep = this.isMerchantShopOpen(state) ? undefined : this.stepToward(state, ["S"], "adjacent");
        if (merchantStep) {
          if (shouldCheckMerchant) {
            run.lastMerchantCheckGold = state.gold ?? run.lastKnownGold;
            run.nextMerchantCheckAt = Date.now() + 120_000;
          }
          return { label: shouldCheckMerchant ? "check merchant upgrades" : "go to merchant", key: merchantStep };
        }
        if (merchantCommand) {
          return merchantCommand;
        }
      }
      if (this.isMerchantShopOpen(state)) {
        const awayStep = this.stepAwayFrom(state, ["S"]);
        return { label: "leave merchant shop", text: awayStep ?? "d" };
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

      if (!run.questAccepted && !state.questInProgress && readyForEliteQuest) {
        const questStep = this.stepToward(state, ["Q"], "adjacent");
        if (questStep) {
          return { label: "go to quest board", key: questStep };
        }
        run.questAccepted = true;
        return { label: "accept elite quest", command: "/quest accept" };
      }

      const chatAction = this.nextStrategicChatAction(run, state);
      if (chatAction) {
        return chatAction;
      }

      if (/Dungeon Portal|Type\s+\/enter\s+\[1-2\]/i.test(state.text)) {
        return this.savedPortalAction(run, state);
      }

      const doorStep = this.stepToward(state, ["D"], "onto", { avoidAdjacentKinds: ["S"] });
      if (doorStep) {
        return { label: "enter dungeon", key: doorStep };
      }
      const hiddenDoorStep = this.hiddenDoorResetStep(state);
      if (hiddenDoorStep) {
        return { label: "reset hidden dungeon doorway", key: hiddenDoorStep };
      }
      return this.nextWinProbeAction(run);
    }

    if (state.inDungeon) {
      const hpRatio = state.hp ? state.hp.current / state.hp.max : 1;
      const allowedTargetLevel = state.level + 1;
      const nearestBoss = this.nearestDistance(state, ["B"]);
      const canFightQuestBoss = this.canFightQuestBoss(run, state, hpRatio);
      const questBossRun = this.hasAcceptedEliteQuest(run, state) && state.level >= 4;
      const preEliteFarming = state.level < run.tuning.eliteQuestMinLevel && !questBossRun;
      const lowLevelHealFloor = preEliteFarming ? 0.7 : 0;
      const safeTargetHealThreshold = preEliteFarming
        ? Math.max(run.tuning.safeTargetHealHpRatio, run.tuning.lowLevelSafeTargetHealHpRatio)
        : run.tuning.safeTargetHealHpRatio;
      const unsafeHealThreshold = Math.max(run.tuning.unsafeTargetHealHpRatio, lowLevelHealFloor);
      if (!questBossRun && state.mapLevel && state.mapLevel > allowedTargetLevel) {
        return { label: "bail from over-depth dungeon", command: "/stuck" };
      }
      const selectedSafeRegularTarget = Boolean(
        state.targetLevel && state.targetLevel <= allowedTargetLevel && !state.targetIsEliteOrBoss
      );
      const manageableElite = Boolean(
        state.targetIsEliteOrBoss &&
          !state.targetIsBoss &&
          state.targetLevel &&
          state.targetLevel <= allowedTargetLevel
      );
      const regularFightAssessment = this.assessRegularTargetFight(run, state);
      const isMageRun = state.className === "Mage" || run.characterClass === "mage";
      if (isMageRun && state.manaExhausted) {
        run.mageNeedsManaRest = true;
        if (run.lastKnownMana) {
          run.lastKnownMana = { current: 0, max: run.lastKnownMana.max };
        }
      }
      if (!isMageRun && preEliteFarming && selectedSafeRegularTarget && /Orc Grunt/i.test(state.targetText ?? "")) {
        const alternateMobStep = this.stepTowardDistantMob(state, 2, {
          blockedChars: ["D"],
          avoidAdjacentKinds: ["B"],
          avoidRadius: 3
        });
        if (alternateMobStep) {
          return { label: "seek non-orc starter mob", key: alternateMobStep };
        }
        if (this.hasAdjacent(state, ["M"])) {
          const awayStep = this.stepAwayFrom(state, ["M"], { blockedChars: ["D"] });
          if (awayStep) {
            return { label: "disengage orc starter mob", key: awayStep };
          }
        }
      }
      const knownMana = state.mana?.current ?? run.lastKnownMana?.current;
      const hasSpellMana = knownMana === undefined ? !run.mageNeedsManaRest : knownMana >= 10;
      const canCastFireball = Boolean(
        selectedSafeRegularTarget && isMageRun && hasSpellMana
      );
      const spellReady = Date.now() - run.lastSpellAt >= run.tuning.spellCooldownMs;
      const mageCanFinishRegularTarget = Boolean(
        canCastFireball &&
          state.targetHp &&
          state.targetHp.current <= Math.max(16, Math.ceil(state.targetHp.max * 0.45))
      );
      if (preEliteFarming && state.adjacentMobCount > run.tuning.maxAdjacentRegularMobs) {
        if (mageCanFinishRegularTarget && hpRatio > safeTargetHealThreshold) {
          if (!spellReady) {
            return { label: "wait to finish crowded target", wait: true };
          }
          return { label: "finish crowded target", text: "f" };
        }
        const awayStep = this.stepAwayFrom(state, ["M"], { blockedChars: ["D"] });
        if (awayStep) {
          return { label: "isolate pre-elite mob", key: awayStep };
        }
        return { label: "bail from multi-mob pre-elite fight", command: "/stuck" };
      }
      const canGoDeeper =
        !run.questAccepted &&
        state.level >= (state.mapLevel ?? 1) + run.tuning.goDeeperLevelMargin &&
        hpRatio > run.tuning.goDeeperHpRatio;
      if (canGoDeeper && (nearestBoss === undefined || nearestBoss > run.tuning.earlyBossContactDistance)) {
        const deeperStep = this.stepTowardDeeperDungeonDoor(state, {
          avoidAdjacentKinds: ["B"],
          avoidRadius: 3
        });
        if (deeperStep) {
          return { label: "take dungeon door", key: deeperStep };
        }
      }
      const canContinueQuestBoss = this.canContinueQuestBoss(run, state, hpRatio);
      if (canFightQuestBoss || canContinueQuestBoss) {
        const engagedQuestBossNow = Boolean(state.targetIsBoss && state.targetLevel && state.targetLevel <= state.level);
        if (
          hpRatio <
          (engagedQuestBossNow
            ? run.tuning.questBossEngagedRetreatHpRatio
            : run.tuning.questBossPreEngageRetreatHpRatio)
        ) {
          return {
            label: engagedQuestBossNow ? "bail from boss at critical hp" : "bail to top off before boss",
            command: "/stuck"
          };
        }
        if (state.targetIsBoss && isMageRun && hasSpellMana) {
          if (!spellReady) {
            return { label: "wait for boss spell cooldown", wait: true };
          }
          return { label: "cast fireball at boss", text: "f" };
        }
        if (state.targetIsBoss && this.hasAdjacent(state, ["B"])) {
          return { label: "attack selected boss", key: "space" };
        }
        if (this.hasAdjacent(state, ["B"])) {
          return { label: "attack adjacent boss", key: "space" };
        }
        const bossStep = this.stepToward(state, ["B"], "adjacent", { blockedChars: ["D"] });
        if (bossStep) {
          return { label: "hunt elite or boss", key: bossStep };
        }
      }
      if (
        preEliteFarming &&
        canCastFireball &&
        hpRatio > run.tuning.lowLevelSafeTargetHealHpRatio &&
        state.targetHp &&
        nearestBoss !== undefined &&
        nearestBoss <= run.tuning.earlyBossAvoidDistance &&
        (spellReady || state.targetHp.current <= Math.max(16, Math.ceil(state.targetHp.max * 0.45)))
      ) {
        if (!spellReady) {
          const canLowHpMeleeFinish =
            state.targetHp.current <= run.tuning.mageMeleeFinishHp && this.hasAdjacent(state, ["M"]);
          const attackReady = state.swingReady ?? Date.now() - run.lastAttackAt >= run.tuning.attackCooldownMs;
          if (canLowHpMeleeFinish && attackReady) {
            return { label: "finish low-hp target", key: "space" };
          }
          return { label: "wait for spell cooldown", wait: true };
        }
        return { label: "cast fireball", text: "f" };
      }
      if (
        preEliteFarming &&
        !manageableElite &&
        nearestBoss !== undefined &&
        nearestBoss <= run.tuning.earlyBossAvoidDistance
      ) {
        if (nearestBoss <= run.tuning.earlyBossContactDistance) {
          return { label: "bail from nearby boss before farming", command: "/stuck" };
        }
        if (hpRatio > 0.85 && run.bossLureMoves < 1) {
          const awayStep = this.stepAwayFrom(state, ["B"], { blockedChars: ["D"] });
          if (awayStep) {
            run.bossLureMoves += 1;
            return { label: "lure boss away from low-level farm", key: awayStep };
          }
        }
        return { label: "bail from nearby boss before farming", command: "/stuck" };
      }
      if (selectedSafeRegularTarget && regularFightAssessment.shouldBail) {
        return { label: regularFightAssessment.reason ?? "bail from stalled regular fight", command: "/stuck" };
      }
      const canMeleeFinishTarget = Boolean(
        selectedSafeRegularTarget &&
          isMageRun &&
          state.targetHp &&
          state.targetHp.current <= run.tuning.mageMeleeFinishHp &&
          this.hasAdjacent(state, ["M"])
      );
      if (canMeleeFinishTarget && hpRatio > safeTargetHealThreshold) {
        const attackReady = state.swingReady ?? Date.now() - run.lastAttackAt >= run.tuning.attackCooldownMs;
        if (!attackReady) {
          return { label: "wait to finish low-hp target", wait: true };
        }
        return { label: "finish low-hp target", key: "space" };
      }
      if (canCastFireball && hpRatio > safeTargetHealThreshold) {
        if (!spellReady) {
          return { label: "wait for spell cooldown", wait: true };
        }
        return { label: "cast fireball", text: "f" };
      }
      if (isMageRun && run.mageNeedsManaRest && !questBossRun) {
        return { label: "bail to restore mage mana", command: "/stuck" };
      }
      if (selectedSafeRegularTarget && this.hasAdjacent(state, ["M"]) && hpRatio > safeTargetHealThreshold) {
        const attackReady = state.swingReady ?? Date.now() - run.lastAttackAt >= run.tuning.attackCooldownMs;
        if (!attackReady) {
          return { label: "wait for attack cooldown", wait: true };
        }
        return { label: "attack selected regular", key: "space" };
      }
      const bossBlockingEntry = Boolean(
        !canFightQuestBoss &&
          !manageableElite &&
          nearestBoss !== undefined &&
          nearestBoss <= run.tuning.earlyBossAvoidDistance &&
          (state.targetIsBoss || this.hasAdjacent(state, ["B"]))
      );
      const overLevelEliteBossTarget = Boolean(
        !canFightQuestBoss &&
          state.targetIsEliteOrBoss &&
          state.targetLevel &&
          state.targetLevel > allowedTargetLevel
      );
      if ((bossBlockingEntry || overLevelEliteBossTarget) && hpRatio > 0.9 && run.bossChipMoves < 1) {
        run.bossChipMoves += 1;
        return { label: "chip blocking boss", key: "space" };
      }
      const engagedQuestBoss = Boolean(
        questBossRun && state.targetIsEliteOrBoss && state.targetLevel && state.targetLevel <= state.level
      );
      if (
        questBossRun &&
        hpRatio <
          (engagedQuestBoss
            ? run.tuning.questBossEngagedRetreatHpRatio
            : run.tuning.questBossPreEngageRetreatHpRatio)
      ) {
        return {
          label: engagedQuestBoss ? "bail from boss at critical hp" : "bail to top off before boss",
          command: "/stuck"
        };
      }
      if (
        preEliteFarming &&
        !manageableElite &&
        nearestBoss !== undefined &&
        nearestBoss <= run.tuning.earlyBossAvoidDistance
      ) {
        if (hpRatio > 0.85 && run.bossLureMoves < 1) {
          const awayStep = this.stepAwayFrom(state, ["B"], { blockedChars: ["D"] });
          if (awayStep) {
            run.bossLureMoves += 1;
            return { label: "lure boss away from entrance", key: awayStep };
          }
        }
        return { label: "bail from nearby boss", command: "/stuck" };
      }
      if (
        !canFightQuestBoss &&
        !manageableElite &&
        nearestBoss !== undefined &&
        nearestBoss <= run.tuning.earlyBossContactDistance
      ) {
        if (hpRatio > 0.85 && run.bossLureMoves < 1) {
          const awayStep = this.stepAwayFrom(state, ["B"], { blockedChars: ["D"] });
          if (awayStep) {
            run.bossLureMoves += 1;
            return { label: "lure boss away from entrance", key: awayStep };
          }
        }
        return { label: "bail from early boss contact", command: "/stuck" };
      }
      if (this.nextMerchantCommand(state, run.tuning, run) && !canFightQuestBoss) {
        return { label: "bail to buy upgrade", command: "/stuck" };
      }
      if (manageableElite && hpRatio >= unsafeHealThreshold) {
        if (isMageRun && hasSpellMana) {
          if (!spellReady) {
            return { label: "wait for elite spell cooldown", wait: true };
          }
          return { label: "cast fireball at elite", text: "f" };
        }
        return { label: "chip elite target", key: "space" };
      }
      if (manageableElite) {
        return { label: "bail to heal after elite chip", command: "/stuck" };
      }
      const eliteTooStrong = Boolean(state.targetIsEliteOrBoss && !canFightQuestBoss && state.targetLevel);
      if (eliteTooStrong) {
        const awayStep = this.stepAwayFrom(state, ["M", "B"], { blockedChars: ["D"] });
        if (awayStep) {
          return { label: "sidestep elite target", key: awayStep };
        }
        return { label: "bail from elite/boss target", command: "/stuck" };
      }
      const targetOverLevel = Boolean(state.targetLevel && state.targetLevel > allowedTargetLevel);
      const eliteBossContact = Boolean(
        state.targetIsEliteOrBoss &&
          state.targetIsBoss &&
          !canFightQuestBoss &&
          nearestBoss !== undefined &&
          nearestBoss <= run.tuning.earlyBossContactDistance
      );
      const targetIsRisky = targetOverLevel || eliteBossContact;
      if (targetIsRisky) {
        return {
          label: eliteBossContact ? "bail from elite/boss contact" : "bail from over-level target",
          command: "/stuck"
        };
      }
      const hasSafeTarget = selectedSafeRegularTarget;
      const healThreshold = hasSafeTarget
        ? safeTargetHealThreshold
        : Math.max(run.tuning.unsafeTargetHealHpRatio, lowLevelHealFloor);
      if (hpRatio < healThreshold) {
        return { label: "bail to heal", command: "/stuck" };
      }

      const shouldHuntBoss = canFightQuestBoss;
      const bossVisible = shouldHuntBoss && state.entities.some((entity) => entity.kind === "B");
      if (shouldHuntBoss && this.hasAdjacent(state, ["B"])) {
        return { label: "attack adjacent boss", key: "space" };
      }
      if (!bossVisible && this.hasAdjacent(state, ["M"])) {
        const engageStep = this.stepToward(state, ["M"], "onto", {
          blockedChars: ["D"],
          avoidAdjacentKinds: ["B"],
          avoidRadius: 3
        });
        if (engageStep) {
          return { label: "engage adjacent mob", key: engageStep };
        }
      }

      const targetKinds = bossVisible ? ["B"] : ["M"];
      const fightMode = bossVisible ? "adjacent" : "onto";
      const fightStep = this.stepToward(state, targetKinds, fightMode, {
        blockedChars: ["D"],
        avoidAdjacentKinds: bossVisible ? undefined : ["B"],
        avoidRadius: 3
      });
      if (fightStep) {
        return { label: shouldHuntBoss ? "hunt elite or boss" : "hunt mob", key: fightStep };
      }

      const safeProbeStep = this.safeDungeonProbeStep(state);
      if (safeProbeStep) {
        return { label: "probe dungeon safely", key: safeProbeStep };
      }
      if (!canFightQuestBoss && (!nearestBoss || nearestBoss > run.tuning.earlyBossAvoidDistance)) {
        return { label: "wait for safe mob route", key: "space" };
      }
      return { label: "bail from unsafe dungeon route", command: "/stuck" };
    }

    return this.nextWinProbeAction(run);
  }

  private async maybeJudgeWinAction(
    run: BotRunState,
    screen: ScreenSnapshot,
    deterministicAction: BotAction
  ): Promise<BotAction> {
    if (!run.judgeEnabled || run.judgeConfigs.length === 0 || run.judgeMaxCalls <= 0) {
      return deterministicAction;
    }

    const state = this.parseGameState(screen);
    if (!this.shouldJudgeWinAction(state, deterministicAction)) {
      return deterministicAction;
    }

    const candidates = this.buildJudgeCandidates(run, state, deterministicAction);
    if (candidates.length <= 1) {
      return deterministicAction;
    }

    const signature = this.judgeSignature(state, candidates);
    if (signature === run.lastJudgeSignature && run.lastJudgeChoiceId) {
      return candidates.find((candidate) => candidate.id === run.lastJudgeChoiceId)?.action ?? deterministicAction;
    }
    if (Date.now() < run.nextJudgeAt || run.judgeCalls >= run.judgeMaxCalls) {
      return deterministicAction;
    }

    const apiKey = await readSecretEnv("OPENAI_API_KEY");
    if (!apiKey) {
      this.addFinding(run, "judge enabled but OPENAI_API_KEY is unavailable");
      return deterministicAction;
    }

    const callSlots = Math.max(0, run.judgeMaxCalls - run.judgeCalls);
    const configs = run.judgeConfigs.slice(0, callSlots);
    if (configs.length === 0) {
      return deterministicAction;
    }

    run.judgeCalls += configs.length;
    run.nextJudgeAt = Date.now() + run.judgeCooldownMs;
    const votes = await this.askJudgeEnsemble(run, state, deterministicAction, candidates, configs, apiKey);
    const choiceId = chooseJudgeCandidate(votes, candidates);
    run.lastJudgeSignature = signature;
    run.lastJudgeChoiceId = choiceId;

    const chosen = candidates.find((candidate) => candidate.id === choiceId)?.action ?? deterministicAction;
    if (actionFingerprint(chosen) !== actionFingerprint(deterministicAction)) {
      this.log("info", "judge overrode win action", {
        from: deterministicAction.label,
        to: chosen.label,
        votes
      });
    } else if (votes.length > 0) {
      this.log("info", "judge confirmed win action", {
        action: chosen.label,
        votes
      });
    }
    return chosen;
  }

  private shouldJudgeWinAction(state: ParsedGameState, action: BotAction): boolean {
    if (!state.inDungeon) {
      return false;
    }
    if (
      action.wait ||
      action.label === "attack selected regular" ||
      action.label === "cast fireball" ||
      action.label === "finish low-hp target" ||
      action.label === "bail from over-depth dungeon" ||
      action.label === "bail from multi-mob low-level fight" ||
      action.label === "bail from nearby boss before farming" ||
      action.label === "bail from early boss contact" ||
      action.label === "bail to heal" ||
      action.label === "bail to restore mage mana" ||
      action.label === "bail from multi-mob pre-elite fight" ||
      action.label === "lure boss away from low-level farm" ||
      action.label === "target hp reset during regular fight" ||
      action.label === "regular target hp stalled" ||
      action.label === "seek non-orc starter mob" ||
      action.label === "disengage orc starter mob" ||
      action.label === "isolate low-level mob" ||
      action.label === "isolate pre-elite mob" ||
      action.label === "finish crowded target" ||
      action.label === "wait to finish crowded target" ||
      action.label === "cast fireball at elite" ||
      action.label === "wait for elite spell cooldown" ||
      action.label === "cast fireball at boss" ||
      action.label === "wait for boss spell cooldown" ||
      action.label === "kite target during cooldown"
    ) {
      return false;
    }
    const label = action.label.toLowerCase();
    if (
      label.includes("sidestep elite target") ||
      label.includes("chip elite target") ||
      label.includes("chip blocking boss") ||
      label.includes("lure boss")
    ) {
      return false;
    }
    return Boolean(
      state.targetIsEliteOrBoss ||
        this.nearestDistance(state, ["B"]) !== undefined ||
        this.hasAdjacent(state, ["B", "M"]) ||
        /\b(?:attack|boss|hunt|bail|heal|stuck)\b/.test(label)
    );
  }

  private nextStrategicChatAction(run: BotRunState, state: ParsedGameState): BotAction | undefined {
    if (!run.chatEnabled || run.chatMessages >= run.chatMaxMessages || Date.now() < run.nextChatAt) {
      return undefined;
    }
    if (!state.inTown && !state.inDungeon) {
      return undefined;
    }
    const reply = this.nextChatReply(run, state);
    if (!reply) {
      return undefined;
    }
    run.chatMessages += 1;
    run.nextChatAt = Date.now() + run.chatCooldownMs;
    return { label: "reply in chat", text: `${reply}\r` };
  }

  private nextChatReply(run: BotRunState, state: ParsedGameState): string | undefined {
    const chatText = state.text.match(/┌─ Chat Log[\s\S]*?└/)?.[0] ?? "";
    const chatSignature = normalizeWhitespace(chatText);
    if (!chatSignature || run.lastChatSignature === chatSignature) {
      return undefined;
    }
    if (!run.lastChatSignature) {
      run.lastChatSignature = chatSignature;
      return undefined;
    }
    run.lastChatSignature = chatSignature;
    const addressed = new RegExp(`\\b(?:${escapeRegExp(run.characterName)}|codex)\\b`, "i").test(chatText);
    if (!addressed) {
      return undefined;
    }
    if (/shadow|overlord|boss|breath|fire|elite/i.test(chatText)) {
      return "thanks - trying Shadow Overlord now";
    }
    if (/hello|hi|yo|anyone|what up/i.test(chatText)) {
      return "yo - working on Elite Slayer";
    }
    if (state.hp && state.hp.current < state.hp.max * 0.4) {
      return "low hp, falling back to heal";
    }
    return undefined;
  }

  private buildJudgeCandidates(
    run: BotRunState,
    state: ParsedGameState,
    deterministicAction: BotAction
  ): JudgeCandidate[] {
    const candidates: JudgeCandidate[] = [];
    this.addJudgeCandidate(candidates, "deterministic", deterministicAction, "Current deterministic policy choice.");

    const hpRatio = state.hp ? state.hp.current / state.hp.max : 1;
    const bossEligible = this.canFightQuestBoss(run, state, hpRatio);
    if (bossEligible && state.targetIsEliteOrBoss && hpRatio > run.tuning.judgeBossHpRatio) {
      this.addJudgeCandidate(
        candidates,
        "attack_selected_boss",
        { label: "attack selected boss", key: "space" },
        "Target panel is an elite or boss and HP is above the critical retreat threshold."
      );
    }
    if (bossEligible && this.hasAdjacent(state, ["B"]) && hpRatio > run.tuning.judgeBossHpRatio) {
      this.addJudgeCandidate(
        candidates,
        "attack_adjacent_boss",
        { label: "attack adjacent boss", key: "space" },
        "Boss marker is adjacent and HP is above the critical retreat threshold."
      );
    }
    const bossStep =
      bossEligible && hpRatio > run.tuning.judgeBossHpRatio
        ? this.stepToward(state, ["B"], "adjacent", { blockedChars: ["D"] })
        : undefined;
    if (bossStep) {
      this.addJudgeCandidate(
        candidates,
        "hunt_boss",
        { label: "hunt elite or boss", key: bossStep },
        "Move toward the boss for the accepted Elite Slayer quest."
      );
    }
    const mobStep =
      hpRatio > run.tuning.judgeMobHpRatio ? this.stepToward(state, ["M"], "onto", { blockedChars: ["D"] }) : undefined;
    if (mobStep) {
      this.addJudgeCandidate(
        candidates,
        "hunt_mob",
        { label: "hunt mob", key: mobStep },
        "Move toward a regular mob for safe XP/gold if boss route is poor."
      );
    }

    const nearestBoss = this.nearestDistance(state, ["B"]);
    const bossThreatening =
      state.targetIsEliteOrBoss ||
      this.hasAdjacent(state, ["B"]) ||
      Boolean(
        state.level < run.tuning.earlyBossAvoidPlayerLevel &&
          nearestBoss !== undefined &&
          nearestBoss <= run.tuning.earlyBossContactDistance
      );
    if (hpRatio < run.tuning.judgeRetreatCandidateHpRatio || bossThreatening) {
      this.addJudgeCandidate(
        candidates,
        "retreat_stuck",
        {
          label:
            hpRatio < run.tuning.questBossEngagedRetreatHpRatio
              ? "bail from boss at critical hp"
              : "bail to heal",
          command: "/stuck"
        },
        "Return to town to heal or recover if the current fight is too risky."
      );
    }

    return candidates;
  }

  private addJudgeCandidate(
    candidates: JudgeCandidate[],
    id: string,
    action: BotAction,
    note: string
  ): void {
    const fingerprint = actionFingerprint(action);
    if (candidates.some((candidate) => actionFingerprint(candidate.action) === fingerprint)) {
      return;
    }
    candidates.push({ id, action, note });
  }

  private judgeSignature(state: ParsedGameState, candidates: JudgeCandidate[]): string {
    return [
      state.mapName ?? "",
      state.level,
      state.hp ? `${state.hp.current}/${state.hp.max}` : "",
      state.xp ? `${state.xp.current}/${state.xp.max}` : "",
      state.gold ?? "",
      state.questInProgress ? "quest" : "",
      state.targetLevel ?? "",
      state.targetIsEliteOrBoss ? "elite-boss" : "",
      this.nearestDistance(state, ["B"]) ?? "",
      candidates.map((candidate) => `${candidate.id}:${actionFingerprint(candidate.action)}`).join("|")
    ].join("::");
  }

  private async askJudgeEnsemble(
    run: BotRunState,
    state: ParsedGameState,
    deterministicAction: BotAction,
    candidates: JudgeCandidate[],
    configs: JudgeConfig[],
    apiKey: string
  ): Promise<JudgeVote[]> {
    const payload = buildJudgePayload(
      state,
      deterministicAction,
      candidates,
      this.hasAcceptedEliteQuest(run, state),
      run.tuning
    );
    const results = await Promise.allSettled(
      configs.map((config) => callJudgeModel(config, payload, apiKey))
    );
    const votes: JudgeVote[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        votes.push(result.value);
      } else {
        this.log("warn", "judge model failed", {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    }
    if (votes.length === 0) {
      this.addFinding(run, "judge ensemble returned no usable votes");
    }
    return votes;
  }

  private savedPortalAction(run: BotRunState, state: ParsedGameState): BotAction {
    if ((run.questAccepted || state.questInProgress) && state.level >= 4) {
      return { label: "enter quest dungeon portal", command: "/enter 1" };
    }
    if (state.maxDepth && state.maxDepth > 1 && state.level >= 4) {
      return { label: "enter saved dungeon depth", command: "/enter 2" };
    }
    return { label: "enter saved dungeon portal", command: "/enter 1" };
  }

  private canFightQuestBoss(run: BotRunState, state: ParsedGameState, hpRatio: number): boolean {
    const weaponUpgrade = state.weaponUpgrade ?? run.lastKnownWeaponUpgrade;
    const armorUpgrade = state.armorUpgrade ?? run.lastKnownArmorUpgrade;
    const weaponReady =
      !state.weaponMissing &&
      (weaponUpgrade === undefined || weaponUpgrade >= run.tuning.questBossMinWeaponUpgrade);
    const armorReady =
      !state.armorMissing && (armorUpgrade === undefined || armorUpgrade >= run.tuning.questBossMinArmorUpgrade);
    return (
      this.hasAcceptedEliteQuest(run, state) &&
      hpRatio > run.tuning.questBossMinFightHpRatio &&
      state.level >= Math.max(run.tuning.questBossMinLevel, state.mapLevel ?? run.tuning.questBossMinLevel) &&
      weaponReady &&
      armorReady
    );
  }

  private canContinueQuestBoss(run: BotRunState, state: ParsedGameState, hpRatio: number): boolean {
    const weaponUpgrade = state.weaponUpgrade ?? run.lastKnownWeaponUpgrade;
    const armorUpgrade = state.armorUpgrade ?? run.lastKnownArmorUpgrade;
    const weaponReady =
      !state.weaponMissing &&
      (weaponUpgrade === undefined || weaponUpgrade >= run.tuning.questBossMinWeaponUpgrade);
    const armorReady =
      !state.armorMissing && (armorUpgrade === undefined || armorUpgrade >= run.tuning.questBossMinArmorUpgrade);
    return (
      this.hasAcceptedEliteQuest(run, state) &&
      Boolean(state.targetIsBoss && state.targetLevel && state.targetLevel <= state.level) &&
      state.level >= run.tuning.questBossMinLevel &&
      hpRatio > run.tuning.questBossEngagedRetreatHpRatio &&
      weaponReady &&
      armorReady
    );
  }

  private hasAcceptedEliteQuest(run: BotRunState, state: ParsedGameState): boolean {
    return run.questAccepted || state.questInProgress;
  }

  private hiddenDoorResetStep(state: ParsedGameState): string | undefined {
    if (!state.inTown || !state.player || state.entities.some((entity) => entity.kind === "D")) {
      return undefined;
    }
    const row = state.grid[state.player.y] ?? [];
    const rightWallX = row.findIndex((char, index) => index > state.player!.x && char === "█");
    if (rightWallX !== -1 && rightWallX - state.player.x <= 1) {
      return "a";
    }
    return undefined;
  }

  private nextWinProbeAction(run: BotRunState): BotAction {
    const movement = ["w", "d", "s", "a"] as const;
    const key = movement[run.actionCount % movement.length];
    return { label: `probe win path ${key.toUpperCase()}`, key };
  }

  private parseGameState(screen: ScreenSnapshot): ParsedGameState {
    const mapName = screen.text.match(/\[Map: ([^\]]+)\]/)?.[1];
    const mapLevelMatch = mapName?.match(/\(Lvl\s+(\d+)\)/);
    const maxDepthMatch = screen.text.match(/Max Depth:\s*(\d+)/);
    const characterText = screen.lines.slice(0, 12).join("\n");
    const levelMatch =
      characterText.match(/\bLvl\s+(\d+)\s+\((Warrior|Rogue|Mage)\)/) ??
      characterText.match(/\(Lvl\s+(\d+)\)/);
    const className = levelMatch?.[2];
    const level = Number(levelMatch?.[1] ?? 1);
    const hpMatch = screen.text.match(/(?:Your\s+)?HP:\s*(\d+)\/(\d+)/);
    const manaMatch = screen.text.match(/Mana:\s*(\d+)\/(\d+)/);
    const xpMatch = screen.text.match(/XP:\s*(\d+)\/(\d+)/);
    const goldMatch = screen.text.match(/(?:GP|Gold):\s*(\d+)g/);
    const swingMatch = screen.text.match(/Swing:\s*([^\n│]+)/);
    const noManaIndex = screen.text.lastIndexOf("Not enough Mana");
    const manaRestIndex = Math.max(
      screen.text.lastIndexOf("Recovered"),
      screen.text.lastIndexOf("Mana Globe"),
      screen.text.lastIndexOf("Your Fireball hits")
    );
    const weaponUpgradeMatch = screen.text.match(/Wpn:[^\n│]*\+(\d+)/) ?? screen.text.match(/Weapon:\s*\+(\d+)/);
    const armorUpgradeMatch = screen.text.match(/Arm:[^\n│]*\+(\d+)/) ?? screen.text.match(/Armor\s*:\s*\+(\d+)/);
    const weaponMissing = /\bWpn:\s*None\b/i.test(screen.text);
    const armorMissing = /\bArm:\s*None\b/i.test(screen.text);
    const sellableItemMatch = /Sellable Items:/i.test(screen.text) ? screen.text.match(/\[(\d+)\]\s+[^\n│]+?\(\+?\d+g\)/) : undefined;
    const targetPanelText = screen.text.match(/--- Target ---([\s\S]*?)(?:--- Legend ---|Nearby:|┌─ Combat Log|$)/)?.[1] ?? "";
    const targetNameMatch = targetPanelText.match(/([A-Za-z][A-Za-z0-9 ':-]*?)\s+\(Lvl\s+\d+\)/);
    const targetHpMatch =
      targetPanelText.match(/\bHP:\s*(\d+)\/(\d+)/i) ??
      targetPanelText.match(/\b(\d+)\/(\d+)\s*\[[█░#=-]+/);
    const targetLevelMatch = targetPanelText.match(/Level:\s*(\d+)/);
    const inTown = Boolean(mapName && /Town|Abbey/i.test(mapName));
    const inDungeon = Boolean(mapName && !/Town|Abbey/i.test(mapName));
    const deathTextVisible = /You are dead|You have died|YOU ARE DEFEATED|run out of Health|cannot attack while dead/i.test(screen.text);
    const grid: string[][] = [];
    const entities: GameEntity[] = [];
    let player: Point | undefined;

    for (let y = 2; y <= 18; y += 1) {
      const line = screen.lines[y] ?? "";
      if (line.includes("Nearby:")) {
        continue;
      }
      const row = [...(line.slice(1, 84) ?? "")];
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
    const adjacentMobCount = player
      ? entities.filter((entity) => entity.kind === "M" && manhattan(player, entity) === 1).length
      : 0;

    return {
      mapName,
      mapLevel: mapLevelMatch ? Number(mapLevelMatch[1]) : undefined,
      maxDepth: maxDepthMatch ? Number(maxDepthMatch[1]) : undefined,
      className,
      level,
      levelKnown: Boolean(levelMatch),
      hp: hpMatch ? { current: Number(hpMatch[1]), max: Number(hpMatch[2]) } : undefined,
      xp: xpMatch ? { current: Number(xpMatch[1]), max: Number(xpMatch[2]) } : undefined,
      mana: manaMatch ? { current: Number(manaMatch[1]), max: Number(manaMatch[2]) } : undefined,
      gold: goldMatch ? Number(goldMatch[1]) : undefined,
      swingReady: swingMatch ? /\bREADY\b/i.test(swingMatch[1]) : undefined,
      weaponUpgrade: weaponUpgradeMatch ? Number(weaponUpgradeMatch[1]) : undefined,
      armorUpgrade: armorUpgradeMatch ? Number(armorUpgradeMatch[1]) : undefined,
      weaponMissing,
      armorMissing,
      sellableItemId: sellableItemMatch ? Number(sellableItemMatch[1]) : undefined,
      targetName: targetNameMatch?.[1]?.trim(),
      targetHp: targetHpMatch
        ? { current: Number(targetHpMatch[1]), max: Number(targetHpMatch[2]) }
        : undefined,
      targetLevel: targetLevelMatch ? Number(targetLevelMatch[1]) : undefined,
      targetIsEliteOrBoss: /elite|boss|\*/i.test(targetPanelText),
      targetIsBoss: /boss|Shadow Overlord/i.test(targetPanelText),
      targetText: targetPanelText ? normalizeWhitespace(targetPanelText).slice(0, 160) : undefined,
      adjacentMobCount,
      inTown,
      inDungeon,
      player,
      entities,
      grid,
      text: screen.text,
      questInProgress: /Status:\s*In Progress|Quest '.*' accepted|Progress:\s*Kill|Quest:\s*Elite Slayer\s*\(Ready!\)/i.test(screen.text),
      questComplete: /Status:\s*(?:Complete|Ready to Turn In)|Progress:\s*Completed|Quest complete|Reward claimed/i.test(screen.text),
      noActiveQuest: /\bNo active quest\b/i.test(screen.text),
      manaExhausted: noManaIndex >= 0 && noManaIndex > manaRestIndex,
      dead: hpMatch ? Number(hpMatch[1]) <= 0 : deathTextVisible && !inTown,
      winText: this.hasSystemWinText(screen)
    };
  }

  private logWinState(run: BotRunState, state: ParsedGameState): void {
    const hp = state.hp ? `${state.hp.current}/${state.hp.max}` : "";
    const xp = state.xp ? `${state.xp.current}/${state.xp.max}` : "";
    const mana = state.mana ? `${state.mana.current}/${state.mana.max}` : "";
    const targetHp = state.targetHp ? `${state.targetHp.current}/${state.targetHp.max}` : "";
    const signature = [
      state.mapName ?? "",
      state.className ?? "",
      state.level,
      hp,
      mana,
      xp,
      state.gold ?? "",
      state.targetLevel ?? "",
      targetHp,
      state.adjacentMobCount,
      state.targetIsEliteOrBoss ? "elite-boss" : "",
      state.manaExhausted ? "mana-empty" : "",
      state.dead ? "dead" : ""
    ].join("|");
    if (signature === run.lastStateSignature) {
      return;
    }
    run.lastStateSignature = signature;
    this.log("info", "state changed", {
      map: state.mapName,
      className: state.className,
      level: state.level,
      hp,
      mana,
      xp,
      gold: state.gold,
      targetLevel: state.targetLevel,
      targetHp,
      adjacentMobCount: state.adjacentMobCount,
      targetIsEliteOrBoss: state.targetIsEliteOrBoss,
      manaExhausted: state.manaExhausted,
      target: state.targetText
    });
  }

  private rememberCharacterState(run: BotRunState, state: ParsedGameState): void {
    if (state.levelKnown) {
      run.lastKnownLevel = state.level;
    }
    if (state.className !== undefined) {
      run.lastKnownClassName = state.className;
    }
    if (state.mana !== undefined) {
      run.lastKnownMana = state.mana;
    }
    if (state.gold !== undefined) {
      run.lastKnownGold = state.gold;
    }
    if (state.weaponUpgrade !== undefined) {
      run.lastKnownWeaponUpgrade = state.weaponUpgrade;
    }
    if (state.armorUpgrade !== undefined) {
      run.lastKnownArmorUpgrade = state.armorUpgrade;
    }
  }

  private hydrateKnownCharacterState(run: BotRunState, state: ParsedGameState): void {
    if (!state.levelKnown && run.lastKnownLevel !== undefined) {
      state.level = run.lastKnownLevel;
    }
    if (state.className === undefined && run.lastKnownClassName !== undefined) {
      state.className = run.lastKnownClassName;
    }
  }

  private assessRegularTargetFight(run: BotRunState, state: ParsedGameState): { shouldBail: boolean; reason?: string } {
    if (!state.inDungeon || state.targetIsEliteOrBoss || !state.targetLevel || !state.targetHp) {
      this.resetRegularTargetFight(run);
      return { shouldBail: false };
    }

    const now = Date.now();
    const targetKey = [
      state.targetName ?? "regular",
      state.targetLevel,
      state.targetHp.max
    ].join(":");

    if (run.regularTargetKey !== targetKey) {
      run.regularTargetKey = targetKey;
      run.regularTargetLastHp = state.targetHp.current;
      run.regularTargetStartedAt = now;
      run.regularTargetLastProgressAt = now;
      run.regularTargetHpResets = 0;
      return { shouldBail: false };
    }

    const lastHp = run.regularTargetLastHp;
    if (lastHp === undefined) {
      run.regularTargetLastHp = state.targetHp.current;
      run.regularTargetStartedAt = run.regularTargetStartedAt || now;
      run.regularTargetLastProgressAt = run.regularTargetLastProgressAt || now;
      return { shouldBail: false };
    }

    if (state.targetHp.current < lastHp) {
      run.regularTargetLastHp = state.targetHp.current;
      run.regularTargetLastProgressAt = now;
    } else if (state.targetHp.current > lastHp + Math.max(2, Math.ceil(state.targetHp.max * 0.25))) {
      run.regularTargetHpResets += 1;
      run.regularTargetLastHp = state.targetHp.current;
      run.regularTargetStartedAt = now;
      run.regularTargetLastProgressAt = now;
    }

    if (run.regularTargetHpResets >= run.tuning.targetHpResetBailCount) {
      return { shouldBail: true, reason: "target hp reset during regular fight" };
    }
    if (now - (run.regularTargetLastProgressAt || now) > run.tuning.regularFightTimeoutMs) {
      return { shouldBail: true, reason: "regular target hp stalled" };
    }
    return { shouldBail: false };
  }

  private resetRegularTargetFight(run: BotRunState): void {
    run.regularTargetKey = undefined;
    run.regularTargetLastHp = undefined;
    run.regularTargetStartedAt = 0;
    run.regularTargetLastProgressAt = 0;
    run.regularTargetHpResets = 0;
  }

  private nextMerchantCommand(
    state: ParsedGameState,
    tuning: BotTuningConfig,
    run?: BotRunState
  ): BotAction | undefined {
    if (state.sellableItemId) {
      return { label: "sell spare loot", command: `/sell ${state.sellableItemId}` };
    }

    const gold = state.gold ?? run?.lastKnownGold ?? 0;
    const weaponUpgrade = state.weaponUpgrade ?? run?.lastKnownWeaponUpgrade ?? 0;
    const armorUpgrade = state.armorUpgrade ?? run?.lastKnownArmorUpgrade ?? 0;
    const visibleWeaponCost = state.text.match(/Weapon:\s*\+\d+\s+\(Cost:\s*(\d+)g\)/i)?.[1];
    const visibleArmorCost = state.text.match(/Armor\s*:\s*\+\d+\s+\(Cost:\s*(\d+)g\)/i)?.[1];
    const weaponCost = visibleWeaponCost ? Number(visibleWeaponCost) : tuning.upgradeCostBaseGold * (weaponUpgrade + 1);
    const armorCost = visibleArmorCost ? Number(visibleArmorCost) : tuning.upgradeCostBaseGold * (armorUpgrade + 1);

    if (weaponUpgrade < tuning.maxWeaponUpgrade && gold >= weaponCost) {
      return { label: "buy weapon upgrade", command: "/buy 1" };
    }
    if (armorUpgrade < tuning.maxArmorUpgrade && gold >= armorCost) {
      return { label: "buy armor upgrade", command: "/buy 2" };
    }
    return undefined;
  }

  private shouldCheckMerchantPrices(run: BotRunState, state: ParsedGameState): boolean {
    if (this.isMerchantShopOpen(state)) {
      return false;
    }
    const gold = state.gold ?? run.lastKnownGold ?? 0;
    if (gold < run.tuning.upgradeCostBaseGold) {
      return false;
    }
    const weaponUpgrade = state.weaponUpgrade ?? run.lastKnownWeaponUpgrade ?? 0;
    const armorUpgrade = state.armorUpgrade ?? run.lastKnownArmorUpgrade ?? 0;
    if (weaponUpgrade >= run.tuning.maxWeaponUpgrade && armorUpgrade >= run.tuning.maxArmorUpgrade) {
      return false;
    }
    if (run.lastMerchantCheckGold === gold && Date.now() < run.nextMerchantCheckAt) {
      return false;
    }
    return true;
  }

  private isMerchantShopOpen(state: ParsedGameState): boolean {
    return /---\s*Merchant Shop\s*---|Type\s+\/buy\s+\[1-3\]|Sellable Items:/i.test(state.text);
  }

  private hasAdjacent(state: ParsedGameState, kinds: string[]): boolean {
    if (!state.player) {
      return false;
    }
    return state.entities.some((entity) => {
      return kinds.includes(entity.kind) && manhattan(state.player!, entity) === 1;
    });
  }

  private nearestDistance(state: ParsedGameState, kinds: string[]): number | undefined {
    if (!state.player) {
      return undefined;
    }
    const distances = state.entities
      .filter((entity) => kinds.includes(entity.kind))
      .map((entity) => manhattan(state.player!, entity));
    return distances.length > 0 ? Math.min(...distances) : undefined;
  }

  private hasSystemWinText(screen: ScreenSnapshot): boolean {
    const nonChatText = screen.lines
      .map((line) => line.slice(0, 84))
      .join("\n");
    return /(?:\[System\]|\[Combat\]|\[Quest\]|victory|congratulations|world saved|final boss defeated|game cleared).*(you win|victory|congratulations|world saved|final boss defeated|game cleared)/i.test(
      nonChatText
    );
  }

  private stepToward(
    state: ParsedGameState,
    kinds: string[],
    mode: "onto" | "adjacent",
    options: PathfindOptions = {}
  ): string | undefined {
    if (!state.player) {
      return undefined;
    }
    const targets = state.entities.filter((entity) => kinds.includes(entity.kind));
    if (targets.length === 0) {
      return undefined;
    }
    const path = this.pathfind(state, targets, mode, options);
    return path[0];
  }

  private stepTowardDistantMob(
    state: ParsedGameState,
    minDistance: number,
    options: PathfindOptions = {}
  ): string | undefined {
    if (!state.player) {
      return undefined;
    }
    const targets = state.entities.filter((entity) => {
      return entity.kind === "M" && manhattan(state.player!, entity) > minDistance;
    });
    if (targets.length === 0) {
      return undefined;
    }
    return this.pathfind(state, targets, "onto", options)[0];
  }

  private stepTowardDeeperDungeonDoor(state: ParsedGameState, options: PathfindOptions = {}): string | undefined {
    if (!state.player) {
      return undefined;
    }
    const adjacentLevelOneTargets = state.entities.filter((entity) => {
      return entity.kind === "D" && state.mapLevel === 1 && manhattan(state.player!, entity) === 1;
    });
    if (adjacentLevelOneTargets.length > 0) {
      return this.pathfind(state, adjacentLevelOneTargets, "onto", options)[0];
    }
    const targets = state.entities.filter((entity) => {
      return entity.kind === "D" && entity.x > state.player!.x && manhattan(state.player!, entity) > 4;
    });
    if (targets.length === 0) {
      return undefined;
    }
    return this.pathfind(state, targets, "onto", options)[0];
  }

  private pathfind(
    state: ParsedGameState,
    targets: GameEntity[],
    mode: "onto" | "adjacent",
    options: PathfindOptions = {}
  ): string[] {
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
        const char = state.grid[next.y]?.[next.x];
        const isTarget = mode === "onto" && targetKeys.has(nextKey);
        if (!isTarget && char && options.blockedChars?.includes(char)) {
          continue;
        }
        if (!this.isWalkable(char, isTarget)) {
          continue;
        }
        if (!isTarget && this.isAdjacentToAvoidedKind(state, next, options)) {
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

  private stepAwayFrom(state: ParsedGameState, kinds: string[], options: PathfindOptions = {}): string | undefined {
    if (!state.player) {
      return undefined;
    }
    const threats = state.entities.filter((entity) => kinds.includes(entity.kind));
    if (threats.length === 0) {
      return undefined;
    }

    const currentDistance = Math.min(...threats.map((threat) => manhattan(state.player!, threat)));
    const directions: Array<[string, number, number]> = [
      ["w", 0, -1],
      ["s", 0, 1],
      ["a", -1, 0],
      ["d", 1, 0]
    ];
    let best: { key: string; distance: number } | undefined;

    for (const [key, dx, dy] of directions) {
      const next = { x: state.player.x + dx, y: state.player.y + dy };
      const char = state.grid[next.y]?.[next.x];
      if (char && options.blockedChars?.includes(char)) {
        continue;
      }
      if (!this.isWalkable(char, false)) {
        continue;
      }
      const distance = Math.min(...threats.map((threat) => manhattan(next, threat)));
      if (distance <= currentDistance) {
        continue;
      }
      if (!best || distance > best.distance) {
        best = { key, distance };
      }
    }

    return best?.key;
  }

  private safeDungeonProbeStep(state: ParsedGameState): string | undefined {
    const awayFromDoor = this.hasAdjacent(state, ["D"]) ? this.stepAwayFrom(state, ["D"], { blockedChars: ["D"] }) : undefined;
    if (awayFromDoor) {
      return awayFromDoor;
    }
    const visibleEnemyStep = this.greedyStepToward(state, ["M"], {
      blockedChars: ["D"],
      avoidAdjacentKinds: ["B"],
      avoidRadius: 3
    });
    if (visibleEnemyStep) {
      return visibleEnemyStep;
    }
    if (!state.player) {
      return undefined;
    }
    const directions: Array<[string, number, number]> = [
      ["d", 1, 0],
      ["s", 0, 1],
      ["w", 0, -1],
      ["a", -1, 0]
    ];
    for (const [key, dx, dy] of directions) {
      const char = state.grid[state.player.y + dy]?.[state.player.x + dx];
      if (char === "D") {
        continue;
      }
      if (this.isWalkable(char, false)) {
        if (
          this.isAdjacentToAvoidedKind(state, { x: state.player.x + dx, y: state.player.y + dy }, {
            avoidAdjacentKinds: ["B"],
            avoidRadius: 3
          })
        ) {
          continue;
        }
        return key;
      }
    }
    return undefined;
  }

  private greedyStepToward(state: ParsedGameState, kinds: string[], options: PathfindOptions = {}): string | undefined {
    if (!state.player) {
      return undefined;
    }
    const targets = state.entities.filter((entity) => kinds.includes(entity.kind));
    if (targets.length === 0) {
      return undefined;
    }
    const currentDistance = Math.min(...targets.map((target) => manhattan(state.player!, target)));
    const directions: Array<[string, number, number]> = [
      ["d", 1, 0],
      ["s", 0, 1],
      ["w", 0, -1],
      ["a", -1, 0]
    ];
    let best: { key: string; distance: number } | undefined;

    for (const [key, dx, dy] of directions) {
      const next = { x: state.player.x + dx, y: state.player.y + dy };
      const char = state.grid[next.y]?.[next.x];
      if (char && options.blockedChars?.includes(char)) {
        continue;
      }
      if (!this.isWalkable(char, false)) {
        continue;
      }
      if (this.isAdjacentToAvoidedKind(state, next, options)) {
        continue;
      }
      const distance = Math.min(...targets.map((target) => manhattan(next, target)));
      if (distance >= currentDistance) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = { key, distance };
      }
    }

    return best?.key;
  }

  private isAdjacentToAvoidedKind(state: ParsedGameState, point: Point, options: PathfindOptions): boolean {
    const avoidAdjacentKinds = options.avoidAdjacentKinds ?? [];
    if (avoidAdjacentKinds.length === 0) {
      return false;
    }
    const avoidRadius = Math.max(1, Math.trunc(options.avoidRadius ?? 1));
    return state.entities.some((entity) => avoidAdjacentKinds.includes(entity.kind) && manhattan(point, entity) <= avoidRadius);
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
      if (action.wait) {
        // Deliberately spend scheduler time without sending a game input.
      } else if (action.command) {
        await this.sendCommand(run, action.command);
      } else {
        if (action.key && ["w", "a", "s", "d", "enter"].includes(action.key)) {
          this.bridge.sendInput({ key: "escape", source: `bot:${run.mode}` });
          await sleep(60);
        }
        this.bridge.sendInput({
          key: action.key,
          text: action.text,
          source: `bot:${run.mode}`,
          redact: action.redact
        });
        if (action.key === "space") {
          run.lastAttackAt = Date.now();
        }
        if (action.text === "f") {
          run.lastSpellAt = Date.now();
        }
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
      /\[object Object\]/gi,
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

type HttpServer = ReturnType<typeof Bun.serve>;

type AppHotState = {
  bridge?: GameBridge;
  bot?: BotRunner;
  server?: HttpServer;
  port?: number;
};

type AppHotGlobal = typeof globalThis & {
  __worldOfTuicraftInstrumentation?: AppHotState;
};

const appState = getAppHotState();
const bridge = reuseBridge(appState, readBridgeOptions());
const bot = reuseBot(appState, bridge);
const port = readIntegerEnv("PORT", 8787);
const isHotReload = Boolean(appState.server && appState.port === port);
const server = await startHttpServer(appState, port);

console.log(
  `World of TUICraft instrumentation API ${isHotReload ? "hot-reloaded" : "listening"} on http://localhost:${server.port}`
);

if (process.env.WORLD_TUICRAFT_AUTOSTART !== "false") {
  bridge.start().catch((error) => {
    console.error("Failed to start TUICraft session:", error);
  });
}

function getAppHotState(): AppHotState {
  const hotGlobal = globalThis as AppHotGlobal;
  hotGlobal.__worldOfTuicraftInstrumentation ??= {};
  return hotGlobal.__worldOfTuicraftInstrumentation;
}

function readBridgeOptions(): BridgeOptions {
  return {
    host: process.env.WORLD_TUICRAFT_HOST ?? "worldoftuicraft.thoughtlesslabs.com",
    port: readIntegerEnv("WORLD_TUICRAFT_PORT", 22),
    username: process.env.WORLD_TUICRAFT_USER ?? process.env.USER ?? "player",
    cols: readIntegerEnv("WORLD_TUICRAFT_COLS", 120),
    rows: readIntegerEnv("WORLD_TUICRAFT_ROWS", 36),
    width: readIntegerEnv("WORLD_TUICRAFT_WIDTH", 1200),
    height: readIntegerEnv("WORLD_TUICRAFT_HEIGHT", 720),
    expectedFingerprint: process.env.WORLD_TUICRAFT_HOST_FINGERPRINT
  };
}

function reuseBridge(state: AppHotState, options: BridgeOptions): GameBridge {
  if (!state.bridge) {
    state.bridge = new GameBridge(options);
    return state.bridge;
  }
  Object.setPrototypeOf(state.bridge, GameBridge.prototype);
  state.bridge.configure(options);
  return state.bridge;
}

function reuseBot(state: AppHotState, activeBridge: GameBridge): BotRunner {
  if (!state.bot) {
    state.bot = new BotRunner(activeBridge);
    return state.bot;
  }
  Object.setPrototypeOf(state.bot, BotRunner.prototype);
  state.bot.retarget(activeBridge);
  return state.bot;
}

async function startHttpServer(state: AppHotState, requestedPort: number): Promise<HttpServer> {
  const options = createServeOptions(requestedPort);
  if (state.server && state.port === requestedPort) {
    state.server = state.server.reload(options);
    return state.server;
  }
  if (state.server) {
    await state.server.stop(true);
  }
  state.server = Bun.serve(options);
  state.port = requestedPort;
  return state.server;
}

function createServeOptions(requestedPort: number) {
  return {
    port: requestedPort,
    idleTimeout: 255,
    fetch: handleRequest
  };
}

async function handleRequest(request: Request): Promise<Response> {
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

let dotEnvCache: Map<string, string> | undefined;

async function readSecretEnv(name: string): Promise<string | undefined> {
  const direct = process.env[name] ?? Bun.env[name];
  if (direct?.trim()) {
    return direct.trim();
  }
  const env = await readDotEnv();
  return env.get(name)?.trim() || undefined;
}

async function readDotEnv(): Promise<Map<string, string>> {
  if (dotEnvCache) {
    return dotEnvCache;
  }
  const values = new Map<string, string>();
  try {
    const text = await Bun.file(".env").text();
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      if (index <= 0) {
        continue;
      }
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      values.set(key, value);
    }
  } catch {
    // Missing .env is fine; process env remains the primary path.
  }
  dotEnvCache = values;
  return values;
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? Bun.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clampInteger(value, 1, 10_000);
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? Bun.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = (process.env[name] ?? Bun.env[name])?.trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value);
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

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseCharacterClass(value: unknown): CharacterClass | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "warrior" || normalized === "rogue" || normalized === "mage" ? normalized : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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
    maxReconnects: numberValue(body.maxReconnects),
    accountUsername: nonEmptyStringValue(body.accountUsername),
    accountPassword: nonEmptyStringValue(body.accountPassword),
    characterName: nonEmptyStringValue(body.characterName),
    characterClass: parseCharacterClass(body.characterClass),
    worldSeed: nonEmptyStringValue(body.worldSeed),
    judgeEnabled: booleanValue(body.judgeEnabled),
    judgeModels: nonEmptyStringValue(body.judgeModels),
    judgeMaxCalls: numberValue(body.judgeMaxCalls),
    judgeCooldownMs: numberValue(body.judgeCooldownMs),
    chatEnabled: booleanValue(body.chatEnabled),
    chatMaxMessages: numberValue(body.chatMaxMessages),
    chatCooldownMs: numberValue(body.chatCooldownMs),
    tuning: parseBotTuning(body)
  };
}

function parseBotTuning(body: Record<string, unknown>): Partial<BotTuningConfig> | undefined {
  const source = asPlainRecord(body.tuning);
  const tuning: Partial<BotTuningConfig> = {};
  setTuningNumber(tuning, source, "townHealHpRatio");
  setTuningNumber(tuning, source, "questBossPreEngageRetreatHpRatio");
  setTuningNumber(tuning, source, "questBossEngagedRetreatHpRatio");
  setTuningNumber(tuning, source, "questBossMinFightHpRatio");
  setTuningNumber(tuning, source, "safeTargetHealHpRatio");
  setTuningNumber(tuning, source, "lowLevelSafeTargetHealHpRatio");
  setTuningNumber(tuning, source, "unsafeTargetHealHpRatio");
  setTuningNumber(tuning, source, "goDeeperHpRatio");
  setTuningNumber(tuning, source, "goDeeperLevelMargin");
  setTuningNumber(tuning, source, "judgeBossHpRatio");
  setTuningNumber(tuning, source, "judgeMobHpRatio");
  setTuningNumber(tuning, source, "judgeRetreatCandidateHpRatio");
  setTuningNumber(tuning, source, "eliteQuestMinLevel");
  setTuningNumber(tuning, source, "questBossMinLevel");
  setTuningNumber(tuning, source, "questBossMinWeaponUpgrade");
  setTuningNumber(tuning, source, "questBossMinArmorUpgrade");
  setTuningNumber(tuning, source, "earlyBossAvoidPlayerLevel");
  setTuningNumber(tuning, source, "earlyBossAvoidDistance");
  setTuningNumber(tuning, source, "earlyBossContactDistance");
  setTuningNumber(tuning, source, "maxWeaponUpgrade");
  setTuningNumber(tuning, source, "maxArmorUpgrade");
  setTuningNumber(tuning, source, "upgradeCostBaseGold");
  setTuningNumber(tuning, source, "attackCooldownMs");
  setTuningNumber(tuning, source, "spellCooldownMs");
  setTuningNumber(tuning, source, "mageMeleeFinishHp");
  setTuningNumber(tuning, source, "mageManaRestMs");
  setTuningNumber(tuning, source, "maxAdjacentRegularMobs");
  setTuningNumber(tuning, source, "targetHpResetBailCount");
  setTuningNumber(tuning, source, "regularFightTimeoutMs");
  return Object.keys(tuning).length > 0 ? tuning : undefined;
}

function setTuningNumber(
  tuning: Partial<BotTuningConfig>,
  source: Record<string, unknown>,
  key: keyof BotTuningConfig
): void {
  const value = numberValue(source[key]);
  if (value !== undefined) {
    tuning[key] = value;
  }
}

function buildBotTuning(overrides: Partial<BotTuningConfig> = {}): BotTuningConfig {
  return {
    townHealHpRatio: tuneNumber(overrides, "townHealHpRatio", "TUICRAFT_TOWN_HEAL_HP_RATIO", 0, 1),
    questBossPreEngageRetreatHpRatio: tuneNumber(
      overrides,
      "questBossPreEngageRetreatHpRatio",
      "TUICRAFT_BOSS_PRE_HP_RATIO",
      0,
      1
    ),
    questBossEngagedRetreatHpRatio: tuneNumber(
      overrides,
      "questBossEngagedRetreatHpRatio",
      "TUICRAFT_BOSS_ENGAGED_HP_RATIO",
      0,
      1
    ),
    questBossMinFightHpRatio: tuneNumber(
      overrides,
      "questBossMinFightHpRatio",
      "TUICRAFT_BOSS_MIN_FIGHT_HP_RATIO",
      0,
      1
    ),
    safeTargetHealHpRatio: tuneNumber(overrides, "safeTargetHealHpRatio", "TUICRAFT_SAFE_TARGET_HEAL_HP_RATIO", 0, 1),
    lowLevelSafeTargetHealHpRatio: tuneNumber(
      overrides,
      "lowLevelSafeTargetHealHpRatio",
      "TUICRAFT_LOW_LEVEL_SAFE_TARGET_HEAL_HP_RATIO",
      0,
      1
    ),
    unsafeTargetHealHpRatio: tuneNumber(
      overrides,
      "unsafeTargetHealHpRatio",
      "TUICRAFT_UNSAFE_TARGET_HEAL_HP_RATIO",
      0,
      1
    ),
    goDeeperHpRatio: tuneNumber(overrides, "goDeeperHpRatio", "TUICRAFT_GO_DEEPER_HP_RATIO", 0, 1),
    goDeeperLevelMargin: tuneInteger(overrides, "goDeeperLevelMargin", "TUICRAFT_GO_DEEPER_LEVEL_MARGIN", 1, 10),
    judgeBossHpRatio: tuneNumber(overrides, "judgeBossHpRatio", "TUICRAFT_JUDGE_BOSS_HP_RATIO", 0, 1),
    judgeMobHpRatio: tuneNumber(overrides, "judgeMobHpRatio", "TUICRAFT_JUDGE_MOB_HP_RATIO", 0, 1),
    judgeRetreatCandidateHpRatio: tuneNumber(
      overrides,
      "judgeRetreatCandidateHpRatio",
      "TUICRAFT_JUDGE_RETREAT_HP_RATIO",
      0,
      1
    ),
    eliteQuestMinLevel: tuneInteger(overrides, "eliteQuestMinLevel", "TUICRAFT_ELITE_QUEST_MIN_LEVEL", 1, 100),
    questBossMinLevel: tuneInteger(overrides, "questBossMinLevel", "TUICRAFT_QUEST_BOSS_MIN_LEVEL", 1, 100),
    questBossMinWeaponUpgrade: tuneInteger(
      overrides,
      "questBossMinWeaponUpgrade",
      "TUICRAFT_QUEST_BOSS_MIN_WEAPON_UPGRADE",
      0,
      20
    ),
    questBossMinArmorUpgrade: tuneInteger(
      overrides,
      "questBossMinArmorUpgrade",
      "TUICRAFT_QUEST_BOSS_MIN_ARMOR_UPGRADE",
      0,
      20
    ),
    earlyBossAvoidPlayerLevel: tuneInteger(
      overrides,
      "earlyBossAvoidPlayerLevel",
      "TUICRAFT_EARLY_BOSS_AVOID_PLAYER_LEVEL",
      1,
      100
    ),
    earlyBossAvoidDistance: tuneInteger(
      overrides,
      "earlyBossAvoidDistance",
      "TUICRAFT_EARLY_BOSS_AVOID_DISTANCE",
      0,
      100
    ),
    earlyBossContactDistance: tuneInteger(
      overrides,
      "earlyBossContactDistance",
      "TUICRAFT_EARLY_BOSS_CONTACT_DISTANCE",
      0,
      100
    ),
    maxWeaponUpgrade: tuneInteger(overrides, "maxWeaponUpgrade", "TUICRAFT_MAX_WEAPON_UPGRADE", 0, 20),
    maxArmorUpgrade: tuneInteger(overrides, "maxArmorUpgrade", "TUICRAFT_MAX_ARMOR_UPGRADE", 0, 20),
    upgradeCostBaseGold: tuneInteger(overrides, "upgradeCostBaseGold", "TUICRAFT_UPGRADE_COST_BASE_GOLD", 1, 10_000),
    attackCooldownMs: tuneInteger(overrides, "attackCooldownMs", "TUICRAFT_ATTACK_COOLDOWN_MS", 200, 10_000),
    spellCooldownMs: tuneInteger(overrides, "spellCooldownMs", "TUICRAFT_SPELL_COOLDOWN_MS", 200, 10_000),
    mageMeleeFinishHp: tuneInteger(overrides, "mageMeleeFinishHp", "TUICRAFT_MAGE_MELEE_FINISH_HP", 0, 10_000),
    mageManaRestMs: tuneInteger(overrides, "mageManaRestMs", "TUICRAFT_MAGE_MANA_REST_MS", 0, 120_000),
    maxAdjacentRegularMobs: tuneInteger(
      overrides,
      "maxAdjacentRegularMobs",
      "TUICRAFT_MAX_ADJACENT_REGULAR_MOBS",
      1,
      8
    ),
    targetHpResetBailCount: tuneInteger(
      overrides,
      "targetHpResetBailCount",
      "TUICRAFT_TARGET_HP_RESET_BAIL_COUNT",
      1,
      10
    ),
    regularFightTimeoutMs: tuneInteger(
      overrides,
      "regularFightTimeoutMs",
      "TUICRAFT_REGULAR_FIGHT_TIMEOUT_MS",
      5_000,
      300_000
    )
  };
}

function tuneNumber(
  overrides: Partial<BotTuningConfig>,
  key: keyof BotTuningConfig,
  envName: string,
  min: number,
  max: number
): number {
  return clampNumber(overrides[key] ?? readNumberEnv(envName, DEFAULT_BOT_TUNING[key]), min, max);
}

function tuneInteger(
  overrides: Partial<BotTuningConfig>,
  key: keyof BotTuningConfig,
  envName: string,
  min: number,
  max: number
): number {
  return clampInteger(overrides[key] ?? readNumberEnv(envName, DEFAULT_BOT_TUNING[key]), min, max);
}

function parseJudgeConfigs(raw = process.env.TUICRAFT_JUDGE_MODELS ?? Bun.env.TUICRAFT_JUDGE_MODELS ?? DEFAULT_JUDGE_MODELS): JudgeConfig[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [model, reasoningEffort, rawWeight] = part.split(":").map((value) => value.trim());
      const weight = rawWeight ? Number(rawWeight) : 1;
      return {
        model,
        reasoningEffort: reasoningEffort || undefined,
        weight: Number.isFinite(weight) && weight > 0 ? weight : 1
      };
    })
    .filter((config) => Boolean(config.model));
}

function formatJudgeConfig(config: JudgeConfig): string {
  const effort = config.reasoningEffort ? `:${config.reasoningEffort}` : "";
  const weight = config.weight !== 1 ? `:${config.weight}` : "";
  return `${config.model}${effort}${weight}`;
}

function buildJudgePayload(
  state: ParsedGameState,
  deterministicAction: BotAction,
  candidates: JudgeCandidate[],
  acceptedEliteQuest: boolean,
  tuning: BotTuningConfig
): Record<string, unknown> {
  const hpRatio = state.hp ? state.hp.current / state.hp.max : undefined;
  const bossVisible = state.entities.some((entity) => entity.kind === "B");
  const bossDistances = state.player
    ? state.entities
        .filter((entity) => entity.kind === "B")
        .map((entity) => manhattan(state.player!, entity))
    : [];
  const nearestBossDistance = bossDistances.length > 0 ? Math.min(...bossDistances) : undefined;
  const bossThreatening =
    state.targetIsEliteOrBoss ||
    Boolean(nearestBossDistance !== undefined && nearestBossDistance <= tuning.earlyBossContactDistance);
  const weaponReady =
    !state.weaponMissing &&
    (state.weaponUpgrade === undefined || state.weaponUpgrade >= tuning.questBossMinWeaponUpgrade);
  const armorReady =
    !state.armorMissing && (state.armorUpgrade === undefined || state.armorUpgrade >= tuning.questBossMinArmorUpgrade);
  const gearReady = weaponReady && armorReady;
  const lowLevelSafeTargetHealHpRatio =
    state.level < tuning.eliteQuestMinLevel
      ? Math.max(tuning.safeTargetHealHpRatio, tuning.lowLevelSafeTargetHealHpRatio)
      : tuning.safeTargetHealHpRatio;
  const safeMobFarming =
    state.inDungeon &&
    !bossThreatening &&
    state.entities.some((entity) => entity.kind === "M") &&
    state.adjacentMobCount <= tuning.maxAdjacentRegularMobs &&
    (hpRatio ?? 1) > lowLevelSafeTargetHealHpRatio;
  const bossEligible =
    acceptedEliteQuest &&
    !state.questComplete &&
    !state.noActiveQuest &&
    gearReady &&
    state.level >= Math.max(tuning.questBossMinLevel, state.mapLevel ?? tuning.questBossMinLevel) &&
    (hpRatio ?? 1) > tuning.questBossMinFightHpRatio;
  return {
    objective: "Win TUICraft efficiently while avoiding death, kicks, bans, and needless server load.",
    rules: [
      "Choose exactly one candidate id.",
      "The acceptedEliteQuest field is authoritative even if the visible dungeon side panel omits quest text.",
      "If questComplete is true, prefer a claim/turn-in candidate over fighting, farming, shopping, or exploration.",
      "If noActiveQuest is true, do not hunt Shadow Overlord unless a new Elite Slayer quest has been accepted.",
      "Treat weaponMissing or armorMissing as a boss-blocking gear problem; prefer gear repair or town actions when candidates allow it.",
      "Missing armor alone is not a retreat reason for full-health level-appropriate mob farming, especially at level 1.",
      `Before level ${tuning.eliteQuestMinLevel}, treat ${tuning.lowLevelSafeTargetHealHpRatio} as the regular-fight HP floor and avoid more than ${tuning.maxAdjacentRegularMobs} adjacent regular mob.`,
      "If the visible regular target HP resets upward or stalls, prefer a reset/heal path over repeatedly attacking the same situation.",
      `Prefer boss progress only when bossEligible is true: accepted Elite Slayer, level at least ${tuning.questBossMinLevel}, weapon upgrade at least ${tuning.questBossMinWeaponUpgrade}, armor upgrade at least ${tuning.questBossMinArmorUpgrade}, and HP above ${tuning.questBossMinFightHpRatio}.`,
      `Retreat with /stuck only when HP is below ${tuning.questBossEngagedRetreatHpRatio} while engaged, below ${tuning.questBossPreEngageRetreatHpRatio} before boss contact, below the low-level regular-fight floor, the target is over-level, a boss is adjacent/targeted, multiple mobs are adjacent, target HP has reset/stalled, or no safe progress candidate exists.`,
      "A distant visible boss is not a retreat reason when safeMobFarming is true.",
      "Do not choose regular mob farming over a visible boss when bossEligible is true, unless HP is below the configured boss threshold.",
      "Do not invent commands or choose an action outside the candidate list."
    ],
    decisionContext: {
      bossEligible,
      gearReady,
      bossVisible,
      bossThreatening,
      nearestBossDistance,
      safeMobFarming,
      shouldClaimQuest: state.questComplete,
      shouldStopBossHunt: state.noActiveQuest,
      thresholds: {
        townHealHpRatio: tuning.townHealHpRatio,
        questBossPreEngageRetreatHpRatio: tuning.questBossPreEngageRetreatHpRatio,
        questBossEngagedRetreatHpRatio: tuning.questBossEngagedRetreatHpRatio,
        questBossMinFightHpRatio: tuning.questBossMinFightHpRatio,
        questBossMinLevel: tuning.questBossMinLevel,
        questBossMinWeaponUpgrade: tuning.questBossMinWeaponUpgrade,
        questBossMinArmorUpgrade: tuning.questBossMinArmorUpgrade,
        safeTargetHealHpRatio: tuning.safeTargetHealHpRatio,
        lowLevelSafeTargetHealHpRatio: tuning.lowLevelSafeTargetHealHpRatio,
        unsafeTargetHealHpRatio: tuning.unsafeTargetHealHpRatio,
        maxAdjacentRegularMobs: tuning.maxAdjacentRegularMobs,
        targetHpResetBailCount: tuning.targetHpResetBailCount,
        regularFightTimeoutMs: tuning.regularFightTimeoutMs
      }
    },
    state: {
      mapName: state.mapName,
      mapLevel: state.mapLevel,
      level: state.level,
      hp: state.hp,
      hpRatio,
      xp: state.xp,
      gold: state.gold,
      weaponUpgrade: state.weaponUpgrade,
      armorUpgrade: state.armorUpgrade,
      weaponMissing: state.weaponMissing,
      armorMissing: state.armorMissing,
      acceptedEliteQuest,
      questInProgress: state.questInProgress,
      questComplete: state.questComplete,
      noActiveQuest: state.noActiveQuest,
      adjacentMobCount: state.adjacentMobCount,
      targetName: state.targetName,
      targetLevel: state.targetLevel,
      targetHp: state.targetHp,
      targetIsEliteOrBoss: state.targetIsEliteOrBoss,
      targetText: state.targetText,
      entityCounts: {
        mobs: state.entities.filter((entity) => entity.kind === "M").length,
        bosses: state.entities.filter((entity) => entity.kind === "B").length,
        dungeonDoors: state.entities.filter((entity) => entity.kind === "D").length
      }
    },
    deterministicAction: describeAction(deterministicAction),
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      action: describeAction(candidate.action),
      note: candidate.note
    }))
  };
}

function describeAction(action: BotAction): Record<string, unknown> {
  return {
    label: action.label,
    key: action.key,
    text: action.text,
    command: action.command
  };
}

async function callJudgeModel(
  config: JudgeConfig,
  payload: Record<string, unknown>,
  apiKey: string
): Promise<JudgeVote> {
  const body: Record<string, unknown> = {
    model: config.model,
    input: [
      {
        role: "system",
        content:
          "You are a tactical arbiter for a terminal RPG automation. Optimize for the objective and rules in the user JSON, using decisionContext as the canonical summary. Return only compact JSON with keys choiceId, confidence, and reason. The choiceId must be one of the supplied candidate ids. Keep reason under 12 words."
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ],
    max_output_tokens: 360
  };
  if (config.reasoningEffort) {
    body.reasoning = { effort: config.reasoningEffort };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(readIntegerEnv("TUICRAFT_JUDGE_TIMEOUT_MS", 30_000))
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${config.model} judge failed: ${response.status} ${text.slice(0, 400)}`);
  }

  const parsedResponse = JSON.parse(text) as Record<string, unknown>;
  const outputText = extractResponseText(parsedResponse);
  const vote = parseJudgeVoteJson(outputText);
  return {
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    weight: config.weight,
    choiceId: vote.choiceId,
    confidence: Math.max(0.1, Math.min(1, vote.confidence)),
    reason: vote.reason
  };
}

function extractResponseText(value: unknown): string {
  const record = asPlainRecord(value);
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  const output = record.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      const content = asPlainRecord(item).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const block of content) {
        const blockRecord = asPlainRecord(block);
        if (typeof blockRecord.text === "string") {
          parts.push(blockRecord.text);
        }
      }
    }
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  throw new Error("judge response did not include output text");
}

function parseJudgeVoteJson(text: string): { choiceId: string; confidence: number; reason?: string } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  const choiceId = typeof parsed.choiceId === "string" ? parsed.choiceId : "";
  const confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence) ? parsed.confidence : 0.5;
  const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : undefined;
  if (!choiceId) {
    throw new Error("judge response did not include choiceId");
  }
  return { choiceId, confidence, reason };
}

function chooseJudgeCandidate(votes: JudgeVote[], candidates: JudgeCandidate[]): string {
  const validIds = new Set(candidates.map((candidate) => candidate.id));
  const scores = new Map<string, number>();
  for (const vote of votes) {
    if (!validIds.has(vote.choiceId)) {
      continue;
    }
    scores.set(vote.choiceId, (scores.get(vote.choiceId) ?? 0) + vote.weight * vote.confidence);
  }
  let bestId = candidates[0]?.id ?? "";
  let bestScore = -Infinity;
  for (const [id, score] of scores) {
    if (score > bestScore) {
      bestId = id;
      bestScore = score;
    }
  }
  return bestId;
}

function actionFingerprint(action: BotAction): string {
  return JSON.stringify({
    key: action.key,
    text: action.redact ? "[redacted]" : action.text,
    command: action.command
  });
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function defaultBotOptions(mode: BotMode): Required<Pick<BotRunOptions, "durationMs" | "intervalMs" | "maxActions">> {
  if (mode === "win") {
    return { durationMs: 3_600_000, intervalMs: 700, maxActions: 5_000 };
  }
  if (mode === "stress") {
    return { durationMs: 60_000, intervalMs: 125, maxActions: 600 };
  }
  if (mode === "explore") {
    return { durationMs: 180_000, intervalMs: 450, maxActions: 500 };
  }
  return { durationMs: 60_000, intervalMs: 650, maxActions: 60 };
}

function defaultReconnectLimit(mode: BotMode): number {
  if (mode === "win") {
    return 8;
  }
  if (mode === "stress") {
    return 3;
  }
  return 5;
}

function defaultJudgeEnabled(mode: BotMode): boolean {
  return mode === "win";
}

function reconnectBackoffMs(reconnectCount: number): number {
  return Math.min(60_000, 2_000 * 2 ** Math.min(5, reconnectCount));
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
          <input id="bot-duration" aria-label="Bot seconds" type="number" min="5" max="3600" value="600">
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
