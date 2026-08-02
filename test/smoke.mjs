// Drives the caspar-AV module's real source against a fake caspar-avd: a real
// HTTP server for the command endpoints and a real WebSocket pushing Snapshots.
// The cases that matter are the three separate health signals, telemetry being
// absent rather than empty, and the AMCP failure paths (400, and COMMIT PARTIAL).
import http from "node:http";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";

const watchdog = setTimeout(() => {
  console.error("\nTIMED OUT — no completion within 30s.");
  process.exit(2);
}, 30000);
watchdog.unref?.();

const MOD = new URL("../src/", import.meta.url).pathname;
const UpdateActions = (await import(`${MOD}actions.js`)).default;
const UpdateFeedbacks = (await import(`${MOD}feedbacks.js`)).default;
const UpdateVariables = (await import(`${MOD}variables.js`)).default;
const UpdatePresets = (await import(`${MOD}presets.js`)).default;
const { socket } = await import(`${MOD}api.js`);
const { safeId } = await import(`${MOD}main.js`);

const snapshot = {
  health: "connected",
  server: { host: "127.0.0.1", port: 5250, version: "2.5.0" },
  channels: [
    {
      index: 1,
      layers: {
        10: {
          foreground: {
            producer: "ffmpeg",
            paused: false,
            loop: true,
            file: { name: "TESTCLIP", time: [1.28, 8.0] },
          },
        },
        20: { foreground: { producer: "empty" } },
      },
    },
  ],
  media: [{ id: "TESTCLIP", name: "TESTCLIP" }],
  templates: [{ id: "lower-third", name: "lower-third" }],
  fonts: [],
  scanner_up: true,
  show: {
    canvas: { width: 1920, height: 1080 },
    screens: [
      {
        id: "scr-main",
        name: "Main",
        channel: 1,
        layer: 10,
        enabled: true,
        opacity: 1,
      },
      {
        id: "scr-side",
        name: "Side",
        channel: 1,
        layer: 20,
        enabled: false,
        opacity: 1,
      },
    ],
    cues: [
      { id: "cue-open", name: "Opening" },
      { id: "cue-black", name: "Blackout" },
    ],
    pads: [
      { index: 0, cue: "cue-open" },
      { index: 1, cue: "cue-black" },
    ],
    grid: { cols: 4, rows: 2 },
  },
  warnings: [],
  log: [],
};

const calls = [];
const body = (req) =>
  new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const payload =
    req.method === "GET" || req.method === "DELETE"
      ? {}
      : JSON.parse((await body(req)) || "{}");
  calls.push({ method: req.method, path: url.pathname, payload });

  if (url.pathname === "/api/state") return send(200, snapshot);

  if (url.pathname === "/api/command") {
    // Reproduce the two-word trap: MIXER FILL 1-10 is a 400.
    const c = String(payload.command ?? "");
    if (/^MIXER\s+(FILL|OPACITY|CLIP)\s/i.test(c))
      return send(200, { code: 400, status: "ERROR", lines: [c] });
    return send(200, { code: 202, status: "OK", lines: [] });
  }
  if (url.pathname === "/api/batch") {
    const partial = (payload.commands ?? []).some((c) => /BAD/.test(c));
    return send(200, {
      code: 202,
      status: partial ? "COMMIT PARTIAL" : "COMMIT OK",
    });
  }
  if (url.pathname.startsWith("/api/screens/")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = decodeURIComponent(parts[2]);
    if (!snapshot.show.screens.some((s) => s.id === id))
      return send(404, { error: "screen not found" });
    if (req.method === "PATCH") {
      Object.assign(
        snapshot.show.screens.find((s) => s.id === id),
        payload,
      );
      push();
    }
    return send(200, { ok: true });
  }
  if (url.pathname.startsWith("/api/cues/") && url.pathname.endsWith("/fire")) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    if (!snapshot.show.cues.some((c) => c.id === id))
      return send(404, { error: "cue not found" });
    return send(200, { ok: true });
  }
  if (url.pathname === "/api/pads") {
    snapshot.show.pads = payload;
    push();
    return send(200, { ok: true });
  }
  send(200, { ok: true });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

const wss = new WebSocketServer({ server, path: "/ws/ui" });
const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify(snapshot));
  ws.on("close", () => clients.delete(ws));
});
const push = () => {
  for (const ws of clients) ws.send(JSON.stringify(snapshot));
};

