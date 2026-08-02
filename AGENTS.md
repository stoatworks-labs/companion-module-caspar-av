# AGENTS.md — bringing an LLM up to speed on this Companion module

Orientation for an AI assistant (or a new human) picking this project up cold. There is no
`CLAUDE.md` here; this is the entry point.

---

## 1. What this is

A **Bitfocus Companion connection module** for **caspar-AV**, the live-events media server
built on CasparCG. It fires cues and pads, runs screen transport and mixer, invokes
templates, and sends raw AMCP.

JavaScript, Node 22 runtime, `@companion-module/base` 2.x. It talks to **caspar-avd**, the
daemon — never to CasparCG directly.

## 2. One type is the whole read interface

`Snapshot` — pushed over `/ws/ui` on a 200 ms tick, and only when the serialised form
changed. The module holds no authoritative state of its own, exactly as the console does not.

Re-registration is driven by a **shape key** covering only what the definition sets are built
from (screens, cues, pads, media, templates). The snapshot also carries per-frame channel
telemetry and a rolling command log, so whole-snapshot comparison would rebuild every
dropdown five times a second. Extend the shape key if you add a definition that depends on
another part of the snapshot.

## 3. Three health signals, kept separate on purpose

|                            | Question                         |
| -------------------------- | -------------------------------- |
| `socket.ws.readyState`     | module ↔ caspar-avd              |
| `snapshot.health`          | caspar-avd ↔ CasparCG            |
| `snapshot.channels.length` | is OSC telemetry arriving at all |

The third is the one people merge away and should not. **CasparCG answers no "what is
playing" question over AMCP** — it pushes its monitor state as OSC once per frame. Commands
can work perfectly with telemetry absent, and then every `screenPlaying`-style feedback reads
false when the truth is _unknowable_. That is why `telemetry` has its own feedback and the
docs tell operators to put it on any page carrying playing colour.

## 4. Show intent and live state are never merged

`snapshot.show` is intent; `snapshot.channels` is what CasparCG is doing. caspar-avd keeps
them apart deliberately — a disagreement is information, not a bug to paper over. So:

- `screenEnabled` reads the show.
- `screenPlaying` / `screenPaused` / `screenPlayingFile` / `screenNearEnd` read telemetry.

Do not "fix" one to fall back on the other.

## 5. OSC telemetry traps, all paid for upstream

From `caspar-av/docs/amcp.md`, verified against a live 2.5.0 server:

- **`file/time` is `[position, duration]` in SECONDS.** There is no frame number on the
  producer side and no `file/video/width`, however plausible they look — `file/fps` and
  `file/frame` exist only under `output/port/<id>/`, describing the CONSUMER. A frame-accurate
  countdown has to be derived as `time × fps`.
- **`framerate` is a rational (`,ii`)**, not a float. Read as a scalar it yields nothing.
- **An empty slot reports the producer `"empty"`** rather than being omitted — hence the
  explicit `producer !== "empty"` check in `screenPlaying`.
- **Keys are never retracted.** When a colour producer replaces a clip the server just stops
  sending `file/*`; caspar-avd expires anything that stops arriving, so this module can trust
  what it is given.

## 6. AMCP traps this module surfaces rather than hides

- **The two-word trap.** A two-word command puts its target BETWEEN the words:
  `MIXER 1-10 FILL ...` ✓, `MIXER FILL 1-10 ...` ✗ 400. `api.js::rawCommand` appends that
  hint to any 400, because the mistake otherwise reads as a broken module. This one cost
  caspar-AV itself a rewrite of every MIXER and CG builder.
- **`202 COMMIT PARTIAL`.** A batch answers OK or PARTIAL; PARTIAL means an inner command
  failed. `rawBatch` warns rather than treating it as success.
- **media-scanner is not optional in 2.5.** CLS/TLS/FLS/CINF/THUMBNAIL are HTTP-proxied to it
  and answer 501 without it — the server has no media list of its own. Hence the `scannerUp`
  feedback.

## 7. Cues, not stacked buttons

caspar-avd compiles a cue into one `BEGIN`/`COMMIT` batch so the server locks every touched
channel and releases them on the same frame. A button firing three transport actions lands
them on three frames. The preset section and the action descriptions both say so — keep them
saying it.

**Pad presets fire by INDEX, not by cue id**, so a surface mirroring the grid survives a
re-lay-out. Do not "simplify" that to firing the cue directly.

## 8. Traps in the Companion layer

- **`@companion-module/base` 2.x presets are `setPresetDefinitions(structure, definitions)`**
  with `type: 'simple'`. A 1.x `category` field loads and then never appears in the UI.
- **`setVariableDefinitions` throws on an array** — it must be an object keyed by variable id.
- **Preset variable references use `self.label`**, the connection's label, not the module id.
  A hardcoded id renders as raw `$(...)` text on a renamed connection.

## 9. Conventions

- Not in the official Companion module store — installs via **Settings → Developer modules
  path**.
- `npm test` drives the real source against a fake caspar-avd (real HTTP + real WebSocket).
- Ships a user-facing AI-assisted disclaimer.
- "Commit" means commit **and** push.
