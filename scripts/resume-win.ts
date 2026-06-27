const apiBase = (Bun.env.TUICRAFT_API ?? "http://localhost:8787").replace(/\/$/, "");
const config = await readConfig(configPath());

const payload: Record<string, unknown> = { ...config };
setString(payload, "mode", Bun.env.BOT_MODE);
setNumber(payload, "durationSeconds", readNumberEnv("BOT_DURATION_SECONDS"));
setNumber(payload, "intervalMs", readNumberEnv("BOT_INTERVAL_MS"));
setNumber(payload, "maxActions", readNumberEnv("BOT_MAX_ACTIONS"));
setNumber(payload, "maxReconnects", readNumberEnv("BOT_MAX_RECONNECTS"));
setString(payload, "accountUsername", Bun.env.BOT_ACCOUNT_USERNAME);
setString(payload, "accountPassword", Bun.env.BOT_ACCOUNT_PASSWORD);
setString(payload, "characterName", Bun.env.BOT_CHARACTER_NAME);
setString(payload, "characterClass", Bun.env.BOT_CHARACTER_CLASS);
setString(payload, "worldSeed", Bun.env.BOT_WORLD_SEED);
setBoolean(payload, "judgeEnabled", readBooleanEnv("TUICRAFT_JUDGE_ENABLED"));
setString(payload, "judgeModels", Bun.env.TUICRAFT_JUDGE_MODELS);
setNumber(payload, "judgeMaxCalls", readNumberEnv("TUICRAFT_JUDGE_MAX_CALLS"));
setNumber(payload, "judgeCooldownMs", readNumberEnv("TUICRAFT_JUDGE_COOLDOWN_MS"));
setBoolean(payload, "chatEnabled", readBooleanEnv("TUICRAFT_CHAT_ENABLED"));
setNumber(payload, "chatMaxMessages", readNumberEnv("TUICRAFT_CHAT_MAX_MESSAGES"));
setNumber(payload, "chatCooldownMs", readNumberEnv("TUICRAFT_CHAT_COOLDOWN_MS"));

payload.mode ??= "win";
payload.durationSeconds ??= 600;
payload.intervalMs ??= 1200;
payload.maxActions ??= 2500;
payload.maxReconnects ??= 6;
payload.accountUsername = requiredPayloadString(payload, "accountUsername", "BOT_ACCOUNT_USERNAME");
payload.accountPassword = requiredPayloadString(payload, "accountPassword", "BOT_ACCOUNT_PASSWORD");
payload.characterName = requiredPayloadString(payload, "characterName", "BOT_CHARACTER_NAME");

try {
  const response = await fetch(`${apiBase}/api/bot/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(text);
    process.exit(1);
  }
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function configPath(): string {
  const args = Bun.argv.slice(2);
  const flagIndex = args.indexOf("--config");
  if (flagIndex >= 0) {
    const value = args[flagIndex + 1]?.trim();
    if (!value) {
      throw new Error("--config requires a path");
    }
    return value;
  }
  const inline = args.find((arg) => arg.startsWith("--config="))?.slice("--config=".length).trim();
  return inline || Bun.env.BOT_RESUME_CONFIG?.trim() || "config/tuicraft-win.json";
}

async function readConfig(path: string): Promise<Record<string, unknown>> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return {};
  }
  const parsed = JSON.parse(await file.text());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function requiredPayloadString(payload: Record<string, unknown>, key: string, envName: string): string {
  const value = typeof payload[key] === "string" ? payload[key].trim() : "";
  if (!value) {
    throw new Error(`${key} is required; set it in config or ${envName}`);
  }
  return value;
}

function readNumberEnv(name: string): number | undefined {
  const raw = Bun.env[name]?.trim();
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

function readBooleanEnv(name: string): boolean | undefined {
  const raw = Bun.env[name]?.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  throw new Error(`${name} must be a boolean`);
}

function setString(payload: Record<string, unknown>, key: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    payload[key] = trimmed;
  }
}

function setNumber(payload: Record<string, unknown>, key: string, value: number | undefined): void {
  if (value !== undefined) {
    payload[key] = value;
  }
}

function setBoolean(payload: Record<string, unknown>, key: string, value: boolean | undefined): void {
  if (value !== undefined) {
    payload[key] = value;
  }
}

export {};