// --- the fake instance -----------------------------------------------------
let actions = {};
let feedbacks = {};
let variables = {};
let presetStructure = null;
let presetDefs = null;
const variableValues = {};
let lastError = "";
let lastWarn = "";

const self = {
  config: { host: "127.0.0.1", port: String(PORT) },
  label: "Caspar",
  snapshot: null,
  lastShape: "",
  log: (level, msg) => {
    if (level === "error") lastError = msg;
    if (level === "warn") lastWarn = msg;
  },
  updateStatus: () => {},
  checkFeedbacks: () => {},
  checkAllFeedbacks: () => {},
  setActionDefinitions: (d) => (actions = d),
  setFeedbackDefinitions: (d) => (feedbacks = d),
  setVariableDefinitions: (d) => {
    if (Array.isArray(d)) throw new Error("must be an object");
    variables = d;
  },
  setPresetDefinitions: (s, p) => {
    presetStructure = s;
    presetDefs = p;
  },
  setVariableValues: (v) => Object.assign(variableValues, v),
  parseVariablesInString: async (s) => s,
  show() {
    return this.snapshot?.show ?? {};
  },
  screens() {
    return this.show().screens ?? [];
  },
  cues() {
    return this.show().cues ?? [];
  },
  pads() {
    return this.show().pads ?? [];
  },
  screen(id) {
    return this.screens().find((s) => s.id === String(id ?? "")) ?? null;
  },
  layerState(screenId) {
    const s = this.screen(screenId);
    if (!s) return null;
    const ch = (this.snapshot?.channels ?? []).find(
      (c) => Number(c.index ?? c.channel) === Number(s.channel),
    );
    if (!ch) return null;
    const layers = ch.layers ?? ch.stage?.layers ?? {};
    return Array.isArray(layers)
      ? layers.find((l) => Number(l.index ?? l.layer) === Number(s.layer))
      : layers[String(s.layer)];
  },
  hasTelemetry() {
    return (this.snapshot?.channels ?? []).length > 0;
  },
  rebuild() {
    UpdateActions(this);
    UpdateFeedbacks(this);
    UpdateVariables(this);
    UpdatePresets(this);
    this.refreshVariableValues();
  },
  refreshVariableValues() {
    const values = {
      connection_status:
        socket.ws?.readyState === 1 ? "Connected" : "Disconnected",
      casparcg_health: this.snapshot?.health ?? "unknown",
      scanner_up: this.snapshot?.scanner_up ? "Up" : "Down",
      telemetry: this.hasTelemetry() ? "Receiving" : "None",
      cue_count: this.cues().length,
      screen_count: this.screens().length,
      warning_count: (this.snapshot?.warnings ?? []).length,
      media_count: (this.snapshot?.media ?? []).length,
      template_count: (this.snapshot?.templates ?? []).length,
      server_version: this.snapshot?.server?.version ?? "",
    };
    for (const screen of this.screens()) {
      const p = `screen_${safeId(screen.id)}_`;
      const fg = this.layerState(screen.id)?.foreground ?? {};
      values[`${p}file`] = fg.file?.name ?? "";
      values[`${p}producer`] = fg.producer ?? "";
      values[`${p}position`] = Number(fg.file?.time?.[0] ?? 0).toFixed(2);
      values[`${p}duration`] = Number(fg.file?.time?.[1] ?? 0).toFixed(2);
      values[`${p}paused`] = fg.paused ? "Paused" : "Playing";
      values[`${p}enabled`] = screen.enabled ? "Enabled" : "Disabled";
      values[`${p}name`] = screen.name ?? screen.id;
      values[`${p}channel`] = `${screen.channel}-${screen.layer}`;
      values[`${p}opacity`] = screen.opacity ?? 1;
    }
    this.setVariableValues(values);
  },
  applySnapshot(s) {
    this.snapshot = s;
    this.rebuild();
  },
};

