import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

const DEFAULT_API_BASE = "http://localhost:8787";

const server = new McpServer({
  name: "tuicraft-control",
  version: "0.1.0"
});

server.registerResource(
  "tuicraft-screen",
  "tuicraft://screen",
  {
    title: "TUICraft Screen",
    description: "Current terminal/TUI screen from the local TUICraft instrumentation API.",
    mimeType: "text/plain"
  },
  async () => textResource("tuicraft://screen", await getScreenText(apiBase()))
);

server.registerResource(
  "tuicraft-bot",
  "tuicraft://bot",
  {
    title: "TUICraft Bot Status",
    description: "Current bot status and recent logs.",
    mimeType: "application/json"
  },
  async () => jsonResource("tuicraft://bot", await getBotSnapshot(apiBase(), 80))
);

server.registerResource(
  "tuicraft-world",
  "tuicraft://world",
  {
    title: "TUICraft World Snapshot",
    description: "Parsed tactical map, character meters, entities, bot status, and recent automation log.",
    mimeType: "application/json"
  },
  async () => jsonResource("tuicraft://world", await apiGet(apiBase(), "/api/world?limit=80"))
);

server.registerResource(
  "tuicraft-progression",
  "tuicraft://progression",
  {
    title: "TUICraft Progression Summary",
    description: "Compact character progression, boss-readiness gates, and recent strategic timeline.",
    mimeType: "application/json"
  },
  async () => jsonResource("tuicraft://progression", await getProgressionSnapshot(apiBase(), 240))
);

server.registerResource(
  "tuicraft-session",
  "tuicraft://session",
  {
    title: "TUICraft Session",
    description: "SSH bridge status and counters.",
    mimeType: "application/json"
  },
  async () => jsonResource("tuicraft://session", await apiGet(apiBase(), "/api/session"))
);

server.registerResource(
  "tuicraft-log",
  "tuicraft://bot/log",
  {
    title: "TUICraft Bot Log",
    description: "Recent bot automation log entries.",
    mimeType: "application/json"
  },
  async () => jsonResource("tuicraft://bot/log", await apiGet(apiBase(), "/api/bot/log?limit=100"))
);

server.registerResource(
  "tuicraft-raw",
  "tuicraft://raw",
  {
    title: "TUICraft Raw Telemetry",
    description: "Recent raw SSH input/output telemetry chunks with redacted secrets.",
    mimeType: "application/json"
  },
  async () => jsonResource("tuicraft://raw", await apiGet(apiBase(), "/api/raw?limit=50"))
);

server.registerTool(
  "tuicraft_get_session",
  {
    title: "Get TUICraft session",
    description: "Read SSH bridge status, counters, and terminal dimensions.",
    inputSchema: {}
  },
  async () => textResult(await apiGet(apiBase(), "/api/session"))
);

server.registerTool(
  "tuicraft_start_session",
  {
    title: "Start TUICraft SSH session",
    description: "Start the local SSH bridge to the game server.",
    inputSchema: {}
  },
  async () => textResult(await apiPost(apiBase(), "/api/session/start", {}))
);

server.registerTool(
  "tuicraft_stop_session",
  {
    title: "Stop TUICraft SSH session",
    description: "Stop the local SSH bridge to the game server.",
    inputSchema: {}
  },
  async () => textResult(await apiPost(apiBase(), "/api/session/stop", {}))
);

server.registerTool(
  "tuicraft_get_screen",
  {
    title: "Get TUICraft screen",
    description: "Read the current terminal screen and parsed state summary.",
    inputSchema: {
      includeText: z.boolean().default(true),
      includeLines: z.boolean().default(false)
    }
  },
  async ({ includeText, includeLines }) => {
    const screen = await apiGet<ScreenSnapshot>(apiBase(), "/api/screen");
    const summary = parseScreenSummary(screen.text ?? screen.lines.join("\n"));
    return textResult({
      summary,
      text: includeText ? screen.text : undefined,
      lines: includeLines ? screen.lines : undefined
    });
  }
);

