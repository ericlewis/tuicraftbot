import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Options = {
  apiBase: string;
  intervalSeconds: number;
  durationSeconds: number;
  maxCaptures: number;
  promptOnly: boolean;
  includeRaw: boolean;
  referencePath?: string;
  outDir: string;
  label: string;
  model: string;
  size: string;
  quality: string;
  requestTimeoutMs: number;
};

const options = parseArgs(Bun.argv.slice(2));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = new Client({ name: "tuicraft-state-art-loop", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "bun",
  args: ["src/mcp-server.ts"],
  cwd: repoRoot,
  stderr: "pipe",
  env: envRecord({ ...Bun.env, TUICRAFT_API: options.apiBase })
});

transport.stderr?.on("data", (chunk) => {
  const message = chunk.toString().trim();
  if (message) {
    console.error(message);
  }
});

try {
  await client.connect(transport);
  await runLoop(client, options);
} finally {
  await client.close().catch(() => undefined);
}

async function runLoop(client: Client, options: Options): Promise<void> {
  const stopAt = Date.now() + options.durationSeconds * 1000;
  let capture = 0;
  while (Date.now() <= stopAt && capture < options.maxCaptures) {
    capture += 1;
    const result = await client.callTool({
      name: "tuicraft_snapshot",
      arguments: {
        includeText: false,
        includeLines: false,
        includeRaw: options.includeRaw,
        generateArt: true,
        promptOnly: options.promptOnly,
        referencePath: options.referencePath,
        outDir: options.outDir,
        label: `${options.label}-${String(capture).padStart(3, "0")}`,
        model: options.model,
        size: options.size,
        quality: options.quality
      }
    }, undefined, { timeout: options.requestTimeoutMs });
    console.log(JSON.stringify(summarizeCapture(capture, toolText(result)), null, 2));
    if (Date.now() > stopAt || capture >= options.maxCaptures) {
      break;
    }
    await Bun.sleep(options.intervalSeconds * 1000);
  }
}

function summarizeCapture(capture: number, text: string | undefined): Record<string, unknown> {
  const payload = parseMaybeJson(text ?? "");
  const stateArt = asRecord(asRecord(payload).stateArt);
  const artStdout = asRecord(stateArt.stdout);
  return {
    capture,
    timestamp: asRecord(payload).timestamp,
    screen: asRecord(asRecord(payload).screen).summary,
    bot: asRecord(payload).bot,
    stateArt: {
      outPath: artStdout.outPath,
      promptPath: artStdout.promptPath,
      promptOnlyPath: artStdout.promptPath && !artStdout.outPath ? artStdout.promptPath : undefined,
      stderr: stateArt.stderr
    }
  };
}

function parseArgs(args: string[]): Options {
  const values = new Map<string, string | boolean>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown positional argument: ${arg}`);
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (["prompt-only", "include-raw"].includes(rawKey)) {
      values.set(rawKey, true);
      continue;
    }
    const value = inlineValue ?? args[++i];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }
    values.set(rawKey, value);
  }

  return {
    apiBase: (stringOption(values, "api") ?? Bun.env.TUICRAFT_API ?? "http://localhost:8787").replace(/\/$/, ""),
    intervalSeconds: numberOption(values, "interval-seconds", 300),
    durationSeconds: numberOption(values, "duration-seconds", 3600),
    maxCaptures: numberOption(values, "max-captures", 12),
    promptOnly: values.has("prompt-only"),
    includeRaw: values.has("include-raw"),
    referencePath: stringOption(values, "reference") ?? Bun.env.TUICRAFT_ART_REFERENCE,
    outDir: stringOption(values, "out-dir") ?? "output",
    label: stringOption(values, "label") ?? "watch",
    model: stringOption(values, "model") ?? Bun.env.TUICRAFT_ART_MODEL ?? "gpt-image-2",
    size: stringOption(values, "size") ?? Bun.env.TUICRAFT_ART_SIZE ?? "2048x1152",
    quality: stringOption(values, "quality") ?? Bun.env.TUICRAFT_ART_QUALITY ?? "medium",
    requestTimeoutMs: numberOption(values, "request-timeout-ms", 180_000)
  };
}

function stringOption(values: Map<string, string | boolean>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === "string" ? value : undefined;
}

function numberOption(values: Map<string, string | boolean>, key: string, fallback: number): number {
  const raw = stringOption(values, key);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${key} must be a positive number`);
  }
  return value;
}

function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return { text: trimmed };
  }
}

function toolText(value: unknown): string | undefined {
  const content = asRecord(value).content;
  if (!Array.isArray(content)) {
    return undefined;
  }
  const first = asRecord(content[0]);
  return typeof first.text === "string" ? first.text : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function envRecord(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
