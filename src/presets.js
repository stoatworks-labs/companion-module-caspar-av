// Variable references in preset text use `self.label`, the CONNECTION's label,
// not the module id — Companion resolves $(label:variable) against whatever the
// operator named this connection.
//
// Cue and screen presets are GENERATED from the show, because a show's cues and
// screens are the whole configuration. The pad grid is generated too, from the
// show's own pad assignments, so a Stream Deck laid out to mirror it stays in
// step when the show is re-laid-out.
//
// A note on why "fire a cue" is the headline preset rather than a stack of
// transport buttons: caspar-avd compiles a cue into one BEGIN/COMMIT batch, so
// the server locks every touched channel and releases them on the same frame. A
// button firing three separate screen actions lands them on three frames.
import { safeId } from "./main.js";

const WHITE = 0xffffff;
const BLACK = 0x000000;
const GREY = 0x333333;
const RED = 0xcc0000;
const GREEN = 0x009900;
const AMBER = 0xcc7a00;
const BLUE = 0x0066cc;
const DARKGREEN = 0x003300;
const BRIGHTGREEN = 0x00ff00;

function preset({
  name,
  text,
  size = "14",
  color = WHITE,
  bgcolor = GREY,
  actions = [],
  feedbacks = [],
}) {
  return {
    type: "simple",
    name,
    style: { text, size, color, bgcolor, show_topbar: false },
    steps: [{ down: actions, up: [] }],
    feedbacks,
  };
}