server.registerTool(
  "tuicraft_get_bot",
  {
    title: "Get TUICraft bot state",
    description: "Read the current bot status and recent bot logs.",
    inputSchema: {
      logLimit: z.number().int().min(1).max(500).default(100)
    }
  },
  async ({ logLimit }) => textResult(await getBotSnapshot(apiBase(), logLimit))
);

server.registerTool(
  "tuicraft_get_world",
  {
    title: "Get TUICraft world snapshot",
    description: "Read parsed map tiles, semantic entities, character meters, bot status, and recent logs.",
    inputSchema: {
      logLimit: z.number().int().min(1).max(500).default(80)
    }
  },
  async ({ logLimit }) => textResult(await apiGet(apiBase(), `/api/world?limit=${logLimit}`))
);

server.registerTool(
  "tuicraft_get_progression",
  {
    title: "Get TUICraft progression summary",
    description: "Read compact character progression, boss-readiness gates, equipment, and recent strategic timeline.",
    inputSchema: {
      logLimit: z.number().int().min(1).max(500).default(240)
    }
  },
  async ({ logLimit }) => textResult(await getProgressionSnapshot(apiBase(), logLimit))
);

server.registerTool(
  "tuicraft_get_raw",
  {
    title: "Get TUICraft raw telemetry",
    description: "Read recent redacted raw SSH input/output chunks.",
    inputSchema: {
      limit: z.number().int().min(1).max(500).default(50)
    }
  },
  async ({ limit }) => textResult(await apiGet(apiBase(), `/api/raw?limit=${limit}`))
);

server.registerTool(
  "tuicraft_start_bot",
  {
    title: "Start TUICraft bot",
    description: "Start a bounded bot run. Uses BOT_ACCOUNT_* environment variables unless explicit credentials are supplied.",
    inputSchema: {
      mode: z.enum(["smoke", "explore", "stress", "win"]).default("win"),
      durationSeconds: z.number().int().min(5).max(21600).default(600),
      intervalMs: z.number().int().min(100).max(10000).default(1200),
      maxActions: z.number().int().min(1).max(50000).default(2500),
      maxReconnects: z.number().int().min(0).max(100).default(4),
      judgeEnabled: z.boolean().optional().describe("Defaults to true for win-mode runs."),
      judgeModels: z.string().optional(),
      judgeMaxCalls: z.number().int().min(0).max(500).optional().describe("Defaults to 96 total model calls, or 32 three-model ensemble decisions."),
      judgeCooldownMs: z.number().int().min(1000).max(60000).optional(),
      chatEnabled: z.boolean().default(true),
      chatMaxMessages: z.number().int().min(0).max(10).optional(),
      chatCooldownMs: z.number().int().min(30000).max(900000).optional(),
      tuning: z
        .object({
          townHealHpRatio: z.number().min(0).max(1).optional(),
          questBossPreEngageRetreatHpRatio: z.number().min(0).max(1).optional(),
          questBossEngagedRetreatHpRatio: z.number().min(0).max(1).optional(),
          questBossFinishHpRatio: z.number().min(0).max(1).optional(),
          questBossMinFightHpRatio: z.number().min(0).max(1).optional(),
          safeTargetHealHpRatio: z.number().min(0).max(1).optional(),
          lowLevelSafeTargetHealHpRatio: z.number().min(0).max(1).optional(),
          unsafeTargetHealHpRatio: z.number().min(0).max(1).optional(),
          goDeeperHpRatio: z.number().min(0).max(1).optional(),
          goDeeperLevelMargin: z.number().int().min(1).max(10).optional(),
          judgeBossHpRatio: z.number().min(0).max(1).optional(),
          judgeMobHpRatio: z.number().min(0).max(1).optional(),
          judgeRetreatCandidateHpRatio: z.number().min(0).max(1).optional(),
          eliteQuestMinLevel: z.number().int().min(1).max(100).optional(),
          questBossMinLevel: z.number().int().min(1).max(100).optional(),
          questBossMinWeaponUpgrade: z.number().int().min(0).max(20).optional(),
          questBossMinArmorUpgrade: z.number().int().min(0).max(20).optional(),
          questBossMinHasteLevel: z.number().int().min(0).max(20).optional(),
          earlyBossAvoidPlayerLevel: z.number().int().min(1).max(100).optional(),
          earlyBossAvoidDistance: z.number().int().min(0).max(100).optional(),
          earlyBossContactDistance: z.number().int().min(0).max(100).optional(),
          maxWeaponUpgrade: z.number().int().min(0).max(20).optional(),
          maxArmorUpgrade: z.number().int().min(0).max(20).optional(),
          maxHasteLevel: z.number().int().min(0).max(20).optional(),
          upgradeCostBaseGold: z.number().int().min(1).max(10000).optional(),
          attackCooldownMs: z.number().int().min(200).max(10000).optional(),
          spellCooldownMs: z.number().int().min(200).max(10000).optional(),
          mageMeleeFinishHp: z.number().int().min(0).max(10000).optional(),
          lowHpFinishHpRatio: z.number().min(0).max(1).optional(),
          mageManaRestMs: z.number().int().min(0).max(120000).optional(),
          maxAdjacentRegularMobs: z.number().int().min(1).max(8).optional(),
          nearLevelFallbackXpRemaining: z.number().int().min(0).max(10000).optional(),
          targetHpResetBailCount: z.number().int().min(1).max(10).optional(),
          regularFightTimeoutMs: z.number().int().min(5000).max(300000).optional(),
          dungeonProgressStallMs: z.number().int().min(5000).max(300000).optional()
        })
        .optional(),
      accountUsername: z.string().min(1).optional(),
      accountPassword: z.string().min(1).optional(),
      characterName: z.string().min(1).optional(),
      characterClass: z.enum(["warrior", "rogue", "mage"]).optional(),
      worldSeed: z.string().min(1).optional()
    }
  },
  async (params) => {
    const body = withEnvBotAccount(params);
    return textResult(await apiPost(apiBase(), "/api/bot/start", body));
  }
);

