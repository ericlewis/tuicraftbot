export const WORLD_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>TUICraft World View</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080a0d;
      --surface: #10151b;
      --surface-2: #151d25;
      --line: #2d3945;
      --text: #eef3f6;
      --muted: #9aa8b5;
      --green: #49d17d;
      --cyan: #42c6ff;
      --amber: #e7b45e;
      --red: #ec6d5f;
      --purple: #b083ff;
      --stone: #68717b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at 52% 15%, #182026 0, #080a0d 36rem);
      color: var(--text);
      font: 14px/1.42 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    a { color: var(--cyan); text-decoration: none; }
    button, input, select {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #1b2530;
      color: var(--text);
      font: inherit;
    }
    button {
      min-height: 34px;
      padding: 0 10px;
      cursor: pointer;
    }
    button:hover { border-color: var(--cyan); }
    input[type="range"] { accent-color: var(--cyan); }
    select {
      min-height: 30px;
      padding: 0 8px;
    }
    .shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      min-height: 100vh;
    }
    .stage {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-width: 0;
      border-right: 1px solid var(--line);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: rgba(13, 18, 24, 0.92);
      backdrop-filter: blur(10px);
    }
    h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .topline {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .subtle {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .tools {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .world-wrap {
      position: relative;
      min-height: 0;
      background:
        linear-gradient(rgba(66, 198, 255, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(66, 198, 255, 0.035) 1px, transparent 1px),
        #07090c;
      background-size: 32px 32px;
      overflow: hidden;
    }
    #world {
      display: block;
      width: 100%;
      height: 100%;
      cursor: crosshair;
    }
    .hover {
      position: absolute;
      left: 12px;
      bottom: 12px;
      max-width: min(560px, calc(100% - 24px));
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: rgba(10, 14, 18, 0.88);
      color: var(--muted);
      font: 12px/1.35 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      pointer-events: none;
    }
    .state-strip {
      position: absolute;
      left: 12px;
      top: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      pointer-events: none;
    }
    .capsule {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 5px 8px;
      border: 1px solid rgba(66, 198, 255, 0.22);
      border-radius: 6px;
      background: rgba(8, 12, 16, 0.78);
      color: var(--text);
      font: 12px/1.25 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      box-shadow: 0 6px 22px rgba(0, 0, 0, 0.28);
    }
    .capsule strong {
      color: var(--cyan);
      font-weight: 700;
    }
    .capsule.danger strong { color: var(--red); }
    .capsule.ready strong { color: var(--green); }
    .capsule.warn strong { color: var(--amber); }
    aside {
      display: grid;
      align-content: start;
      gap: 14px;
      padding: 14px;
      min-width: 0;
      background: var(--surface);
      overflow: auto;
      max-height: 100vh;
    }
    section {
      display: grid;
      gap: 8px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--line);
    }
    section:last-child { border-bottom: 0; }
    h2 {
      margin: 0;
      color: #dbe5ee;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .objective {
      color: var(--amber);
      font-size: 14px;
      line-height: 1.35;
    }
    dl {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 6px 12px;
      margin: 0;
      color: var(--muted);
      font-size: 12px;
    }
    dt { color: #cdd7df; }
    dd {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meter {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .track {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: #222a32;
    }
    .fill {
      width: 0;
      height: 100%;
      background: var(--green);
    }
    .fill.mana { background: var(--cyan); }
    .fill.xp { background: var(--purple); }
    .legend {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px 10px;
      color: var(--muted);
      font-size: 12px;
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .swatch {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      background: var(--stone);
      flex: 0 0 auto;
    }
    .swatch.player { background: var(--cyan); }
    .swatch.mob { background: var(--red); }
    .swatch.boss { background: var(--purple); }
    .swatch.town { background: var(--amber); }
    .log {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--muted);
      font: 12px/1.35 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }
    .log li {
      overflow-wrap: anywhere;
      padding: 6px 0;
      border-bottom: 1px solid rgba(45, 57, 69, 0.55);
    }
    .log li:last-child { border-bottom: 0; }
    .status-line {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--amber);
      box-shadow: 0 0 12px rgba(231, 180, 94, 0.6);
    }
    .dot.live {
      background: var(--green);
      box-shadow: 0 0 14px rgba(73, 209, 125, 0.65);
    }
    .controls {
      display: grid;
      grid-template-columns: repeat(3, 42px);
      gap: 6px;
      width: max-content;
    }
    .controls button { padding: 0; }
    .controls .wide { grid-column: span 3; width: 100%; }
    .readiness {
      display: grid;
      gap: 7px;
    }
    .stage-step {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .stage-dot {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #202b35;
    }
    .stage-step.ready .stage-dot {
      border-color: rgba(73, 209, 125, 0.75);
      background: var(--green);
      box-shadow: 0 0 10px rgba(73, 209, 125, 0.35);
    }
    .stage-step.warn .stage-dot {
      border-color: rgba(231, 180, 94, 0.8);
      background: var(--amber);
      box-shadow: 0 0 10px rgba(231, 180, 94, 0.3);
    }
    .stage-step.danger .stage-dot {
      border-color: rgba(236, 109, 95, 0.8);
      background: var(--red);
      box-shadow: 0 0 10px rgba(236, 109, 95, 0.3);
    }
    .stage-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #dbe5ee;
    }
    .stage-value {
      color: var(--muted);
      font: 12px/1.25 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      white-space: nowrap;
    }
    .delta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .delta {
      display: grid;
      gap: 2px;
      padding: 7px;
      border: 1px solid rgba(45, 57, 69, 0.72);
      border-radius: 6px;
      background: rgba(21, 29, 37, 0.54);
      min-width: 0;
    }
    .delta span {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .delta strong {
      color: var(--text);
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .trend-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .trend-card {
      display: grid;
      gap: 5px;
      min-width: 0;
      padding: 7px;
      border: 1px solid rgba(45, 57, 69, 0.72);
      border-radius: 6px;
      background: rgba(12, 17, 22, 0.72);
    }
    .trend-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .trend-top span {
      flex: 0 0 auto;
    }
    .trend-top strong {
      color: var(--text);
      font: 12px/1.25 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      text-transform: none;
      letter-spacing: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .sparkline {
      width: 100%;
      height: 34px;
      display: block;
    }
    .timeline-tools,
    .replay-tools {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .timeline-tools button,
    .replay-tools button {
      min-height: 30px;
      font-size: 12px;
    }
    .replay {
      display: grid;
      gap: 7px;
    }
    .replay input[type="range"] {
      width: 100%;
    }
    .timeline {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .timeline button {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      width: 100%;
      min-height: 0;
      padding: 7px;
      text-align: left;
      border-color: rgba(45, 57, 69, 0.72);
      background: rgba(12, 17, 22, 0.7);
    }
    .timeline button.selected {
      border-color: var(--cyan);
      background: rgba(66, 198, 255, 0.09);
    }
    .timeline-time {
      color: var(--amber);
      font: 11px/1.35 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      white-space: nowrap;
    }
    .timeline-title {
      color: var(--text);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .timeline-note {
      grid-column: 2;
      color: var(--muted);
      font: 11px/1.35 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      overflow-wrap: anywhere;
    }
    .detail {
      min-height: 40px;
      padding: 8px 0 0;
      color: var(--muted);
      font: 12px/1.4 "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      overflow-wrap: anywhere;
    }
    @media (max-width: 940px) {
      .shell { grid-template-columns: 1fr; }
      .stage { min-height: 62vh; border-right: 0; border-bottom: 1px solid var(--line); }
      aside { max-height: none; }
      header { align-items: flex-start; flex-direction: column; }
      .tools { justify-content: flex-start; }
      .state-strip { position: static; padding: 10px; background: #080a0d; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="stage">
      <header>
        <div class="topline">
          <h1 id="map-title">TUICraft World</h1>
          <span id="frame" class="subtle"></span>
        </div>
        <div class="tools">
          <a href="/">Terminal</a>
          <label class="check"><input id="follow" type="checkbox">Follow</label>
          <label class="check"><input id="labels" type="checkbox" checked>Labels</label>
          <label class="check"><input id="agents" type="checkbox" checked>Agents</label>
          <label class="check"><input id="threats" type="checkbox" checked>Threats</label>
          <label class="check"><input id="manual" type="checkbox">Manual input</label>
          <label class="check">Focus
            <select id="focus">
              <option value="auto">Auto</option>
              <option value="target">Target</option>
              <option value="boss">Boss</option>
              <option value="dungeon">Dungeon</option>
              <option value="portal">Portal</option>
              <option value="mob">Mob</option>
              <option value="chest">Chest</option>
              <option value="merchant">Merchant</option>
              <option value="quest">Quest</option>
              <option value="inn">Inn</option>
            </select>
          </label>
          <label class="check">Zoom <input id="zoom" type="range" min="1" max="3" value="1" step="0.25"></label>
        </div>
      </header>
      <div class="world-wrap" id="wrap">
        <canvas id="world"></canvas>
        <div id="state-strip" class="state-strip"></div>
        <div id="hover" class="hover">Waiting for world state</div>
      </div>
    </div>
    <aside>
      <section>
        <div class="status-line"><span id="live-dot" class="dot"></span><span id="live-status">connecting</span></div>
        <div id="objective" class="objective">Reading live state</div>
      </section>
      <section>
        <h2>Progression</h2>
        <div id="readiness" class="readiness"></div>
        <div id="deltas" class="delta-grid"></div>
        <div id="trends" class="trend-grid"></div>
      </section>
      <section>
        <h2>Character</h2>
        <div id="meters"></div>
        <dl id="character"></dl>
      </section>
      <section>
        <h2>Run</h2>
        <dl id="run"></dl>
      </section>
      <section>
        <h2>Map</h2>
        <dl id="map"></dl>
        <div class="legend">
          <span><i class="swatch player"></i>Player</span>
          <span><i class="swatch mob"></i>Mob</span>
          <span><i class="swatch boss"></i>Boss</span>
          <span><i class="swatch town"></i>Town</span>
        </div>
      </section>
      <section>
        <h2>Route</h2>
        <dl id="route"></dl>
      </section>
      <section>
        <h2>Timeline</h2>
        <div class="replay">
          <input id="snapshot-range" type="range" min="0" max="0" value="0" step="1">
          <div class="replay-tools">
            <button id="snapshot-prev" type="button">Prev</button>
            <button id="snapshot-play" type="button">Play</button>
            <button id="snapshot-next" type="button">Next</button>
          </div>
          <div id="snapshot-status" class="detail">Live</div>
        </div>
        <div class="timeline-tools">
          <button id="timeline-live" type="button">Live</button>
          <button id="clear-trail" type="button">Clear Trail</button>
        </div>
        <ol id="timeline" class="timeline"></ol>
        <div id="timeline-detail" class="detail">No progression events yet</div>
      </section>
      <section>
        <h2>Manual</h2>
        <div class="controls">
          <span></span><button data-key="w">W</button><span></span>
          <button data-key="a">A</button><button data-key="s">S</button><button data-key="d">D</button>
          <button class="wide" data-key="space">Attack</button>
        </div>
      </section>
      <section>
        <h2>Recent</h2>
        <ul id="log" class="log"></ul>
      </section>
    </aside>
  </main>
  <script>
    const canvas = document.getElementById("world");
    const ctx = canvas.getContext("2d");
    const wrap = document.getElementById("wrap");
    const titleEl = document.getElementById("map-title");
    const frameEl = document.getElementById("frame");
    const hoverEl = document.getElementById("hover");
    const liveDotEl = document.getElementById("live-dot");
    const liveStatusEl = document.getElementById("live-status");
    const objectiveEl = document.getElementById("objective");
    const stateStripEl = document.getElementById("state-strip");
    const readinessEl = document.getElementById("readiness");
    const deltasEl = document.getElementById("deltas");
    const trendsEl = document.getElementById("trends");
    const metersEl = document.getElementById("meters");
    const characterEl = document.getElementById("character");
    const runEl = document.getElementById("run");
    const mapEl = document.getElementById("map");
    const routeEl = document.getElementById("route");
    const logEl = document.getElementById("log");
    const timelineEl = document.getElementById("timeline");
    const timelineDetailEl = document.getElementById("timeline-detail");
    const timelineLiveEl = document.getElementById("timeline-live");
    const clearTrailEl = document.getElementById("clear-trail");
    const snapshotRangeEl = document.getElementById("snapshot-range");
    const snapshotPrevEl = document.getElementById("snapshot-prev");
    const snapshotPlayEl = document.getElementById("snapshot-play");
    const snapshotNextEl = document.getElementById("snapshot-next");
    const snapshotStatusEl = document.getElementById("snapshot-status");
    const followEl = document.getElementById("follow");
    const labelsEl = document.getElementById("labels");
    const agentsEl = document.getElementById("agents");
    const threatsEl = document.getElementById("threats");
    const manualEl = document.getElementById("manual");
    const focusEl = document.getElementById("focus");
    const zoomEl = document.getElementById("zoom");

    const state = {
      world: null,
      selectedWorld: null,
      selectedTile: null,
      routePlan: null,
      trail: [],
      snapshots: [],
      selectedTimelineId: "live",
      selectedSnapshotId: null,
      playbackTimer: null,
      refreshPending: false,
      eventConnected: false,
      hoverTile: null,
      playerTween: null,
      animationFrame: null,
      geometry: { cell: 12, offsetX: 0, offsetY: 0 },
      lastFrame: -1
    };

    const colors = {
      bg: "#07090c",
      floor: "#111b16",
      floorDot: "#274433",
      wall: "#646d78",
      grid: "rgba(80, 100, 120, 0.18)",
      cyan: "#42c6ff",
      player: "#42c6ff",
      playerGlow: "rgba(66, 198, 255, 0.28)",
      mob: "#ec6d5f",
      red: "#ec6d5f",
      boss: "#b083ff",
      town: "#e7b45e",
      chest: "#d3924b",
      text: "#eef3f6",
      muted: "#9aa8b5",
      path: "rgba(66, 198, 255, 0.48)",
      route: "rgba(231, 180, 94, 0.88)",
      routeGlow: "rgba(231, 180, 94, 0.18)",
      ghost: "rgba(66, 198, 255, 0.28)",
      threatMob: "rgba(236, 109, 95, 0.16)",
      threatBoss: "rgba(176, 131, 255, 0.2)"
    };

    function displayWorld() {
      return state.selectedWorld || state.world;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }

    function pairRows(rows) {
      return rows.map(([key, value]) => "<dt>" + escapeHtml(key) + "</dt><dd>" + escapeHtml(value ?? "") + "</dd>").join("");
    }

    function meter(label, value, className) {
      if (!value || !Number.isFinite(value.current) || !Number.isFinite(value.max) || value.max <= 0) return "";
      const pct = Math.max(0, Math.min(100, Math.round(value.ratio * 100)));
      return "<div class=\"meter\"><span>" + escapeHtml(label) + "</span><div class=\"track\"><div class=\"fill " +
        escapeHtml(className || "") + "\" style=\"width:" + pct + "%\"></div></div><span>" +
        escapeHtml(value.current + "/" + value.max) + "</span></div>";
    }

    function formatMeterValue(value) {
      if (!value || !Number.isFinite(value.current) || !Number.isFinite(value.max)) return "";
      return value.current + "/" + value.max;
    }

    function formatRatio(value) {
      if (!value || !Number.isFinite(value.ratio)) return "";
      return Math.round(Math.max(0, Math.min(1, value.ratio)) * 100) + "%";
    }

    function parseUpgrade(value) {
      const match = String(value || "").match(/\+(\d+)/);
      return match ? Number(match[1]) : undefined;
    }

    function tuningNumber(world, key, fallback) {
      const value = world && world.bot && world.bot.tuning ? Number(world.bot.tuning[key]) : NaN;
      return Number.isFinite(value) ? value : fallback;
    }

    function questLooksAccepted(world) {
      const stats = world.stats || {};
      if (/Elite Slayer|Active|Ready|In Progress/i.test(stats.quest || "")) return true;
      return (world.logs || []).some((entry) => {
        const text = entry.message + " " + JSON.stringify(entry.data || {});
        return /accept elite quest|Quest '.*' accepted|Quest:\s*Elite Slayer|Elite Slayer/i.test(text);
      });
    }

    function readinessSteps(world) {
      const stats = world.stats || {};
      const hp = stats.hp;
      const levelGate = tuningNumber(world, "questBossMinLevel", 4);
      const weaponGate = tuningNumber(world, "questBossMinWeaponUpgrade", 0);
      const armorGate = tuningNumber(world, "questBossMinArmorUpgrade", 0);
      const minFightHp = tuningNumber(world, "questBossMinFightHpRatio", 0.3);
      const weaponUpgrade = parseUpgrade(stats.weapon);
      const armorUpgrade = parseUpgrade(stats.armor);
      const level = Number(stats.level || 0);
      const hpRatio = hp && hp.max ? hp.current / hp.max : 0;
      const target = stats.target || "";
      const targetHp = stats.targetHp;
      const questReady = questLooksAccepted(world);
      return [
        {
          label: "Level gate",
          value: level ? "L" + level + " / L" + levelGate : "unknown",
          status: level >= levelGate ? "ready" : "danger"
        },
        {
          label: "Weapon gate",
          value: stats.weapon ? stats.weapon + " / +" + weaponGate : "unknown",
          status: weaponUpgrade === undefined || weaponUpgrade >= weaponGate ? "ready" : "warn"
        },
        {
          label: "Armor gate",
          value: stats.armor ? stats.armor + " / +" + armorGate : "unknown",
          status: armorUpgrade === undefined || armorUpgrade >= armorGate ? "ready" : "warn"
        },
        {
          label: "Quest",
          value: stats.quest || (questReady ? "Elite Slayer" : "unknown"),
          status: questReady ? "ready" : "warn"
        },
        {
          label: "Fight health",
          value: hp ? formatMeterValue(hp) + " (" + formatRatio(hp) + ")" : "unknown",
          status: hpRatio > minFightHp ? (hpRatio >= 0.9 ? "ready" : "warn") : "danger"
        },
        {
          label: "Boss contact",
          value: target ? target + (targetHp ? " " + formatMeterValue(targetHp) : "") : "none",
          status: /Boss|Shadow Overlord/i.test(target) ? "warn" : "ready"
        }
      ];
    }

    function renderProgression(world) {
      const stats = world.stats || {};
      const bot = world.bot || {};
      const progression = world.progression || {};
      const steps = Array.isArray(progression.gates) && progression.gates.length ? progression.gates : readinessSteps(world);
      const readyCount = steps.filter((step) => step.status === "ready").length;
      const recentAction = progression.recentAction || bot.lastAction;
      const phase = progression.phase || phaseLabel(world);
      stateStripEl.innerHTML = [
        capsule(stats.name || bot.characterName || "character", "L" + (stats.level || "?"), "ready"),
        capsule("Phase", phase, progression.bossReady ? "ready" : "warn"),
        capsule("Intent", recentAction ? recentAction.label : "observing", ""),
        capsule("HP", formatMeterValue(stats.hp) || "?", stats.hp && stats.hp.ratio < 0.35 ? "danger" : "ready"),
        capsule("XP", formatMeterValue(stats.xp) || "?", ""),
        capsule("Gold", stats.gold !== undefined ? stats.gold + "g" : "?", ""),
        capsule("Weapon", stats.weapon || "?", parseUpgrade(stats.weapon) >= tuningNumber(world, "questBossMinWeaponUpgrade", 0) ? "ready" : "warn"),
        capsule("Armor", stats.armor || "?", parseUpgrade(stats.armor) >= tuningNumber(world, "questBossMinArmorUpgrade", 0) ? "ready" : "warn"),
        capsule("Boss Gate", readyCount + "/" + steps.length, progression.bossReady || readyCount === steps.length ? "ready" : "warn")
      ].join("");
      readinessEl.innerHTML = steps.map((step) => {
        return "<div class=\"stage-step " + escapeHtml(step.status) + "\"><i class=\"stage-dot\"></i><span class=\"stage-label\">" +
          escapeHtml(step.label) + "</span><span class=\"stage-value\">" + escapeHtml(step.value) + "</span></div>";
      }).join("");
      deltasEl.innerHTML = [
        delta("Phase", phase),
        delta("Intent", recentAction ? "#" + recentAction.count + " " + recentAction.label : ""),
        delta("XP Left", progression.xpRemaining !== undefined ? progression.xpRemaining : xpRemaining(stats.xp)),
        delta("Window", trendDeltaLabel(progression)),
        delta("Map", world.mapName || ""),
        delta("Mana", formatMeterValue(stats.mana)),
        delta("Target", stats.target || "none")
      ].join("");
      renderTrends(world);
      renderTimeline(world);
    }

    function phaseLabel(world) {
      const objective = world.objective || "";
      if (/Farm to level/i.test(objective)) return "Farming level";
      if (/gear/i.test(objective)) return "Farming gear";
      if (/reward/i.test(objective)) return "Turn in quest";
      if (/boss/i.test(objective)) return "Boss route";
      if (world.stats && world.stats.target) return "Combat";
      return "Observing";
    }

    function xpRemaining(xp) {
      if (!xp || !Number.isFinite(xp.current) || !Number.isFinite(xp.max)) return "";
      return Math.max(0, xp.max - xp.current);
    }

    function trendDeltaLabel(progression) {
      const parts = [];
      if (Number.isFinite(progression.xpDelta)) parts.push(formatSigned(progression.xpDelta) + " XP");
      if (Number.isFinite(progression.goldDelta)) parts.push(formatSigned(progression.goldDelta) + "g");
      return parts.join(" / ") || "-";
    }

    function formatSigned(value) {
      return (value >= 0 ? "+" : "") + value;
    }

    function capsule(label, value, status) {
      return "<span class=\"capsule " + escapeHtml(status || "") + "\"><span>" + escapeHtml(label) +
        "</span><strong>" + escapeHtml(value || "") + "</strong></span>";
    }

    function delta(label, value) {
      return "<div class=\"delta\"><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(value || "-") + "</strong></div>";
    }

    function renderTrends(world) {
      const snapshots = state.snapshots.slice(-40);
      const xpPoints = snapshots
        .map((snapshot) => snapshot.world && snapshot.world.stats ? snapshot.world.stats.xp : undefined)
        .filter((xp) => xp && Number.isFinite(xp.current))
        .map((xp) => xp.current);
      const goldPoints = snapshots
        .map((snapshot) => snapshot.world && snapshot.world.stats ? snapshot.world.stats.gold : undefined)
        .filter((gold) => Number.isFinite(gold));
      const stats = world.stats || {};
      const xpLabel = stats.xp ? formatMeterValue(stats.xp) + " · " + xpRemaining(stats.xp) + " left" : "unknown";
      const goldLabel = stats.gold !== undefined ? stats.gold + "g" : "unknown";
      trendsEl.innerHTML = [
        trendCard("XP", xpLabel, xpPoints, "#b083ff"),
        trendCard("Gold", goldLabel, goldPoints, "#e7b45e")
      ].join("");
    }

    function trendCard(label, value, points, color) {
      return "<div class=\"trend-card\"><div class=\"trend-top\"><span>" + escapeHtml(label) + "</span><strong>" +
        escapeHtml(value) + "</strong></div>" + sparkline(points, color) + "</div>";
    }

    function sparkline(points, color) {
      const clean = points.filter((point) => Number.isFinite(point));
      if (clean.length < 2) {
        return "<svg class=\"sparkline\" viewBox=\"0 0 120 34\" role=\"img\" aria-label=\"Not enough history\"><line x1=\"0\" y1=\"28\" x2=\"120\" y2=\"28\" stroke=\"rgba(154,168,181,0.3)\" /></svg>";
      }
      const min = Math.min(...clean);
      const max = Math.max(...clean);
      const range = Math.max(1, max - min);
      const path = clean.map((value, index) => {
        const x = clean.length === 1 ? 0 : (index / (clean.length - 1)) * 118 + 1;
        const y = 29 - ((value - min) / range) * 24;
        return (index === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
      }).join(" ");
      return "<svg class=\"sparkline\" viewBox=\"0 0 120 34\" role=\"img\" aria-label=\"trend\"><path d=\"" +
        escapeHtml(path) + "\" fill=\"none\" stroke=\"" + escapeHtml(color) + "\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" /><line x1=\"0\" y1=\"29\" x2=\"120\" y2=\"29\" stroke=\"rgba(154,168,181,0.22)\" /></svg>";
    }

    function snapshotSignature(world) {
      const stats = world.stats || {};
      const bot = world.bot || {};
      return [
        world.mapName || "",
        stats.level || "",
        formatMeterValue(stats.hp),
        formatMeterValue(stats.mana),
        formatMeterValue(stats.xp),
        stats.gold,
        stats.weapon,
        stats.armor,
        stats.quest,
        stats.target,
        formatMeterValue(stats.targetHp),
        bot.status,
        bot.actionCount
      ].join("|");
    }

    function recordSnapshot(world) {
      const signature = snapshotSignature(world);
      const last = state.snapshots[state.snapshots.length - 1];
      if (last && last.signature === signature) return;
      const stats = world.stats || {};
      state.snapshots.push({
        id: "snapshot-" + world.frame + "-" + Date.now(),
        ts: world.ts || new Date().toISOString(),
        signature,
        title: (world.mapName || "World") + " · L" + (stats.level || "?"),
        note: [
          stats.hp ? "HP " + formatMeterValue(stats.hp) : "",
          stats.xp ? "XP " + formatMeterValue(stats.xp) : "",
          stats.gold !== undefined ? stats.gold + "g" : "",
          stats.weapon || "",
          stats.armor || ""
        ].filter(Boolean).join(" · "),
        world
      });
      state.snapshots = state.snapshots.slice(-40);
      syncReplayControls();
    }

    function snapshotIndexById(id) {
      return state.snapshots.findIndex((snapshot) => snapshot.id === id);
    }

    function syncReplayControls() {
      const max = Math.max(0, state.snapshots.length - 1);
      snapshotRangeEl.max = String(max);
      snapshotRangeEl.disabled = state.snapshots.length === 0;
      snapshotPrevEl.disabled = state.snapshots.length === 0;
      snapshotNextEl.disabled = state.snapshots.length === 0;
      const selectedIndex = state.selectedSnapshotId ? snapshotIndexById(state.selectedSnapshotId) : -1;
      snapshotRangeEl.value = String(selectedIndex >= 0 ? selectedIndex : max);
      snapshotPlayEl.textContent = state.playbackTimer ? "Pause" : "Play";
      if (selectedIndex >= 0) {
        const snapshot = state.snapshots[selectedIndex];
        snapshotStatusEl.textContent = (selectedIndex + 1) + "/" + state.snapshots.length + " " + formatTime(snapshot.ts) + " · " + snapshot.title;
      } else {
        snapshotStatusEl.textContent = state.snapshots.length ? "Live · " + state.snapshots.length + " snapshots" : "Live";
      }
    }

    function stopPlayback() {
      if (!state.playbackTimer) return;
      clearInterval(state.playbackTimer);
      state.playbackTimer = null;
      syncReplayControls();
    }

    function returnToLive() {
      stopPlayback();
      state.selectedTimelineId = "live";
      state.selectedSnapshotId = null;
      state.selectedWorld = null;
      if (state.world) {
        renderHud(state.world);
        draw();
      }
      syncReplayControls();
    }

    function selectSnapshot(index) {
      if (!state.snapshots.length) {
        returnToLive();
        return;
      }
      const bounded = Math.max(0, Math.min(state.snapshots.length - 1, index));
      const snapshot = state.snapshots[bounded];
      state.selectedTimelineId = snapshot.id;
      state.selectedSnapshotId = snapshot.id;
      state.selectedWorld = snapshot.world;
      renderHud(snapshot.world);
      draw();
      syncReplayControls();
    }

    function stepSnapshot(delta) {
      if (!state.snapshots.length) return;
      const selectedIndex = state.selectedSnapshotId ? snapshotIndexById(state.selectedSnapshotId) : state.snapshots.length - 1;
      const nextIndex = selectedIndex + delta;
      if (nextIndex >= state.snapshots.length) {
        returnToLive();
        return;
      }
      selectSnapshot(nextIndex < 0 ? 0 : nextIndex);
    }

    function togglePlayback() {
      if (state.playbackTimer) {
        stopPlayback();
        return;
      }
      if (!state.snapshots.length) return;
      let index = state.selectedSnapshotId ? snapshotIndexById(state.selectedSnapshotId) : 0;
      if (index < 0 || index >= state.snapshots.length - 1) index = 0;
      selectSnapshot(index);
      state.playbackTimer = setInterval(() => {
        const selectedIndex = state.selectedSnapshotId ? snapshotIndexById(state.selectedSnapshotId) : -1;
        const nextIndex = selectedIndex + 1;
        if (nextIndex >= state.snapshots.length) {
          returnToLive();
          return;
        }
        selectSnapshot(nextIndex);
      }, 850);
      syncReplayControls();
    }

    function buildTimelineEntries(world) {
      const logEntries = (world.logs || [])
        .map((entry, index) => timelineEntryFromLog(entry, index))
        .filter(Boolean);
      const snapshotEntries = state.snapshots.slice(-12).map((snapshot) => ({
        id: snapshot.id,
        ts: snapshot.ts,
        title: snapshot.title,
        note: snapshot.note,
        detail: snapshot.note,
        kind: "snapshot",
        world: snapshot.world
      }));
      const byKey = new Map();
      for (const entry of logEntries.concat(snapshotEntries)) {
        const key = entry.title + "|" + entry.note + "|" + Math.floor(new Date(entry.ts).getTime() / 5000);
        byKey.set(key, entry);
      }
      return Array.from(byKey.values())
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
        .slice(0, 18);
    }

    function timelineEntryFromLog(entry, index) {
      const data = entry.data || {};
      const dataText = JSON.stringify(data);
      const text = entry.message + " " + dataText;
      const important = /bot started|bot completed|stopped|state changed|buy|sell|quest|boss|elite|judge|death|dead|recover|level|heal|stuck|bail|fireball|win/i.test(text);
      if (!important) return undefined;
      let title = entry.message;
      if (entry.message === "state changed") {
        title = (data.map || "state") + " · L" + (data.level || "?");
      }
      const noteParts = [];
      if (data.hp) noteParts.push("HP " + data.hp);
      if (data.mana) noteParts.push("Mana " + data.mana);
      if (data.xp) noteParts.push("XP " + data.xp);
      if (data.gold !== undefined) noteParts.push(data.gold + "g");
      if (data.targetHp) noteParts.push("Target " + data.targetHp);
      if (data.target) noteParts.push(String(data.target).slice(0, 90));
      if (data.from || data.to) noteParts.push(String(data.from || "") + " -> " + String(data.to || ""));
      return {
        id: "log-" + index + "-" + new Date(entry.ts).getTime(),
        ts: entry.ts,
        title,
        note: noteParts.join(" · ") || dataText.slice(0, 150),
        detail: "[" + entry.level + "] " + entry.message + (dataText && dataText !== "{}" ? " " + dataText : ""),
        kind: "log"
      };
    }

    function renderTimeline(world) {
      const entries = buildTimelineEntries(world);
      if (state.selectedTimelineId === "live" && entries[0]) {
        timelineDetailEl.textContent = entries[0].detail || entries[0].note || entries[0].title;
      }
      timelineEl.innerHTML = entries.map((entry) => {
        return "<li><button type=\"button\" data-timeline-id=\"" + escapeHtml(entry.id) + "\" class=\"" +
          (state.selectedTimelineId === entry.id ? "selected" : "") + "\"><span class=\"timeline-time\">" +
          escapeHtml(formatTime(entry.ts)) + "</span><span class=\"timeline-title\">" + escapeHtml(entry.title) +
          "</span><span class=\"timeline-note\">" + escapeHtml(entry.note || "") + "</span></button></li>";
      }).join("");
      timelineEl.__entries = entries;
    }

    function formatTime(ts) {
      const date = new Date(ts);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    function renderHud(world) {
      const stats = world.stats || {};
      const bot = world.bot || {};
      const grid = world.grid || {};
      const progression = world.progression || {};
      const recentAction = progression.recentAction || bot.lastAction;
      titleEl.textContent = world.mapName || "TUICraft World";
      frameEl.textContent = world.frame !== undefined ? "frame " + world.frame : "";
      objectiveEl.textContent = world.objective || "Observing live run";
      liveStatusEl.textContent = (state.selectedWorld ? "snapshot · " : state.eventConnected ? "event live · " : "") +
        (bot.status ? "bot " + bot.status : "session live");
      liveDotEl.classList.toggle("live", bot.status === "running");
      renderProgression(world);
      metersEl.innerHTML = [
        meter("HP", stats.hp, ""),
        meter("Mana", stats.mana, "mana"),
        meter("XP", stats.xp, "xp")
      ].join("");
      characterEl.innerHTML = pairRows([
        ["name", stats.name || bot.characterName || ""],
        ["class", stats.className || bot.characterClass || ""],
        ["level", stats.level || ""],
        ["gold", stats.gold !== undefined ? stats.gold + "g" : ""],
        ["weapon", stats.weapon || ""],
        ["armor", stats.armor || ""],
        ["quest", stats.quest || ""],
        ["target", stats.target || ""]
      ]);
      runEl.innerHTML = pairRows([
        ["phase", progression.phase || phaseLabel(world)],
        ["intent", recentAction ? "#" + recentAction.count + " " + recentAction.label : ""],
        ["mode", bot.mode || ""],
        ["actions", bot.actionCount || 0],
        ["judge", bot.judge ? bot.judge.calls + "/" + bot.judge.maxCalls : ""],
        ["chat", bot.chat ? bot.chat.messages + "/" + bot.chat.maxMessages : ""],
        ["seed", bot.worldSeed || ""],
        ["updated", world.ts ? new Date(world.ts).toLocaleTimeString() : ""]
      ]);
      mapEl.innerHTML = pairRows([
        ["tiles", grid.width && grid.height ? grid.width + " x " + grid.height : ""],
        ["player", coordLabel(findEntity("player"))],
        ["mobs", countKind("mob")],
        ["bosses", countKind("boss")],
        ["doors", countKind("dungeon")]
      ]);
      renderRoute(world);
      logEl.innerHTML = (world.logs || []).slice(-10).reverse().map((entry) => {
        const data = entry.data ? " " + JSON.stringify(entry.data) : "";
        return "<li>[" + escapeHtml(entry.level) + "] " + escapeHtml(entry.message + data) + "</li>";
      }).join("");
    }

    function coordLabel(entity) {
      return entity ? entity.x + "," + entity.y : "";
    }

    function countKind(kind) {
      const world = displayWorld() || {};
      return (world.entities || []).filter((entity) => entity.kind === kind).length;
    }

    function findEntity(kind, world = displayWorld()) {
      world = world || {};
      return (world.entities || []).find((entity) => entity.kind === kind);
    }

    function nearestEntity(kinds, world, origin) {
      const wanted = new Set(kinds);
      const entities = (world.entities || []).filter((entity) => wanted.has(entity.kind));
      if (!entities.length) return null;
      if (!origin) return entities[0];
      return entities
        .map((entity) => ({ entity, distance: Math.abs(entity.x - origin.x) + Math.abs(entity.y - origin.y) }))
        .sort((a, b) => a.distance - b.distance)[0].entity;
    }

    function inferFocusMode(world) {
      const stats = world.stats || {};
      const bot = world.bot || {};
      const progression = world.progression || {};
      const recentAction = ((progression.recentAction || bot.lastAction || {}).label || "");
      const text = [world.objective || "", progression.phase || "", recentAction].join(" ");
      if (stats.target) return /Boss|Shadow Overlord/i.test(stats.target) ? "boss" : "target";
      if (/buy|sell|merchant|economy/i.test(text)) return "merchant";
      if (/heal|recover|rest|inn/i.test(text)) return "inn";
      if (/turn in|reward|quest board/i.test(text)) return "quest";
      if (/Boss|Shadow Overlord|boss route|boss approach/i.test(text)) return "boss";
      if (/Town|Abbey/i.test(world.mapName || "")) return "dungeon";
      if ((world.entities || []).some((entity) => entity.kind === "boss")) return "boss";
      if ((world.entities || []).some((entity) => entity.kind === "chest")) return "chest";
      return "mob";
    }

    function titleCase(value) {
      return String(value || "").slice(0, 1).toUpperCase() + String(value || "").slice(1);
    }

    function routeTargetMode(entity) {
      if (!entity) return "onto";
      if (["merchant", "quest", "inn", "mob", "boss", "chest"].includes(entity.kind)) return "adjacent";
      return "onto";
    }

    function routeTargetForFocus(mode, world, player) {
      if (mode === "auto") {
        const candidates = [inferFocusMode(world), "dungeon", "portal", "boss", "mob", "chest", "merchant", "quest", "inn"];
        const seen = new Set();
        for (const candidate of candidates) {
          if (seen.has(candidate)) continue;
          seen.add(candidate);
          const target = routeTargetForFocus(candidate, world, player);
          if (target) {
            target.source = "Auto " + target.source;
            return target;
          }
        }
        return null;
      }
      if (mode === "target") {
        const targetText = (world.stats || {}).target || "";
        if (/Boss|Shadow Overlord/i.test(targetText)) mode = "boss";
        else mode = "mob";
      }
      const kindSets = {
        boss: ["boss"],
        dungeon: ["dungeon"],
        portal: ["portal"],
        mob: ["mob"],
        chest: ["chest"],
        merchant: ["merchant"],
        quest: ["quest"],
        inn: ["inn"]
      };
      const entity = nearestEntity(kindSets[mode] || [], world, player);
      if (!entity) return null;
      return {
        x: entity.x,
        y: entity.y,
        label: entity.label || titleCase(mode),
        kind: entity.kind,
        marker: entity.marker,
        mode: routeTargetMode(entity),
        source: titleCase(mode)
      };
    }

    function routeTargetForWorld(world) {
      const player = findEntity("player", world);
      if (state.selectedTile && state.selectedTile.mapName === world.mapName) {
        const entity = (world.entities || []).find((candidate) => candidate.x === state.selectedTile.x && candidate.y === state.selectedTile.y);
        return {
          x: state.selectedTile.x,
          y: state.selectedTile.y,
          label: entity ? entity.label : "Pinned tile",
          kind: entity ? entity.kind : "tile",
          marker: entity ? entity.marker : "",
          mode: entity ? routeTargetMode(entity) : "onto",
          source: "Pinned"
        };
      }
      return routeTargetForFocus(focusEl.value || "auto", world, player);
    }

    function routeKey(point) {
      return point.x + "," + point.y;
    }

    function pointFromKey(key) {
      const parts = key.split(",");
      return { x: Number(parts[0]), y: Number(parts[1]) };
    }

    function isWallChar(ch) {
      return ch === "█" || ch === "#";
    }

    function entityAt(world, x, y) {
      return (world.entities || []).find((entity) => entity.x === x && entity.y === y);
    }

    function isRouteWalkable(world, x, y, target, allowTarget) {
      if (!world.grid || x < 0 || y < 0 || x >= world.grid.width || y >= world.grid.height) return false;
      const ch = (world.grid.rows[y] || "")[x] || " ";
      if (isWallChar(ch)) return false;
      const entity = entityAt(world, x, y);
      if (!entity || entity.kind === "player") return true;
      return Boolean(allowTarget && target && x === target.x && y === target.y);
    }

    function targetCellsForRoute(world, target) {
      if (!target) return [];
      if (target.mode === "onto" && isRouteWalkable(world, target.x, target.y, target, true)) {
        return [{ x: target.x, y: target.y }];
      }
      return [
        { x: target.x + 1, y: target.y },
        { x: target.x - 1, y: target.y },
        { x: target.x, y: target.y + 1 },
        { x: target.x, y: target.y - 1 }
      ].filter((point) => isRouteWalkable(world, point.x, point.y, target, false));
    }

    function directionLabel(from, to) {
      if (!from || !to) return "";
      if (to.x > from.x) return "E";
      if (to.x < from.x) return "W";
      if (to.y > from.y) return "S";
      if (to.y < from.y) return "N";
      return "hold";
    }

    function computeRoutePlan(world) {
      if (!world || !world.grid || !world.grid.rows || !world.grid.rows.length) return null;
      const player = findEntity("player", world);
      const target = routeTargetForWorld(world);
      if (!player || !target) {
        return { target, path: [], distance: undefined, next: "", status: "none" };
      }
      const targetCells = targetCellsForRoute(world, target);
      if (!targetCells.length) {
        return { target, path: [], distance: undefined, next: "", status: "blocked" };
      }
      const targetKeys = new Set(targetCells.map(routeKey));
      const startKey = routeKey(player);
      const queue = [player];
      const seen = new Set([startKey]);
      const cameFrom = new Map();
      let foundKey = targetKeys.has(startKey) ? startKey : "";
      for (let index = 0; index < queue.length && !foundKey; index += 1) {
        const current = queue[index];
        const neighbors = [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 }
        ];
        for (const next of neighbors) {
          const key = routeKey(next);
          if (seen.has(key)) continue;
          if (!isRouteWalkable(world, next.x, next.y, target, target.mode === "onto")) continue;
          seen.add(key);
          cameFrom.set(key, routeKey(current));
          if (targetKeys.has(key)) {
            foundKey = key;
            break;
          }
          queue.push(next);
        }
      }
      if (!foundKey) {
        return { target, path: [], distance: undefined, next: "", status: "blocked" };
      }
      const path = [];
      for (let cursor = foundKey; cursor; cursor = cameFrom.get(cursor)) {
        path.push(pointFromKey(cursor));
        if (cursor === startKey) break;
      }
      path.reverse();
      return {
        target,
        path,
        distance: Math.max(0, path.length - 1),
        next: directionLabel(path[0], path[1]),
        status: "routable"
      };
    }

    function renderRoute(world, plan = computeRoutePlan(world)) {
      state.routePlan = plan;
      if (!plan || !plan.target) {
        routeEl.innerHTML = pairRows([
          ["focus", focusEl.value || "auto"],
          ["target", ""],
          ["range", ""],
          ["next", ""],
          ["status", "none"]
        ]);
        return;
      }
      routeEl.innerHTML = pairRows([
        ["focus", plan.target.source || focusEl.value || "auto"],
        ["target", plan.target.label + " " + plan.target.x + "," + plan.target.y],
        ["range", plan.distance !== undefined ? plan.distance + " tiles" : ""],
        ["next", plan.next || ""],
        ["mode", plan.target.mode],
        ["status", plan.status]
      ]);
    }

    function updateTrail(world) {
      const player = (world.entities || []).find((entity) => entity.kind === "player");
      if (!player) return;
      const last = state.trail[state.trail.length - 1];
      const sameMap = !last || last.mapName === world.mapName;
      const changed = !last || last.x !== player.x || last.y !== player.y || last.mapName !== world.mapName;
      if (!sameMap) state.trail = [];
      if (changed) {
        const recentAction = ((world.progression || {}).recentAction || (world.bot || {}).lastAction || {}).label || "";
        if (sameMap && last) {
          state.playerTween = {
            from: { x: last.x, y: last.y },
            to: { x: player.x, y: player.y },
            mapName: world.mapName,
            startedAt: performance.now(),
            duration: 420,
            action: recentAction
          };
          ensureAnimationLoop();
        } else {
          state.playerTween = null;
        }
        state.trail.push({ x: player.x, y: player.y, mapName: world.mapName, ts: Date.now(), action: recentAction });
        state.trail = state.trail.slice(-48);
      }
    }

    function resizeCanvas() {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(240, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function draw() {
      const world = displayWorld();
      const rect = wrap.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(240, rect.height);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, width, height);
      if (!world || !world.grid || !world.grid.rows || !world.grid.rows.length) {
        drawCenteredText(width, height, "Waiting for map");
        return;
      }

      const rows = world.grid.rows;
      const cols = world.grid.width;
      const rowCount = world.grid.height;
      const zoom = Number(zoomEl.value) || 1;
      const baseCell = Math.max(6, Math.floor(Math.min((width - 36) / Math.max(1, cols), (height - 36) / Math.max(1, rowCount))));
      const cell = Math.max(6, baseCell * zoom);
      const player = findEntity("player", world);
      let offsetX = Math.floor((width - cols * cell) / 2);
      let offsetY = Math.floor((height - rowCount * cell) / 2);
      if (followEl.checked && player) {
        offsetX = Math.floor(width / 2 - (player.x + 0.5) * cell);
        offsetY = Math.floor(height / 2 - (player.y + 0.5) * cell);
      }
      state.geometry = { cell, offsetX, offsetY };

      for (let y = 0; y < rows.length; y += 1) {
        const row = rows[y];
        for (let x = 0; x < cols; x += 1) {
          const ch = row[x] || " ";
          drawTile(ch, x, y, cell, offsetX, offsetY);
        }
      }
      if (threatsEl.checked) {
        drawThreatFields(world, cell, offsetX, offsetY);
      }
      drawTrail(cell, offsetX, offsetY);
      if (agentsEl.checked) {
        drawAgentGhosts(world, cell, offsetX, offsetY);
      }
      state.routePlan = computeRoutePlan(world);
      drawRoute(state.routePlan, cell, offsetX, offsetY);
      for (const entity of world.entities || []) {
        drawEntity(entity, cell, offsetX, offsetY);
      }
      drawPinnedTile(cell, offsetX, offsetY, world);
      if (state.hoverTile) {
        ctx.strokeStyle = "rgba(238, 243, 246, 0.75)";
        ctx.lineWidth = 2;
        ctx.strokeRect(offsetX + state.hoverTile.x * cell + 1, offsetY + state.hoverTile.y * cell + 1, cell - 2, cell - 2);
      }
    }

    function drawCenteredText(width, height, text) {
      ctx.fillStyle = colors.muted;
      ctx.font = "14px SFMono-Regular, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, width / 2, height / 2);
    }

    function drawTile(ch, x, y, cell, offsetX, offsetY) {
      const px = offsetX + x * cell;
      const py = offsetY + y * cell;
      if (px > canvas.clientWidth || py > canvas.clientHeight || px + cell < 0 || py + cell < 0) return;
      if (ch === "█" || ch === "#") {
        ctx.fillStyle = colors.wall;
        ctx.fillRect(px, py, cell, cell);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(px + 1, py + 1, Math.max(1, cell - 2), 1);
        return;
      }
      ctx.fillStyle = ch === " " ? "#090d11" : colors.floor;
      ctx.fillRect(px, py, cell, cell);
      if ((ch === "." || ch === "·") && cell >= 9) {
        ctx.fillStyle = colors.floorDot;
        ctx.fillRect(px + cell / 2 - 1, py + cell / 2 - 1, 2, 2);
      }
      if (cell >= 12) {
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cell, cell);
      }
    }

    function drawTrail(cell, offsetX, offsetY) {
      if (state.selectedWorld) return;
      if (state.trail.length < 2) return;
      ctx.beginPath();
      state.trail.forEach((point, index) => {
        const px = offsetX + (point.x + 0.5) * cell;
        const py = offsetY + (point.y + 0.5) * cell;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = colors.path;
      ctx.lineWidth = Math.max(2, Math.min(5, cell * 0.16));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    function drawThreatFields(world, cell, offsetX, offsetY) {
      ctx.save();
      for (const entity of world.entities || []) {
        if (entity.kind !== "mob" && entity.kind !== "boss") continue;
        const cx = offsetX + (entity.x + 0.5) * cell;
        const cy = offsetY + (entity.y + 0.5) * cell;
        const radius = cell * (entity.kind === "boss" ? 2.15 : 1.25);
        ctx.fillStyle = entity.kind === "boss" ? colors.threatBoss : colors.threatMob;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = entity.kind === "boss" ? "rgba(176, 131, 255, 0.42)" : "rgba(236, 109, 95, 0.34)";
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawAgentGhosts(world, cell, offsetX, offsetY) {
      if (state.selectedWorld) return;
      const ghosts = state.snapshots
        .slice(-12)
        .map((snapshot) => snapshot.world)
        .filter((snapshotWorld) => snapshotWorld && snapshotWorld.mapName === world.mapName)
        .map((snapshotWorld) => findEntity("player", snapshotWorld))
        .filter(Boolean);
      ctx.save();
      ghosts.forEach((point, index) => {
        const alpha = Math.max(0.08, (index + 1) / Math.max(1, ghosts.length) * 0.32);
        const cx = offsetX + (point.x + 0.5) * cell;
        const cy = offsetY + (point.y + 0.5) * cell;
        ctx.strokeStyle = "rgba(66, 198, 255, " + alpha.toFixed(3) + ")";
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(3, cell * (0.18 + index / 90)), 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }

    function drawRoute(plan, cell, offsetX, offsetY) {
      if (!plan || !plan.target) return;
      const targetCx = offsetX + (plan.target.x + 0.5) * cell;
      const targetCy = offsetY + (plan.target.y + 0.5) * cell;
      ctx.save();
      if (plan.path && plan.path.length > 1) {
        ctx.beginPath();
        plan.path.forEach((point, index) => {
          const px = offsetX + (point.x + 0.5) * cell;
          const py = offsetY + (point.y + 0.5) * cell;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = colors.routeGlow;
        ctx.lineWidth = Math.max(7, cell * 0.5);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        const dash = Math.max(3, cell * 0.32);
        const gap = Math.max(3, cell * 0.24);
        ctx.strokeStyle = colors.route;
        ctx.lineWidth = Math.max(2, cell * 0.16);
        ctx.setLineDash([dash, gap]);
        ctx.lineDashOffset = -((performance.now() / 140) % (dash + gap));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        for (const point of plan.path.slice(1, -1)) {
          const px = offsetX + (point.x + 0.5) * cell;
          const py = offsetY + (point.y + 0.5) * cell;
          ctx.fillStyle = colors.route;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(2, cell * 0.12), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = plan.status === "routable" ? colors.route : colors.red;
      ctx.lineWidth = Math.max(2, cell * 0.16);
      ctx.beginPath();
      ctx.arc(targetCx, targetCy, Math.max(7, cell * 0.56), 0, Math.PI * 2);
      ctx.stroke();
      if (agentsEl.checked && plan.path && plan.path.length > 1) {
        drawIntentArrow(plan.path[0], plan.path[1], cell, offsetX, offsetY);
      }
      ctx.restore();
    }

    function drawIntentArrow(from, to, cell, offsetX, offsetY) {
      const startX = offsetX + (from.x + 0.5) * cell;
      const startY = offsetY + (from.y + 0.5) * cell;
      const endX = offsetX + (to.x + 0.5) * cell;
      const endY = offsetY + (to.y + 0.5) * cell;
      const angle = Math.atan2(endY - startY, endX - startX);
      const tipX = startX + Math.cos(angle) * cell * 0.45;
      const tipY = startY + Math.sin(angle) * cell * 0.45;
      ctx.save();
      ctx.strokeStyle = colors.cyan;
      ctx.fillStyle = colors.cyan;
      ctx.lineWidth = Math.max(2, cell * 0.13);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - Math.cos(angle - Math.PI / 6) * cell * 0.22,
        tipY - Math.sin(angle - Math.PI / 6) * cell * 0.22
      );
      ctx.lineTo(
        tipX - Math.cos(angle + Math.PI / 6) * cell * 0.22,
        tipY - Math.sin(angle + Math.PI / 6) * cell * 0.22
      );
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawPinnedTile(cell, offsetX, offsetY, world) {
      if (!state.selectedTile || state.selectedTile.mapName !== world.mapName) return;
      const px = offsetX + state.selectedTile.x * cell;
      const py = offsetY + state.selectedTile.y * cell;
      ctx.strokeStyle = colors.cyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);
    }

    function drawEntity(entity, cell, offsetX, offsetY) {
      const position = animatedEntityPosition(entity);
      const cx = offsetX + (position.x + 0.5) * cell;
      const cy = offsetY + (position.y + 0.5) * cell;
      const radius = Math.max(4, cell * 0.36);
      const color = entityColor(entity.kind);
      if (entity.kind === "player") {
        ctx.fillStyle = colors.playerGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.75, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      if (entity.kind === "boss") {
        ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
      } else {
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = entity.kind === "boss" ? "#100818" : "#071016";
      ctx.font = Math.max(10, Math.floor(cell * 0.58)) + "px SFMono-Regular, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(entity.marker, cx, cy + 0.5);
      if (labelsEl.checked && cell >= 14 && entity.label) {
        ctx.fillStyle = colors.text;
        ctx.font = "11px SFMono-Regular, Consolas, monospace";
        ctx.textBaseline = "bottom";
        ctx.fillText(entity.label, cx, cy - radius - 3);
      }
    }

    function animatedEntityPosition(entity) {
      if (entity.kind !== "player" || state.selectedWorld || !agentsEl.checked || !state.playerTween) {
        return entity;
      }
      const tween = state.playerTween;
      if (tween.mapName !== (displayWorld() || {}).mapName) return entity;
      const elapsed = performance.now() - tween.startedAt;
      const raw = clamp(elapsed / tween.duration, 0, 1);
      const eased = raw * raw * (3 - 2 * raw);
      if (raw >= 1) return entity;
      return {
        ...entity,
        x: tween.from.x + (tween.to.x - tween.from.x) * eased,
        y: tween.from.y + (tween.to.y - tween.from.y) * eased
      };
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function hasActiveAnimation() {
      if (!state.playerTween || state.selectedWorld) return false;
      return performance.now() - state.playerTween.startedAt < state.playerTween.duration;
    }

    function ensureAnimationLoop() {
      if (state.animationFrame) return;
      const tick = () => {
        state.animationFrame = null;
        draw();
        if (hasActiveAnimation()) {
          state.animationFrame = requestAnimationFrame(tick);
        }
      };
      state.animationFrame = requestAnimationFrame(tick);
    }

    function entityColor(kind) {
      if (kind === "player") return colors.player;
      if (kind === "mob") return colors.mob;
      if (kind === "boss") return colors.boss;
      if (kind === "chest") return colors.chest;
      return colors.town;
    }

    function tileFromPointer(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const g = state.geometry;
      return {
        x: Math.floor((x - g.offsetX) / g.cell),
        y: Math.floor((y - g.offsetY) / g.cell)
      };
    }

    function tileInfo(tile) {
      const world = displayWorld();
      if (!world || !world.grid) return "Waiting for world state";
      if (tile.x < 0 || tile.y < 0 || tile.x >= world.grid.width || tile.y >= world.grid.height) {
        return "Outside map";
      }
      const ch = (world.grid.rows[tile.y] || "")[tile.x] || " ";
      const entity = (world.entities || []).find((candidate) => candidate.x === tile.x && candidate.y === tile.y);
      if (entity) return entity.label + " " + tile.x + "," + tile.y;
      if (ch === "█" || ch === "#") return "Wall " + tile.x + "," + tile.y;
      if (ch === "." || ch === "·") return "Floor " + tile.x + "," + tile.y;
      return "Tile '" + ch + "' " + tile.x + "," + tile.y;
    }

    async function sendInput(key) {
      if (!manualEl.checked) {
        hoverEl.textContent = "Enable manual input before sending keys";
        return;
      }
      await fetch("/api/input", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key })
      });
      hoverEl.textContent = "sent " + key;
    }

    async function clickStep(tile) {
      if (state.selectedWorld) {
        hoverEl.textContent = "Return to Live before sending manual input";
        return;
      }
      const player = findEntity("player");
      if (!player) return;
      const dx = tile.x - player.x;
      const dy = tile.y - player.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        await sendInput(dx > 0 ? "d" : "a");
      } else if (dy !== 0) {
        await sendInput(dy > 0 ? "s" : "w");
      }
    }

    async function refresh() {
      try {
        state.refreshPending = false;
        const response = await fetch("/api/world?limit=240", { cache: "no-store" });
        const world = await response.json();
        state.world = world;
        recordSnapshot(world);
        updateTrail(world);
        if (state.selectedWorld) {
          renderTimeline(world);
        } else {
          renderHud(world);
        }
        draw();
      } catch (error) {
        state.refreshPending = false;
        liveDotEl.classList.remove("live");
        liveStatusEl.textContent = "disconnected";
        hoverEl.textContent = String(error);
      }
    }

    function scheduleRefresh() {
      if (state.refreshPending) return;
      state.refreshPending = true;
      setTimeout(refresh, 80);
    }

    function connectEvents() {
      if (!window.EventSource) return;
      const source = new EventSource("/api/events");
      source.addEventListener("open", () => {
        state.eventConnected = true;
        if (state.world) renderHud(state.world);
      });
      source.addEventListener("error", () => {
        state.eventConnected = false;
        if (state.world) renderHud(state.world);
      });
      for (const type of ["screen", "bot_action", "bot_log", "bot_status", "status"]) {
        source.addEventListener(type, scheduleRefresh);
      }
    }

    canvas.addEventListener("mousemove", (event) => {
      const tile = tileFromPointer(event);
      state.hoverTile = tile;
      hoverEl.textContent = tileInfo(tile);
      draw();
    });
    canvas.addEventListener("mouseleave", () => {
      state.hoverTile = null;
      draw();
    });
    canvas.addEventListener("click", (event) => {
      const tile = tileFromPointer(event);
      if (manualEl.checked) {
        void clickStep(tile);
        return;
      }
      const world = displayWorld();
      state.selectedTile = world ? { x: tile.x, y: tile.y, mapName: world.mapName } : null;
      if (world) renderRoute(world);
      draw();
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-key]");
      if (button) void sendInput(button.dataset.key);
    });
    timelineEl.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-timeline-id]");
      if (!button) return;
      const entries = timelineEl.__entries || [];
      const entry = entries.find((candidate) => candidate.id === button.dataset.timelineId);
      state.selectedTimelineId = button.dataset.timelineId || "live";
      timelineDetailEl.textContent = entry ? entry.detail || entry.note || entry.title : "";
      state.selectedWorld = entry && entry.kind === "snapshot" && entry.world ? entry.world : null;
      state.selectedSnapshotId = state.selectedWorld ? entry.id : null;
      if (state.selectedWorld) {
        renderHud(state.selectedWorld);
      } else if (state.world) {
        renderHud(state.world);
      }
      syncReplayControls();
      draw();
    });
    timelineLiveEl.addEventListener("click", returnToLive);
    clearTrailEl.addEventListener("click", () => {
      state.trail = [];
      draw();
    });
    snapshotRangeEl.addEventListener("input", () => {
      stopPlayback();
      selectSnapshot(Number(snapshotRangeEl.value) || 0);
    });
    snapshotPrevEl.addEventListener("click", () => stepSnapshot(-1));
    snapshotNextEl.addEventListener("click", () => stepSnapshot(1));
    snapshotPlayEl.addEventListener("click", togglePlayback);
    focusEl.addEventListener("input", () => {
      state.selectedTile = null;
      const world = displayWorld();
      if (world) renderRoute(world);
      draw();
    });
    manualEl.addEventListener("input", () => {
      if (manualEl.checked) state.selectedTile = null;
      const world = displayWorld();
      if (world) renderRoute(world);
      draw();
    });
    for (const element of [followEl, labelsEl, agentsEl, threatsEl, zoomEl]) {
      element.addEventListener("input", draw);
    }
    new ResizeObserver(resizeCanvas).observe(wrap);
    connectEvents();
    syncReplayControls();
    setInterval(refresh, 1500);
    refresh();
  </script>
</body>
</html>`;
