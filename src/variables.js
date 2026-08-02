import { safeId } from "./main.js";

// Rebuilt only when the show's shape changes (screens, cues, pads, media,
// templates) — main.js compares those rather than the whole snapshot, which
// carries per-frame telemetry and a rolling command log.
export default function UpdateVariableDefinitions(self) {
  const defs = {
    connection_status: { name: "caspar-avd connection" },
    casparcg_health: { name: "CasparCG health (connecting/connected/down)" },
    scanner_up: { name: "media-scanner up" },
    telemetry: { name: "OSC telemetry (Receiving / None)" },
    server_version: { name: "CasparCG version" },
    warning_count: { name: "Configuration warnings" },
    media_count: { name: "Media items" },
    template_count: { name: "Templates" },
    cue_count: { name: "Cues in the show" },
    screen_count: { name: "Screens in the show" },
  };
  for (const screen of self.screens()) {
    const p = `screen_${safeId(screen.id)}_`;
    const n = screen.name ?? screen.id;
    defs[`${p}name`] = { name: `${n}: name` };
    defs[`${p}channel`] = { name: `${n}: channel-layer` };
    defs[`${p}enabled`] = { name: `${n}: enabled` };
    defs[`${p}opacity`] = { name: `${n}: opacity` };
    defs[`${p}producer`] = { name: `${n}: producer (from telemetry)` };
    defs[`${p}file`] = { name: `${n}: file name` };
    defs[`${p}position`] = { name: `${n}: position (seconds)` };
    defs[`${p}duration`] = { name: `${n}: duration (seconds)` };
    defs[`${p}paused`] = { name: `${n}: paused` };
  }
  self.setVariableDefinitions(defs);
}