server.registerTool(
  "tuicraft_stop_bot",
  {
    title: "Stop TUICraft bot",
    description: "Stop the current bot run.",
    inputSchema: {}
  },
  async () => textResult(await apiPost(apiBase(), "/api/bot/stop", {}))
);

server.registerTool(
  "tuicraft_send_input",
  {
    title: "Send TUICraft input",
    description: "Send a key or text input to the game through the local instrumentation API.",
    inputSchema: {
      key: z.string().optional(),
      text: z.string().optional(),
      repeat: z.number().int().min(1).max(20).optional()
    }
  },
  async ({ key, text, repeat }) => {
    if (!key && !text) {
      throw new Error("Provide key or text");
    }
    return textResult(await apiPost(apiBase(), "/api/input", { key, text, repeat }));
  }
);

server.registerTool(
  "tuicraft_enter_command",
  {
    title: "Enter TUICraft command",
    description: "Submit a slash command or chat command line to the game.",
    inputSchema: {
      command: z.string().min(1)
    }
  },
  async ({ command }) => {
    const trimmed = command.trim();
    const commandText = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const base = apiBase();
    await apiPost(base, "/api/input", { key: "escape" });
    await sleep(40);
    await apiPost(base, "/api/input", { text: "/" });
    await sleep(80);
    await apiPost(base, "/api/input", { text: commandText });
    await sleep(40);
    return textResult(await apiPost(base, "/api/input", { key: "enter" }));
  }
);

server.registerTool(
  "tuicraft_resize_terminal",
  {
    title: "Resize TUICraft terminal",
    description: "Resize the local terminal/PTY and browser terminal dimensions.",
    inputSchema: {
      cols: z.number().int().min(40).max(240).optional(),
      rows: z.number().int().min(12).max(80).optional(),
      width: z.number().int().min(320).max(3840).optional(),
      height: z.number().int().min(240).max(2160).optional()
    }
  },
  async (params) => textResult(await apiPost(apiBase(), "/api/resize", params))
);

