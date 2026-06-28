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
      durationSeconds: z.number().int().min(5).max(3600).default(600),
      intervalMs: z.number().int().min(100).max(10000).default(1200),
      maxActions: z.number().int().min(1).max(5000).default(2500),
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
          earlyBossAvoidPlayerLevel: z.number().int().min(1).max(100).optional(),
          earlyBossAvoidDistance: z.number().int().min(0).max(100).optional(),
          earlyBossContactDistance: z.number().int().min(0).max(100).optional(),
          maxWeaponUpgrade: z.number().int().min(0).max(20).optional(),
          maxArmorUpgrade: z.number().int().min(0).max(20).optional(),
          upgradeCostBaseGold: z.number().int().min(1).max(10000).optional(),
          attackCooldownMs: z.number().int().min(200).max(10000).optional(),
          spellCooldownMs: z.number().int().min(200).max(10000).optional(),
          mageMeleeFinishHp: z.number().int().min(0).max(10000).optional(),
          mageManaRestMs: z.number().int().min(0).max(120000).optional(),
          maxAdjacentRegularMobs: z.number().int().min(1).max(8).optional(),
          targetHpResetBailCount: z.number().int().min(1).max(10).optional(),
          regularFightTimeoutMs: z.number().int().min(5000).max(300000).optional()
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
    const commandText = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
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