export default function UpdatePresets(self) {
  const presets = {};
  const structure = [];

  // --- Cues -----------------------------------------------------------------
  const cueRefs = [];
  for (const cue of self.cues()) {
    const id = `cue_${safeId(cue.id)}`;
    presets[id] = preset({
      name: `Fire cue: ${cue.name ?? cue.id}`,
      text: `${cue.name ?? cue.id}`,
      bgcolor: BLACK,
      actions: [{ actionId: "fireCue", options: { cue: cue.id } }],
    });
    cueRefs.push(id);
  }
  if (cueRefs.length > 0) {
    structure.push({
      id: "cues",
      name: "Cues",
      description:
        "Each cue is one BEGIN/COMMIT batch, so a multi-screen cue lands on a single frame. Prefer these over stacking transport actions on a button.",
      definitions: [
        { id: "cues-main", type: "simple", name: "Cues", presets: cueRefs },
      ],
      keywords: ["cue", "fire", "go"],
    });
  }

  // --- Pad grid --------------------------------------------------------------
  const padRefs = [];
  for (const pad of self.pads()) {
    if (pad.cue === undefined || pad.cue === null) continue;
    const cue = self.cues().find((c) => c.id === pad.cue);
    const id = `pad_${pad.index}`;
    presets[id] = preset({
      name: `Pad ${pad.index}: ${cue?.name ?? pad.cue}`,
      text: `${cue?.name ?? pad.cue}`,
      bgcolor: BLACK,
      // Fires by PAD INDEX rather than by cue id, so the button keeps working
      // when the show is re-laid-out and the pad gets a different cue.
      actions: [{ actionId: "firePad", options: { index: pad.index } }],
      feedbacks: [
        {
          feedbackId: "cueAssignedToPad",
          options: { index: pad.index, cue: pad.cue },
          style: { bgcolor: BLUE, color: WHITE },
        },
      ],
    });
    padRefs.push(id);
  }
  if (padRefs.length > 0) {
    structure.push({
      id: "pads",
      name: "Pad grid",
      description:
        "Fires by pad POSITION, not by cue id — so a surface laid out to mirror the grid keeps working when the show is re-laid-out. The blue lights while the pad still holds the cue it was built for.",
      definitions: [
        { id: "pads-main", type: "simple", name: "Pads", presets: padRefs },
      ],
      keywords: ["pad", "grid", "cue"],
    });
  }

  // --- One section per screen -----------------------------------------------
  for (const screen of self.screens()) {
    const key = safeId(screen.id);
    const label = screen.name ?? screen.id;
    const refs = [];
    const add = (suffix, def) => {
      presets[`${key}_${suffix}`] = def;
      refs.push(`${key}_${suffix}`);
    };

    add(
      "status",
      preset({
        name: `${label}: what is on it (no action)`,
        text: `${label}\n$(${self.label}:screen_${key}_file)\n$(${self.label}:screen_${key}_position)s`,
        bgcolor: BLACK,
        feedbacks: [
          {
            feedbackId: "screenPlaying",
            options: { screen: screen.id },
            style: { bgcolor: GREEN, color: WHITE },
          },
          {
            feedbackId: "screenPaused",
            options: { screen: screen.id },
            style: { bgcolor: BLUE, color: WHITE },
          },
          // Ordered last so it wins: a clip about to run out is the thing an
          // operator needs to see over "it is playing".
          {
            feedbackId: "screenNearEnd",
            options: { screen: screen.id, seconds: 10 },
            style: { bgcolor: AMBER, color: BLACK },
          },
        ],
      }),
    );

    add(
      "take",
      preset({
        name: `${label}: take (background to foreground)`,
        text: `${label}\nTAKE`,
        bgcolor: BLACK,
        actions: [{ actionId: "take", options: { screen: screen.id } }],
      }),
    );

    add(
      "pause",
      preset({
        name: `${label}: pause`,
        text: `${label}\nPAUSE`,
        bgcolor: BLACK,
        actions: [{ actionId: "pause", options: { screen: screen.id } }],
        feedbacks: [
          {
            feedbackId: "screenPaused",
            options: { screen: screen.id },
            style: { bgcolor: BLUE, color: WHITE },
          },
        ],
      }),
    );

    add(
      "resume",
      preset({
        name: `${label}: resume`,
        text: `${label}\nRESUME`,
        bgcolor: BLACK,
        actions: [{ actionId: "resume", options: { screen: screen.id } }],
      }),
    );

    add(
      "stop",
      preset({
        name: `${label}: stop`,
        text: `${label}\nSTOP`,
        bgcolor: BLACK,
        actions: [{ actionId: "stop", options: { screen: screen.id } }],
      }),
    );

    add(
      "enable",
      preset({
        name: `${label}: enable / disable`,
        text: `${label}\nON/OFF`,
        bgcolor: BLACK,
        actions: [
          {
            actionId: "screenEnable",
            options: { screen: screen.id, mode: "toggle" },
          },
        ],
        feedbacks: [
          {
            feedbackId: "screenEnabled",
            options: { screen: screen.id },
            style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
          },
        ],
      }),
    );

    structure.push({
      id: `screen-${key}`,
      name: `Screen: ${label}`,
      description: `CasparCG channel ${screen.channel}-${screen.layer}. Playing/paused colour comes from OSC telemetry, not from the show.`,
      definitions: [
        {
          id: `screen-${key}-main`,
          type: "simple",
          name: label,
          presets: refs,
        },
      ],
      keywords: ["screen", "transport", label],
    });
  }

  // --- Health ----------------------------------------------------------------
  presets.health_connected = preset({
    name: "caspar-avd is connected",
    text: `CASPAR-AV\n$(${self.label}:connection_status)`,
    bgcolor: RED,
    feedbacks: [
      {
        feedbackId: "connected",
        options: {},
        style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
      },
    ],
  });
  presets.health_casparcg = preset({
    name: "CasparCG is connected",
    text: `CASPARCG\n$(${self.label}:casparcg_health)`,
    bgcolor: RED,
    feedbacks: [
      {
        feedbackId: "casparcgUp",
        options: {},
        style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
      },
    ],
  });
  presets.health_telemetry = preset({
    name: "OSC telemetry is arriving",
    text: `TELEMETRY\n$(${self.label}:telemetry)`,
    bgcolor: AMBER,
    color: BLACK,
    feedbacks: [
      {
        feedbackId: "telemetry",
        options: {},
        style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
      },
    ],
  });
  presets.health_scanner = preset({
    name: "media-scanner is up",
    text: `SCANNER\n$(${self.label}:scanner_up)`,
    bgcolor: RED,
    actions: [{ actionId: "refreshLibrary", options: {} }],
    feedbacks: [
      {
        feedbackId: "scannerUp",
        options: {},
        style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
      },
    ],
  });
  presets.health_warnings = preset({
    name: "Configuration warnings (no action)",
    text: `WARNINGS\n$(${self.label}:warning_count)`,
    bgcolor: BLACK,
    feedbacks: [
      {
        feedbackId: "warnings",
        options: {},
        style: { bgcolor: AMBER, color: BLACK },
      },
    ],
  });
  presets.push_mapping = preset({
    name: "Push the screen mapping to CasparCG",
    text: "PUSH\nMAPPING",
    actions: [{ actionId: "pushMapping", options: {} }],
  });
  presets.log_state = preset({
    name: "Log the current snapshot",
    text: "LOG\nSTATE",
    actions: [{ actionId: "logState", options: {} }],
  });

  structure.push({
    id: "health",
    name: "Health",
    description:
      "Three separate signals, deliberately not merged: this module to caspar-avd, caspar-avd to CasparCG, and whether OSC telemetry is arriving at all. Commands can work perfectly with telemetry dark — and then every 'is this playing' colour is unknowable rather than false.",
    definitions: [
      {
        id: "health-main",
        type: "simple",
        name: "Health",
        presets: [
          "health_connected",
          "health_casparcg",
          "health_telemetry",
          "health_scanner",
          "health_warnings",
          "push_mapping",
          "log_state",
        ],
      },
    ],
    keywords: ["health", "telemetry", "scanner"],
  });

  self.setPresetDefinitions(structure, presets);
}