server.registerTool(
  "tuicraft_restart_session",
  {
    title: "Restart TUICraft SSH session",
    description: "Reconnect the local SSH bridge to the game server.",
    inputSchema: {}
  },
  async () => textResult(await apiPost(apiBase(), "/api/session/restart", {}))
);

server.registerTool(
  "tuicraft_state_art",
  {
    title: "Generate TUICraft state art prompt",
    description: "Generate a consistent TUICraft tactical concept prompt, and optionally call the image API if OPENAI_API_KEY is set.",
    inputSchema: {
      promptOnly: z.boolean().default(true),
      template: z.boolean().default(false),
      referencePath: z.string().optional(),
      outPath: z.string().optional(),
      model: z.string().default("gpt-image-2"),
      size: z.string().default("2048x1152"),
      quality: z.string().default("medium")
    }
  },
  async (params) => textResult(await runArtGenerator(params))
);

server.registerTool(
  "tuicraft_snapshot",
  {
    title: "Capture TUICraft operational snapshot",
    description:
      "Capture session, screen summary, bot state, recent logs, optional raw telemetry, and optional state-art output.",
    inputSchema: {
      includeText: z.boolean().default(false),
      includeLines: z.boolean().default(false),
      includeRaw: z.boolean().default(false),
      logLimit: z.number().int().min(1).max(500).default(80),
      rawLimit: z.number().int().min(1).max(500).default(50),
      generateArt: z.boolean().default(false),
      promptOnly: z.boolean().default(true),
      referencePath: z.string().optional(),
      outDir: z.string().default("output"),
      label: z.string().optional(),
      model: z.string().default("gpt-image-2"),
      size: z.string().default("2048x1152"),
      quality: z.string().default("medium")
    }
  },
  async (params) => textResult(await captureSnapshot(params))
);

await server.connect(new StdioServerTransport());
console.error("TUICraft MCP server connected over stdio");

