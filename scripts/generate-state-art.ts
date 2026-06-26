import { dirname, resolve } from "node:path";

type VisualState = {
  characterName: string;
  level: number;
  className: string;
  hp: string;
  xp: string;
  gold: string;
  weapon: string;
  weaponPower: string;
  armor: string;
  armorValue: string;
  mapName: string;
  bossName: string;
  bossLevel: number;
  bossHp?: string;
  quest: string;
  judgeCalls?: number;
  runNote: string;
};

type Options = {
  apiBase: string;
  outPath: string;
  promptPath?: string;
  referencePath?: string;
  model: string;
  size: string;
  quality: string;
  promptOnly: boolean;
  template: boolean;
  runNote?: string;
};

type BotSummary = {
  judge?: {
    calls?: number;
  };
};

type BotLogResponse = {
  logs?: Array<{
    message: string;
  }>;
};

const DEFAULT_STATE: VisualState = {
  characterName: "Codex9tqnwg",
  level: 3,
  className: "Warrior",
  hp: "180/180",
  xp: "0/300",
  gold: "36g",
  weapon: "Rusty Sword +2",
  weaponPower: "7",
  armor: "Tattered Cloth Robes +1",
  armorValue: "4",
  mapName: "Northshire Abbey Town",
  bossName: "Shadow Overlord",
  bossLevel: 4,
  quest: "Elite Slayer (Ready!)",
  runNote: "Ready for the boss quest; no judge-run note available."
};

const options = parseArgs(Bun.argv.slice(2));
const state = options.template ? DEFAULT_STATE : await loadCurrentState(options.apiBase);
if (options.runNote) {
  state.runNote = options.runNote;
  applyRunNoteState(state, options.runNote);
}
const prompt = buildPrompt(state, options.referencePath);
const statePath = `${options.outPath}.state.json`;
const exactLines = exactStateLines(state);

await ensureParentDir(options.promptPath ?? `${options.outPath}.prompt.txt`);
await Bun.write(options.promptPath ?? `${options.outPath}.prompt.txt`, prompt);
await Bun.write(statePath, JSON.stringify({ state, exactLines }, null, 2));

if (options.promptOnly || !Bun.env.OPENAI_API_KEY) {
  console.log(JSON.stringify({ promptPath: options.promptPath ?? `${options.outPath}.prompt.txt`, statePath, exactLines, prompt }, null, 2));
  if (!Bun.env.OPENAI_API_KEY && !options.promptOnly) {
    console.warn("OPENAI_API_KEY is not set; wrote prompt only.");
  }
  process.exit(0);
}

await ensureParentDir(options.outPath);
const imageBytes = options.referencePath
  ? await generateWithReference(options, prompt)
  : await generateFromPrompt(options, prompt);
await Bun.write(options.outPath, imageBytes);
console.log(JSON.stringify({ outPath: options.outPath, statePath, promptPath: options.promptPath ?? `${options.outPath}.prompt.txt` }, null, 2));

