import { screenChoices, cueChoices } from "./actions.js";
import { socket } from "./api.js";

// Three health signals, three feedbacks, deliberately not merged — conflating
// them sends an operator to the wrong fault:
//
//   connected        this module <-> caspar-avd
//   casparcgUp       caspar-avd <-> CasparCG
//   telemetry        OSC telemetry is arriving at all
//
// The third is the subtle one. CasparCG answers no "what is playing" question
// over AMCP; it PUSHES its monitor state as OSC. So commands can work perfectly
// while the module knows nothing about what is on screen — and "no telemetry"
// must not render as "nothing is playing".

export default function UpdateFeedbacks(self) {
  const screens = screenChoices(self);
  const cues = cueChoices(self);
  const screenOption = {
    id: "screen",
    type: "dropdown",
    label: "Screen",
    choices: screens,
    default: screens[0]?.id ?? "",
    allowCustom: true,
  };

  self.setFeedbackDefinitions({
    connected: {
      type: "boolean",
      name: "caspar-avd is connected",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () => socket.ws?.readyState === 1,
    },

    casparcgUp: {
      type: "boolean",
      name: "CasparCG is connected to caspar-avd",
      description:
        "A different question from 'is caspar-avd reachable'. The daemon reconnects to CasparCG with backoff, so this goes dark and recovers on its own when the server is restarted mid-rig.",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () => self.snapshot?.health === "connected",
    },

    telemetry: {
      type: "boolean",
      name: "OSC telemetry is arriving",
      description:
        "Commands can work perfectly with this dark — CasparCG pushes telemetry over OSC rather than answering questions over AMCP. While it is dark, every 'is this playing' feedback below is unknowable, not false.",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () => self.hasTelemetry(),
    },

    scannerUp: {
      type: "boolean",
      name: "media-scanner is up",
      description:
        "Not optional in CasparCG 2.5 — CLS, TLS, FLS, CINF and every THUMBNAIL command are HTTP-proxied straight to it, and answer 501 without it. The server has no media list of its own.",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () => !!self.snapshot?.scanner_up,
    },

    screenPlaying: {
      type: "boolean",
      name: "Screen has something playing",
      description:
        "From the OSC telemetry, not from the show. The show is INTENT and telemetry is what CasparCG is actually doing — caspar-avd never merges them, and a disagreement is information.",
      defaultStyle: { bgcolor: 0x009900, color: 0xffffff },
      options: [screenOption],
      callback: (f) => {
        const layer = self.layerState(String(f.options.screen ?? ""));
        const producer = layer?.foreground?.producer;
        // An empty slot reports the producer "empty" rather than being omitted.
        return !!producer && producer !== "empty";
      },
    },

    screenPaused: {
      type: "boolean",
      name: "Screen is paused",
      defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
      options: [screenOption],
      callback: (f) =>
        !!self.layerState(String(f.options.screen ?? ""))?.foreground?.paused,
    },

    screenPlayingFile: {
      type: "boolean",
      name: "Screen is playing a specific file",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [
        screenOption,
        {
          id: "file",
          type: "textinput",
          label: "File name",
          default: "",
          useVariables: true,
        },
      ],
      callback: (f) => {
        const wanted = String(f.options.file ?? "").trim();
        if (!wanted) return false;
        const name = self.layerState(String(f.options.screen ?? ""))?.foreground
          ?.file?.name;
        return !!name && String(name) === wanted;
      },
    },

    screenNearEnd: {
      type: "boolean",
      name: "Screen's clip is near its end",
      description:
        "From file/time, which is [position, duration] in SECONDS. There is no frame number on the producer side, so a frame-accurate countdown is not available here — derive it as time x fps if you need one.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [
        screenOption,
        {
          id: "seconds",
          type: "number",
          label: "Within (seconds of the end)",
          min: 1,
          max: 300,
          default: 10,
        },
      ],
      callback: (f) => {
        const time = self.layerState(String(f.options.screen ?? ""))?.foreground
          ?.file?.time;
        if (!Array.isArray(time)) return false;
        const [position, duration] = time.map(Number);
        if (!Number.isFinite(position) || !Number.isFinite(duration))
          return false;
        if (duration <= 0) return false;
        return duration - position <= Number(f.options.seconds ?? 10);
      },
    },

    screenEnabled: {
      type: "boolean",
      name: "Screen is enabled",
      description:
        "The show's own intent, not telemetry — this is what the operator configured, and it stays true while telemetry is absent.",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [screenOption],
      callback: (f) => !!self.screen(String(f.options.screen ?? ""))?.enabled,
    },

    cueAssignedToPad: {
      type: "boolean",
      name: "A pad holds a specific cue",
      description:
        "For a surface laid out to mirror the pad grid — the button can show whether the pad it represents is still assigned to the cue it was built for.",
      defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
      options: [
        {
          id: "index",
          type: "number",
          label: "Pad index",
          min: 0,
          max: 255,
          default: 0,
        },
        {
          id: "cue",
          type: "dropdown",
          label: "Cue",
          choices: cues,
          default: cues[0]?.id ?? "",
          allowCustom: true,
        },
      ],
      callback: (f) => {
        const pad = self
          .pads()
          .find((p) => Number(p.index) === Number(f.options.index));
        return !!pad && pad.cue === String(f.options.cue ?? "");
      },
    },

    warnings: {
      type: "boolean",
      name: "caspar-avd has configuration warnings",
      description:
        "Configuration problems the daemon pre-empted rather than waiting for them to bite. Worth a light on a setup page.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [],
      callback: () => (self.snapshot?.warnings ?? []).length > 0,
    },
  });
}