function apiBase(): string {
  return (Bun.env.TUICRAFT_API ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

async function apiGet<T = unknown>(base: string, path: string): Promise<T> {
  const response = await fetch(`${base}${path}`);
  return parseApiResponse<T>(response);
}

async function apiPost<T = unknown>(base: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseApiResponse<T>(response);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function getScreenText(base: string): Promise<string> {
  const screen = await apiGet<ScreenSnapshot>(base, "/api/screen");
  return screen.text ?? screen.lines.join("\n");
}

async function getBotSnapshot(base: string, logLimit: number): Promise<unknown> {
  const [bot, log] = await Promise.all([
    apiGet(base, "/api/bot"),
    apiGet(base, `/api/bot/log?limit=${logLimit}`)
  ]);
  return { bot, log };
}

async function getProgressionSnapshot(base: string, logLimit: number): Promise<unknown> {
  const world = asRecord(await apiGet(base, `/api/world?limit=${logLimit}`));
  const stats = asRecord(world.stats);
  const bot = asRecord(world.bot);
  const knownState = asRecord(bot.knownState);
  const tuning = asRecord(bot.tuning);
  const logs = Array.isArray(world.logs) ? world.logs.map(asRecord) : [];
  const level = numeric(stats.level) ?? numeric(knownState.level);
  const hp = asRecord(stats.hp);
  const mana = asRecord(stats.mana);
  const xp = asRecord(stats.xp);
  const visibleWeapon = text(stats.weapon);
  const visibleArmor = text(stats.armor);
  const weaponMissing = /^None\b/i.test(visibleWeapon ?? "");
  const armorMissing = /^None\b/i.test(visibleArmor ?? "");
  const weaponUpgrade = parseUpgrade(visibleWeapon) ?? (weaponMissing ? undefined : numeric(knownState.weaponUpgrade));
  const armorUpgrade = parseUpgrade(visibleArmor) ?? (armorMissing ? undefined : numeric(knownState.armorUpgrade));
  const weaponPower = parseItemRating(visibleWeapon) ?? (weaponMissing ? undefined : numeric(knownState.weaponPower));
  const armorValue = parseItemRating(visibleArmor) ?? (armorMissing ? undefined : numeric(knownState.armorValue));
  const weapon = visibleWeapon ?? itemLabel("Weapon", weaponUpgrade, weaponPower) ?? upgradeLabel("Rusty Sword", weaponUpgrade);
  const armor = visibleArmor ?? itemLabel("Armor", armorUpgrade, armorValue) ?? upgradeLabel("Armor", armorUpgrade);
  const levelGate = numeric(tuning.questBossMinLevel) ?? 4;
  const weaponGate = numeric(tuning.questBossMinWeaponUpgrade) ?? 0;
  const armorGate = numeric(tuning.questBossMinArmorUpgrade) ?? 0;
  const hpGate = numeric(tuning.questBossMinFightHpRatio) ?? 0.3;
  const hpRatio = numeric(hp.ratio) ?? ratio(hp);
  const questAccepted = questLooksAccepted(stats, logs);
  const target = text(stats.target);

  return {
    timestamp: new Date().toISOString(),
    state: {
      mapName: text(world.mapName),
      objective: text(world.objective),
      name: text(stats.name) ?? text(bot.characterName),
      className: text(stats.className) ?? text(knownState.className) ?? text(bot.characterClass),
      level,
      hp: meterSummary(hp),
      mana: meterSummary(mana),
      xp: meterSummary(xp),
      gold: numeric(stats.gold) ?? numeric(knownState.gold),
      weapon,
      armor,
      quest: text(stats.quest) ?? (questAccepted ? "Elite Slayer" : undefined),
      target,
      targetHp: meterSummary(asRecord(stats.targetHp)),
      botStatus: text(bot.status),
      actionCount: numeric(bot.actionCount),
      judge: bot.judge,
      chat: bot.chat
    },
    bossReadiness: [
      gate("level", level, levelGate, level !== undefined && level >= levelGate),
      gate("weapon", weapon, `+${weaponGate} or power ${5 + weaponGate}`, !weaponMissing && isWeaponValueReady(weaponUpgrade, weaponPower, weaponGate)),
      gate("armor", armor, `+${armorGate} or armor ${3 + armorGate}`, !armorMissing && isArmorValueReady(armorUpgrade, armorValue, armorGate)),
      gate("quest", questAccepted ? "Elite Slayer" : undefined, "Elite Slayer accepted", questAccepted),
      gate("fightHpRatio", hpRatio, hpGate, hpRatio !== undefined && hpRatio > hpGate),
      gate("bossTarget", target, "not currently engaged", !target || !/Boss|Shadow Overlord/i.test(target))
    ],
    timeline: logs
      .map((entry, index) => progressionTimelineEntry(entry, index))
      .filter(Boolean)
      .slice(-40)
  };
}

async function captureSnapshot(params: {
  includeText: boolean;
  includeLines: boolean;
  includeRaw: boolean;
  logLimit: number;
  rawLimit: number;
  generateArt: boolean;
  promptOnly: boolean;
  referencePath?: string;
  outDir: string;
  label?: string;
  model: string;
  size: string;
  quality: string;
}): Promise<unknown> {
  const base = apiBase();
  const [session, screen, botSnapshot, raw] = await Promise.all([
    apiGet(base, "/api/session"),
    apiGet<ScreenSnapshot>(base, "/api/screen"),
    getBotSnapshot(base, params.logLimit),
    params.includeRaw ? apiGet(base, `/api/raw?limit=${params.rawLimit}`) : Promise.resolve(undefined)
  ]);
  const text = screen.text ?? screen.lines.join("\n");
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    session,
    screen: {
      summary: parseScreenSummary(text),
      text: params.includeText ? text : undefined,
      lines: params.includeLines ? screen.lines : undefined
    },
    ...asRecord(botSnapshot),
    raw
  };

  if (params.generateArt) {
    result.stateArt = await runArtGenerator({
      promptOnly: params.promptOnly,
      template: false,
      referencePath: params.referencePath,
      outPath: buildStateArtPath(params.outDir, params.label),
      model: params.model,
      size: params.size,
      quality: params.quality
    });
  }

  return result;
}

function withEnvBotAccount<T extends Record<string, unknown>>(params: T): T {
  const body: Record<string, unknown> = { ...params };
  body.accountUsername ??= Bun.env.BOT_ACCOUNT_USERNAME;
  body.accountPassword ??= Bun.env.BOT_ACCOUNT_PASSWORD;
  body.characterName ??= Bun.env.BOT_CHARACTER_NAME;
  body.worldSeed ??= Bun.env.BOT_WORLD_SEED;
  return body as T;
}

async function runArtGenerator(params: {
  promptOnly: boolean;
  template: boolean;
  referencePath?: string;
  outPath?: string;
  model: string;
  size: string;
  quality: string;
}): Promise<unknown> {
  const args = ["scripts/generate-state-art.ts"];
  if (params.promptOnly) args.push("--prompt-only");
  if (params.template) args.push("--template");
  if (params.referencePath) args.push("--reference", params.referencePath);
  if (params.outPath) args.push("--out", params.outPath);
  args.push("--model", params.model, "--size", params.size, "--quality", params.quality);

  const process = Bun.spawn(["bun", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...Bun.env, TUICRAFT_API: apiBase() }
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `art generator exited ${exitCode}`);
  }
  return {
    stdout: parseMaybeJson(stdout),
    stderr: stderr.trim() || undefined
  };
}

function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function buildStateArtPath(outDir: string, label: string | undefined): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = label ? `-${label.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "")}` : "";
  return `${outDir.replace(/\/$/, "")}/tuicraft-state-${timestamp}${suffix}.png`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numeric(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function ratio(record: Record<string, unknown>): number | undefined {
  const current = numeric(record.current);
  const max = numeric(record.max);
  if (current === undefined || max === undefined || max <= 0) {
    return undefined;
  }
  return current / max;
}

function meterSummary(record: Record<string, unknown>): { current: number; max: number; ratio: number } | undefined {
  const current = numeric(record.current);
  const max = numeric(record.max);
  const meterRatio = numeric(record.ratio) ?? ratio(record);
  if (current === undefined || max === undefined || meterRatio === undefined) {
    return undefined;
  }
  return { current, max, ratio: meterRatio };
}

function upgradeLabel(label: string, upgrade: number | undefined): string | undefined {
  return upgrade === undefined ? undefined : `${label} +${upgrade}`;
}

function itemLabel(label: string, upgrade: number | undefined, rating: number | undefined): string | undefined {
  if (rating === undefined) {
    return upgradeLabel(label, upgrade);
  }
  return upgrade === undefined ? `${label} (${rating})` : `${label} +${upgrade} (${rating})`;
}

function parseUpgrade(value: string | undefined): number | undefined {
  const match = value?.match(/\+(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function parseItemRating(value: string | undefined): number | undefined {
  const match = value?.match(/\((\d+)\)/);
  return match ? Number(match[1]) : undefined;
}

function isWeaponValueReady(upgrade: number | undefined, power: number | undefined, requiredUpgrade: number): boolean {
  return (
    (upgrade !== undefined && upgrade >= requiredUpgrade) ||
    (power !== undefined && power >= 5 + requiredUpgrade) ||
    (upgrade === undefined && power === undefined)
  );
}

function isArmorValueReady(upgrade: number | undefined, armor: number | undefined, requiredUpgrade: number): boolean {
  return (
    (upgrade !== undefined && upgrade >= requiredUpgrade) ||
    (armor !== undefined && armor >= 3 + requiredUpgrade) ||
    (upgrade === undefined && armor === undefined)
  );
}

function questLooksAccepted(stats: Record<string, unknown>, logs: Record<string, unknown>[]): boolean {
  if (/Elite Slayer|Active|Ready|In Progress/i.test(text(stats.quest) ?? "")) {
    return true;
  }
  return logs.some((entry) => {
    const line = `${text(entry.message) ?? ""} ${JSON.stringify(entry.data ?? {})}`;
    return /accept elite quest|Quest '.*' accepted|Quest:\s*Elite Slayer|Elite Slayer/i.test(line);
  });
}

function gate(id: string, value: unknown, required: unknown, ready: boolean): Record<string, unknown> {
  return {
    id,
    value,
    required,
    status: ready ? "ready" : "blocked"
  };
}

function progressionTimelineEntry(entry: Record<string, unknown>, index: number): Record<string, unknown> | undefined {
  const message = text(entry.message) ?? "";
  const data = asRecord(entry.data);
  const line = `${message} ${JSON.stringify(data)}`;
  if (!/bot started|bot completed|stopped|state changed|buy|sell|quest|boss|elite|judge|death|dead|recover|level|heal|stuck|bail|fireball|win/i.test(line)) {
    return undefined;
  }
  const title =
    message === "state changed"
      ? `${text(data.map) ?? "state"} · L${numeric(data.level) ?? "?"}`
      : message;
  return {
    id: `log-${index}`,
    ts: text(entry.ts),
    level: text(entry.level),
    title,
    hp: text(data.hp),
    mana: text(data.mana),
    xp: text(data.xp),
    gold: numeric(data.gold),
    target: text(data.target),
    targetHp: text(data.targetHp),
    actionFrom: text(data.from),
    actionTo: text(data.to),
    data
  };
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
      }
    ]
  };
}

function textResource(uri: string, text: string) {
  return {
    contents: [{ uri, mimeType: "text/plain", text }]
  };
}

function jsonResource(uri: string, value: unknown) {
  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) }]
  };
}

