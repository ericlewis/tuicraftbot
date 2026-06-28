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
    button, input {
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
    @media (max-width: 940px) {
      .shell { grid-template-columns: 1fr; }
      .stage { min-height: 62vh; border-right: 0; border-bottom: 1px solid var(--line); }
      aside { max-height: none; }
      header { align-items: flex-start; flex-direction: column; }
      .tools { justify-content: flex-start; }
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
          <label class="check"><input id="follow" type="checkbox" checked>Follow</label>
          <label class="check"><input id="labels" type="checkbox" checked>Labels</label>
          <label class="check"><input id="manual" type="checkbox">Manual input</label>
          <label class="check">Zoom <input id="zoom" type="range" min="1" max="3" value="1" step="0.25"></label>
        </div>
      </header>
      <div class="world-wrap" id="wrap">
        <canvas id="world"></canvas>
        <div id="hover" class="hover">Waiting for world state</div>
      </div>
    </div>
    <aside>
      <section>
        <div class="status-line"><span id="live-dot" class="dot"></span><span id="live-status">connecting</span></div>
        <div id="objective" class="objective">Reading live state</div>
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
    const metersEl = document.getElementById("meters");
    const characterEl = document.getElementById("character");
    const runEl = document.getElementById("run");
    const mapEl = document.getElementById("map");
    const logEl = document.getElementById("log");
    const followEl = document.getElementById("follow");
    const labelsEl = document.getElementById("labels");
    const manualEl = document.getElementById("manual");
    const zoomEl = document.getElementById("zoom");

    const state = {
      world: null,
      trail: [],
      hoverTile: null,
      geometry: { cell: 12, offsetX: 0, offsetY: 0 },
      lastFrame: -1
    };

    const colors = {
      bg: "#07090c",
      floor: "#111b16",
      floorDot: "#274433",
      wall: "#646d78",
      grid: "rgba(80, 100, 120, 0.18)",
      player: "#42c6ff",
      playerGlow: "rgba(66, 198, 255, 0.28)",
      mob: "#ec6d5f",
      boss: "#b083ff",
      town: "#e7b45e",
      chest: "#d3924b",
      text: "#eef3f6",
      muted: "#9aa8b5",
      path: "rgba(66, 198, 255, 0.48)"
    };

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

    function renderHud(world) {
      const stats = world.stats || {};
      const bot = world.bot || {};
      const grid = world.grid || {};
      titleEl.textContent = world.mapName || "TUICraft World";
      frameEl.textContent = world.frame !== undefined ? "frame " + world.frame : "";
      objectiveEl.textContent = world.objective || "Observing live run";
      liveStatusEl.textContent = bot.status ? "bot " + bot.status : "session live";
      liveDotEl.classList.toggle("live", bot.status === "running");
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
      logEl.innerHTML = (world.logs || []).slice(-10).reverse().map((entry) => {
        const data = entry.data ? " " + JSON.stringify(entry.data) : "";
        return "<li>[" + escapeHtml(entry.level) + "] " + escapeHtml(entry.message + data) + "</li>";
      }).join("");
    }

    function coordLabel(entity) {
      return entity ? entity.x + "," + entity.y : "";
    }

    function countKind(kind) {
      const world = state.world || {};
      return (world.entities || []).filter((entity) => entity.kind === kind).length;
    }

    function findEntity(kind) {
      const world = state.world || {};
      return (world.entities || []).find((entity) => entity.kind === kind);
    }

    function updateTrail(world) {
      const player = (world.entities || []).find((entity) => entity.kind === "player");
      if (!player) return;
      const last = state.trail[state.trail.length - 1];
      const sameMap = !last || last.mapName === world.mapName;
      const changed = !last || last.x !== player.x || last.y !== player.y || last.mapName !== world.mapName;
      if (!sameMap) state.trail = [];
      if (changed) {
        state.trail.push({ x: player.x, y: player.y, mapName: world.mapName, ts: Date.now() });
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
      const world = state.world;
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
      const player = findEntity("player");
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
      drawTrail(cell, offsetX, offsetY);
      for (const entity of world.entities || []) {
        drawEntity(entity, cell, offsetX, offsetY);
      }
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

    function drawEntity(entity, cell, offsetX, offsetY) {
      const cx = offsetX + (entity.x + 0.5) * cell;
      const cy = offsetY + (entity.y + 0.5) * cell;
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
      const world = state.world;
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
        const response = await fetch("/api/world", { cache: "no-store" });
        const world = await response.json();
        state.world = world;
        updateTrail(world);
        renderHud(world);
        draw();
      } catch (error) {
        liveDotEl.classList.remove("live");
        liveStatusEl.textContent = "disconnected";
        hoverEl.textContent = String(error);
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
      void clickStep(tile);
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-key]");
      if (button) void sendInput(button.dataset.key);
    });
    for (const element of [followEl, labelsEl, zoomEl]) {
      element.addEventListener("input", draw);
    }
    new ResizeObserver(resizeCanvas).observe(wrap);
    setInterval(refresh, 1000);
    refresh();
  </script>
</body>
</html>`;
