const apiBase = (Bun.env.TUICRAFT_API ?? "http://localhost:8787").replace(/\/$/, "");

const payload = {
  mode: Bun.env.BOT_MODE ?? "win",
  durationSeconds: readNumberEnv("BOT_DURATION_SECONDS", 600),
  intervalMs: readNumberEnv("BOT_INTERVAL_MS", 700),
  maxActions: readNumberEnv("BOT_MAX_ACTIONS", 2500),
  accountUsername: requiredEnv("BOT_ACCOUNT_USERNAME"),
  accountPassword: requiredEnv("BOT_ACCOUNT_PASSWORD"),
  characterName: requiredEnv("BOT_CHARACTER_NAME")
};

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

function requiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = Bun.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

export {};