function parseArgs(args: string[]): Options {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const values = new Map<string, string | boolean>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown positional argument: ${arg}`);
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (["prompt-only", "template"].includes(rawKey)) {
      values.set(rawKey, true);
      continue;
    }
    const value = inlineValue ?? args[++i];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }
    values.set(rawKey, value);
  }

  const outPath = stringOption(values, "out") ?? `output/tuicraft-state-${timestamp}.png`;
  return {
    apiBase: (stringOption(values, "api") ?? Bun.env.TUICRAFT_API ?? "http://localhost:8787").replace(/\/$/, ""),
    outPath,
    promptPath: stringOption(values, "prompt-out"),
    referencePath: stringOption(values, "reference") ?? Bun.env.TUICRAFT_ART_REFERENCE,
    model: stringOption(values, "model") ?? Bun.env.TUICRAFT_ART_MODEL ?? "gpt-image-2",
    size: stringOption(values, "size") ?? Bun.env.TUICRAFT_ART_SIZE ?? "2048x1152",
    quality: stringOption(values, "quality") ?? Bun.env.TUICRAFT_ART_QUALITY ?? "medium",
    promptOnly: values.has("prompt-only"),
    template: values.has("template"),
    runNote: stringOption(values, "run-note")
  };
}

function stringOption(values: Map<string, string | boolean>, key: string): string | undefined {
  const value = values.get(key);
  return typeof value === "string" ? value : undefined;
}

async function loadCurrentState(apiBase: string): Promise<VisualState> {
  try {
    const [screenResponse, botResponse, logResponse] = await Promise.all([
      fetch(`${apiBase}/api/screen`),
      fetch(`${apiBase}/api/bot`),
      fetch(`${apiBase}/api/bot/log?limit=80`)
    ]);
    if (!screenResponse.ok) {
      throw new Error(await screenResponse.text());
    }
    const screen = (await screenResponse.json()) as { lines?: string[]; text?: string };
    const bot = botResponse.ok ? ((await botResponse.json()) as BotSummary) : undefined;
    const log = logResponse.ok ? ((await logResponse.json()) as BotLogResponse) : undefined;
    return parseScreenState(screen.text ?? (screen.lines ?? []).join("\n"), bot, log);
  } catch (error) {
    console.warn(`Could not read current screen; using template state: ${error instanceof Error ? error.message : String(error)}`);
    return DEFAULT_STATE;
  }
}

function parseScreenState(text: string, bot?: BotSummary, log?: BotLogResponse): VisualState {
  const characterMatch = text.match(/([A-Za-z][A-Za-z0-9_-]+)\s+Lvl\s+(\d+)\s+\(([^)]+)\)/);
  const hp = text.match(/\bHP:\s*([0-9]+\/[0-9]+)/)?.[1];
  const xp = text.match(/\bXP:\s*([0-9]+\/[0-9]+)/)?.[1];
  const gold = text.match(/\b(?:GP|Gold):\s*([0-9]+g)/)?.[1];
  const weaponMatch = text.match(/\bWpn:\s*([^\n│]+?)\s*\((\d+)\)/);
  const armorMatch = text.match(/\bArm:\s*([^\n│]+?)\s*\((\d+)\)/);
  const mapName = text.match(/\[Map:\s*([^\]]+)\]/)?.[1];
  const quest = text.match(/\bQuest:\s*([^\n│]+)/)?.[1]?.trim();
  const bossMatch = text.match(/Shadow Overlord\s+\(BOSS Lvl\s+(\d+)\)\s+\((\d+)hp\)/i);
  const partialState = {
    weapon: normalizeItemName(weaponMatch?.[1]) ?? DEFAULT_STATE.weapon
  };

  return {
    characterName: characterMatch?.[1] ?? DEFAULT_STATE.characterName,
    level: Number(characterMatch?.[2] ?? DEFAULT_STATE.level),
    className: characterMatch?.[3] ?? DEFAULT_STATE.className,
    hp: hp ?? DEFAULT_STATE.hp,
    xp: xp ?? DEFAULT_STATE.xp,
    gold: gold ?? DEFAULT_STATE.gold,
    weapon: normalizeItemName(weaponMatch?.[1]) ?? DEFAULT_STATE.weapon,
    weaponPower: weaponMatch?.[2] ?? DEFAULT_STATE.weaponPower,
    armor: normalizeItemName(armorMatch?.[1]) ?? DEFAULT_STATE.armor,
    armorValue: armorMatch?.[2] ?? DEFAULT_STATE.armorValue,
    mapName: mapName ?? DEFAULT_STATE.mapName,
    bossName: DEFAULT_STATE.bossName,
    bossLevel: Number(bossMatch?.[1] ?? DEFAULT_STATE.bossLevel),
    bossHp: bossMatch?.[2],
    quest: quest ?? DEFAULT_STATE.quest,
    judgeCalls: bot?.judge?.calls,
    runNote: buildRunNote(bot, log, partialState.weapon)
  };
}

function normalizeItemName(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

function buildPrompt(state: VisualState, referencePath: string | undefined): string {
  const healthPhrase = isFullHealth(state.hp) ? `full health HP ${state.hp}` : `current health HP ${state.hp}`;
  const bossState = state.bossHp ? ` Current run note: ${state.bossName} has ${state.bossHp} HP remaining, but do not render that number as text.` : "";
  const exactLines = exactStateLines(state);
  const referenceInstruction = referencePath
    ? "Use the attached reference image as a strict style, layout, and palette anchor while updating the state details below. Keep character identity, map readability, CRT glow, and left-portrait/right-map composition highly consistent."
    : "Generate a highly consistent TUICraft tactical character/map concept illustration from the template below.";

  return [
    referenceInstruction,
    "",
    "Subject:",
    `${state.characterName}, a Level ${state.level} ${state.className} from a terminal/TUI fantasy RPG. He has ${healthPhrase}, XP ${state.xp}, ${state.gold}, ${state.weapon} with power ${state.weaponPower}, ${state.armor} with armor ${state.armorValue}, and quest ${state.quest}. Show him as a practical low-level adventurer: worn cloth robes, simple belt, boots, short upgraded rusty sword with a faint warm glow, alert stance, ready for a boss quest. No ornate heroic armor.${bossState}`,
    "",
    "Required in-image current-state panel:",
    "As part of the generated illustration itself, include a compact terminal-style status panel in the left panel or bottom band with these exact lines. Keep it readable, green/amber terminal text, and do not paraphrase:",
    ...exactLines,
    "",
    "Composition:",
    "Wide 16:9 image. Left third is the character portrait/full-body concept. Right two-thirds is a clean top-down tactical terminal-map visualization.",
    "",
    "Map:",
    "Northshire Abbey Town, enclosed by rectangular stone walls. Use a dark CRT/terminal fantasy style with readable tile-grid geometry. Include these labeled locations exactly: S Merchant in the upper-left interior, Q Quest in the left-middle interior, I Inn in the lower-left interior, D Dungeon on the right wall, @ Codex9tqnwg near the route toward D.",
    "",
    "Inset:",
    "Include a small inset/portal preview labeled Fargodeep Cave (Lvl 1). The cave preview should show dark stone corridors, level 1 mobs represented as small hostile markers, and a looming distant Shadow Overlord Boss Lvl 4 silhouette deeper in the cave. The boss should feel dangerous but not currently engaged.",
    "",
    "Style:",
    "Polished pixel-art plus terminal-map aesthetic, dark parchment background, subtle CRT glow, clean tactical readability, sharp silhouettes, restrained fantasy colors, no clutter, no UI cards, no marketing layout.",
    "",
    "Text constraints:",
    `Include the exact status block above plus these map labels, spelled exactly: ${state.characterName}, Lvl ${state.level} ${state.className}, Northshire Abbey Town, Fargodeep Cave (Lvl 1), S Merchant, Q Quest, I Inn, D Dungeon, Shadow Overlord Boss Lvl 4. Do not include unrelated text, marketing copy, or extra stats.`
  ].join("\n");
}

function exactStateLines(state: VisualState): string[] {
  const location = /town|abbey/i.test(state.mapName) ? "town" : state.mapName;
  const health = isFullHealth(state.hp) ? `full HP ${state.hp}` : `HP ${state.hp}`;
  return [
    `Current state: ${location}, ${health}, level ${state.level}, ${state.xp} XP, ${state.gold},`,
    `weapon: ${state.weapon} (${state.weaponPower}), armor: ${state.armor} (${state.armorValue}),`,
    `quest: ${state.quest}.`,
    `Run note: ${state.runNote}`
  ];
}

function buildRunNote(bot: BotSummary | undefined, log: BotLogResponse | undefined, weapon: string): string {
  const messages = log?.logs?.map((entry) => entry.message) ?? [];
  const judgeCalls = bot?.judge?.calls;
  const parts: string[] = [];
  if (judgeCalls !== undefined && judgeCalls > 0) {
    parts.push(`judge run made ${judgeCalls} calls`);
  }
  if (messages.some((message) => /attack|hunt|bail|state changed/i.test(message))) {
    parts.push("got XP/gold");
  }
  if (messages.some((message) => /sell spare loot/i.test(message))) {
    parts.push("sold loot");
  }
  if (messages.some((message) => /buy weapon upgrade/i.test(message))) {
    parts.push(`bought ${weapon}`);
  }
  if (messages.some((message) => /bail|retreat|stuck/i.test(message))) {
    parts.push("retreated before finishing the boss");
  }
  return parts.length > 0 ? `${parts.join(", ")}.` : DEFAULT_STATE.runNote;
}

function applyRunNoteState(state: VisualState, note: string): void {
  const hp = note.match(/\b(?:full\s+HP|HP)\s+(\d+\/\d+)/i)?.[1];
  if (hp) {
    state.hp = hp;
  }

  const level = note.match(/\blevel\s+(\d+)/i)?.[1];
  if (level) {
    state.level = Number(level);
  }

  const xp = note.match(/\b(\d+\/\d+)\s+XP\b/i)?.[1];
  if (xp) {
    state.xp = xp;
  }

  const gold = note.match(/\b(\d+g)\b/i)?.[1];
  if (gold) {
    state.gold = gold;
  }

  const weapon = note.match(/\bweapon(?:\s+is\s+now)?\s+([^,.]+?)\s*\((\d+)\)/i);
  if (weapon) {
    state.weapon = normalizeItemName(weapon[1]) ?? state.weapon;
    state.weaponPower = weapon[2];
  }

  const armor = note.match(/\barmor(?:\s+is\s+now)?\s+([^,.]+?)\s*\((\d+)\)/i);
  if (armor) {
    const armorName = normalizeItemName(armor[1]);
    state.armor = armorName && /^\+\d+$/.test(armorName) ? `Tattered Cloth Robes ${armorName}` : armorName ?? state.armor;
    state.armorValue = armor[2];
  }

  const quest = note.match(/\bquest\s+(?:still\s+)?(.+?)(?=\s+The judge|\s+judge run|$)/i)?.[1];
  if (quest) {
    state.quest = quest.trim().replace(/\.$/, "");
  }

  if (/\btown\b/i.test(note)) {
    state.mapName = "Northshire Abbey Town";
  }

  const judgeCalls = note.match(/\bjudge run made\s+(\d+)\s+calls/i)?.[1];
  if (judgeCalls) {
    state.judgeCalls = Number(judgeCalls);
  }
}

function isFullHealth(hp: string): boolean {
  const match = hp.match(/^(\d+)\/(\d+)$/);
  return Boolean(match && match[1] === match[2]);
}

async function generateFromPrompt(options: Options, prompt: string): Promise<Uint8Array> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      prompt,
      size: options.size,
      quality: options.quality,
      n: 1
    })
  });
  return decodeImageResponse(response);
}

async function generateWithReference(options: Options, prompt: string): Promise<Uint8Array> {
  const referencePath = options.referencePath;
  if (!referencePath) {
    throw new Error("Reference path is required");
  }
  const form = new FormData();
  form.append("model", options.model);
  form.append("prompt", prompt);
  form.append("size", options.size);
  form.append("quality", options.quality);
  form.append("n", "1");
  form.append("image", Bun.file(referencePath), referencePath.split("/").at(-1) ?? "reference.png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`
    },
    body: form
  });
  return decodeImageResponse(response);
}

async function decodeImageResponse(response: Response): Promise<Uint8Array> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }
  const body = JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> };
  const first = body.data?.[0];
  if (first?.b64_json) {
    return Buffer.from(first.b64_json, "base64");
  }
  if (first?.url) {
    const image = await fetch(first.url);
    if (!image.ok) {
      throw new Error(`Failed to download generated image: ${image.status}`);
    }
    return new Uint8Array(await image.arrayBuffer());
  }
  throw new Error("Image response did not include b64_json or url");
}

async function ensureParentDir(path: string): Promise<void> {
  await Bun.$`mkdir -p ${dirname(resolve(path))}`.quiet();
}

function requiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