socket.connect(self);
await new Promise((r) => setTimeout(r, 400));

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${label}\n       ${e.message}`);
  }
};
const wait = () => new Promise((r) => setTimeout(r, 150));
const fire = (id, options = {}) => actions[id].callback({ options });
const fb = (id, options = {}) =>
  feedbacks[id].callback(
    { options },
    { parseVariablesInString: async (s) => s },
  );

console.log("\n== connection ==");
await check("the snapshot arrived over /ws/ui", () => {
  assert.equal(self.snapshot?.health, "connected");
  assert.equal(self.screens().length, 2);
});
await check("18 actions, 11 feedbacks", () => {
  assert.equal(Object.keys(actions).length, 18);
  assert.equal(Object.keys(feedbacks).length, 11);
});

console.log("\n== the three health signals are separate ==");
await check("connected / casparcgUp / telemetry all true here", () => {
  assert.equal(fb("connected"), true);
  assert.equal(fb("casparcgUp"), true);
  assert.equal(fb("telemetry"), true);
  assert.equal(fb("scannerUp"), true);
});
await check("no telemetry is distinguishable from CasparCG being down", () => {
  const saved = self.snapshot.channels;
  self.snapshot.channels = [];
  assert.equal(fb("telemetry"), false, "telemetry dark");
  assert.equal(fb("casparcgUp"), true, "but CasparCG is still connected");
  assert.equal(
    fb("screenPlaying", { screen: "scr-main" }),
    false,
    "unknowable reads as not-playing, which is why telemetry has its own light",
  );
  self.snapshot.channels = saved;
});

console.log("\n== telemetry reading ==");
await check("screenPlaying is true for a real producer", () =>
  assert.equal(fb("screenPlaying", { screen: "scr-main" }), true),
);
await check("an 'empty' producer is not playing", () =>
  assert.equal(fb("screenPlaying", { screen: "scr-side" }), false),
);
await check("screenPlayingFile matches file/name", async () => {
  assert.equal(
    await fb("screenPlayingFile", { screen: "scr-main", file: "TESTCLIP" }),
    true,
  );
  assert.equal(
    await fb("screenPlayingFile", { screen: "scr-main", file: "OTHER" }),
    false,
  );
});
await check("screenNearEnd reads file/time as [position, duration]", () => {
  assert.equal(
    fb("screenNearEnd", { screen: "scr-main", seconds: 10 }),
    true,
    "8.0 - 1.28 = 6.72s left",
  );
  assert.equal(fb("screenNearEnd", { screen: "scr-main", seconds: 2 }), false);
});
await check("screenEnabled reads the SHOW, not telemetry", () => {
  assert.equal(fb("screenEnabled", { screen: "scr-main" }), true);
  assert.equal(fb("screenEnabled", { screen: "scr-side" }), false);
});
await check("variables carry position and duration in seconds", () => {
  assert.equal(variableValues.screen_scr_main_file, "TESTCLIP");
  assert.equal(variableValues.screen_scr_main_position, "1.28");
  assert.equal(variableValues.screen_scr_main_duration, "8.00");
});

console.log("\n== presets ==");
await check("a section per screen, plus cues, pads and health", () => {
  const ids = presetStructure.map((s) => s.id);
  for (const want of ["cues", "pads", "screen-scr_main", "health"])
    assert.ok(ids.includes(want), `${want} in ${ids.join(",")}`);
});
await check("every preset is 2.x 'simple' and cross-references resolve", () => {
  for (const [id, p] of Object.entries(presetDefs)) {
    assert.equal(p.type, "simple", `${id} type`);
    for (const st of p.steps)
      for (const a of st.down)
        assert.ok(actions[a.actionId], `${id} -> action ${a.actionId}`);
    for (const f of p.feedbacks)
      assert.ok(feedbacks[f.feedbackId], `${id} -> feedback ${f.feedbackId}`);
  }
});
await check("nothing orphaned or dangling", () => {
  const referenced = new Set(
    presetStructure.flatMap((s) => s.definitions.flatMap((g) => g.presets)),
  );
  for (const s of presetStructure)
    for (const g of s.definitions)
      for (const ref of g.presets)
        assert.ok(presetDefs[ref], `${s.id} -> ${ref}`);
  for (const id of Object.keys(presetDefs))
    assert.ok(referenced.has(id), `${id} defined but in no section`);
});
await check("pad presets fire by INDEX, not by cue id", () => {
  const p = presetDefs.pad_0;
  assert.equal(p.steps[0].down[0].actionId, "firePad");
  assert.equal(p.steps[0].down[0].options.index, 0);
});
await check("preset variables use the label and all exist", () => {
  const texts = Object.values(presetDefs)
    .map((p) => p.style.text)
    .join("\n");
  assert.ok(texts.includes("$(Caspar:"));
  for (const m of texts.matchAll(/\$\(Caspar:([a-zA-Z0-9_]+)\)/g))
    assert.ok(variables[m[1]], `${m[1]} is defined`);
});

console.log("\n== actions ==");
await check("fireCue posts to the cue's fire endpoint", async () => {
  calls.length = 0;
  await fire("fireCue", { cue: "cue-open" });
  await wait();
  assert.ok(calls.some((c) => c.path === "/api/cues/cue-open/fire"));
});
await check("firePad resolves the pad's current cue", async () => {
  calls.length = 0;
  await fire("firePad", { index: 1 });
  await wait();
  assert.ok(calls.some((c) => c.path === "/api/cues/cue-black/fire"));
});
await check("firePad on an empty pad does nothing, and says so", async () => {
  calls.length = 0;
  lastWarn = "";
  await fire("firePad", { index: 9 });
  await wait();
  assert.equal(calls.length, 0);
  assert.match(lastWarn, /no cue assigned/);
});
await check("mixer parses a comma-separated value list", async () => {
  calls.length = 0;
  await fire("mixer", {
    screen: "scr-main",
    property: "fill",
    values: "0, 0, 0.5, 0.5",
    frames: 25,
    tween: "",
  });
  await wait();
  const call = calls.find((c) => c.path.endsWith("/mixer"));
  assert.deepEqual(call.payload.values, [0, 0, 0.5, 0.5]);
  assert.equal(call.payload.frames, 25);
  assert.ok(!("tween" in call.payload), "an empty tween is omitted");
});
await check("screenEnable toggles from the show's own state", async () => {
  await fire("screenEnable", { screen: "scr-main", mode: "toggle" });
  await wait();
  assert.equal(self.screen("scr-main").enabled, false);
  await fire("screenEnable", { screen: "scr-main", mode: "enable" });
  await wait();
  assert.equal(self.screen("scr-main").enabled, true);
});
await check(
  "assigning a cue to a pad rewrites the whole pad list",
  async () => {
    await fire("setPads", { index: 2, cue: "cue-open" });
    await wait();
    assert.equal(self.pads().length, 3);
    assert.ok(presetDefs.pad_2, "and a preset appeared for it");
  },
);

console.log("\n== AMCP failure paths ==");
await check("a 400 is surfaced WITH the two-word-trap hint", async () => {
  lastError = "";
  await fire("rawCommand", { command: "MIXER FILL 1-10 0 0 0.5 0.5" });
  await wait();
  assert.match(lastError, /400/);
  assert.match(lastError, /BETWEEN the words/);
});
await check("a well-formed command does not error", async () => {
  lastError = "";
  await fire("rawCommand", { command: "MIXER 1-10 FILL 0 0 0.5 0.5" });
  await wait();
  assert.equal(lastError, "");
});
await check("COMMIT PARTIAL is warned about, not read as success", async () => {
  lastWarn = "";
  await fire("rawBatch", { commands: "PLAY 1-10 CLIP\nBAD COMMAND" });
  await wait();
  assert.match(lastWarn, /PARTIAL/);
});
await check("a clean batch is silent", async () => {
  lastWarn = "";
  await fire("rawBatch", { commands: "PLAY 1-10 CLIP\nSTOP 1-10" });
  await wait();
  assert.equal(lastWarn, "");
});
await check("an unknown screen's 404 is surfaced", async () => {
  lastError = "";
  await fire("stop", { screen: "nope" });
  await wait();
  assert.match(lastError, /screen not found/);
});

console.log("\n== teardown ==");
await check("close() settles", async () => {
  socket.close();
  await wait();
  assert.equal(socket.ws, null);
});

wss.close();
server.close();
console.log("\n== the checkFeedbacks trap ==");
// InstanceBase.checkFeedbacks(type, ...rest) requires AT LEAST ONE type: with no
// arguments it forwards [undefined] to the host, which checks a feedback type
// called "undefined" — i.e. nothing at all. Every feedback then sits frozen at
// whatever it last evaluated to, with no error anywhere. checkAllFeedbacks() is
// the correct call for "re-evaluate everything".
await check("no bare checkFeedbacks() survives in src/", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../src/", import.meta.url).pathname;
  const offenders = [];
  for (const f of readdirSync(dir)) {
    if (!/\.(js|ts)$/.test(f)) continue;
    const body = readFileSync(dir + f, "utf8");
    if (/[^A-Za-z]checkFeedbacks\(\s*\)/.test(body)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], "use checkAllFeedbacks() instead");
});

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} CHECK(S) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