type ScreenSnapshot = {
  lines: string[];
  text: string;
};

function parseScreenSummary(text: string): Record<string, unknown> {
  const targetPanel = text.match(/--- Target ---([\s\S]*?)(?:--- Legend ---|Nearby:|┌─ Combat Log|$)/)?.[1] ?? "";
  return {
    map: text.match(/\[Map:\s*([^\]]+)\]/)?.[1],
    character: text.match(/([A-Za-z][A-Za-z0-9_-]+)\s+Lvl\s+(\d+)\s+\(([^)]+)\)/)?.slice(1, 4),
    hp: text.match(/(?:Your\s+)?HP:\s*([0-9]+\/[0-9]+)/)?.[1],
    mana: text.match(/\bMana:\s*([0-9]+\/[0-9]+)/)?.[1],
    xp: text.match(/\bXP:\s*([0-9]+\/[0-9]+)/)?.[1],
    gold: text.match(/\b(?:GP|Gold):\s*([0-9]+g?)/)?.[1],
    swing: text.match(/\bSwing:\s*([^\n│]+)/)?.[1]?.trim(),
    weapon: text.match(/\bWpn:\s*([^\n│]+)/)?.[1]?.trim(),
    armor: text.match(/\bArm:\s*([^\n│]+)/)?.[1]?.trim(),
    quest: text.match(/\bQuest:\s*([^\n│]+)/)?.[1]?.trim(),
    target: targetPanel.match(/([A-Za-z][A-Za-z0-9 ':-]*?\s+\(Lvl\s+\d+\)[^\n│]*)/)?.[1]?.trim(),
    targetHp:
      targetPanel.match(/\bHP:\s*([0-9]+\/[0-9]+)/i)?.[1] ??
      targetPanel.match(/\b([0-9]+\/[0-9]+)\s*\[[█░#=-]+/)?.[1],
    bossHp: text.match(/Shadow Overlord\s+\(BOSS Lvl 4\)\s+\((\d+)hp\)/)?.[1],
    findings: [...new Set(text.match(/\[object Object\]|\bundefined\b|\bNaN\b/g) ?? [])]
  };
}
