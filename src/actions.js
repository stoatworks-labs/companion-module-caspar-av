import { post, patch, put, rawCommand, getJson } from "./api.js";

// caspar-avd compiles a cue into ONE BEGIN/COMMIT batch, which is why cues
// exist here rather than being a list of buttons: the server locks every
// touched channel and releases them on the same frame. A Companion button that
// fired three separate screen actions would land them on three different
// frames. So: prefer "fire a cue" over stacking transport actions.
//
// An action naming an unknown screen fails the ENTIRE cue rather than firing
// the ones that happen to resolve — half a cue on stage is worse than none, and
// the daemon names the missing screen.

export function screenChoices(self) {
  return self.screens().map((s) => ({
    id: s.id,
    label: `${s.name ?? s.id} (${s.channel}-${s.layer})`,
  }));
}

export function cueChoices(self) {
  return self.cues().map((c) => ({ id: c.id, label: c.name ?? c.id }));
}

export function mediaChoices(self) {
  return (self.snapshot?.media ?? []).map((m) => ({
    id: m.id ?? m.name,
    label: m.name ?? m.id,
  }));
}

export function templateChoices(self) {
  return (self.snapshot?.templates ?? []).map((t) => ({
    id: t.id ?? t.name,
    label: t.name ?? t.id,
  }));
}

export default function UpdateActions(self) {
  const screens = screenChoices(self);
  const cues = cueChoices(self);
  const media = mediaChoices(self);
  const templates = templateChoices(self);

  const screenOption = {
    id: "screen",
    type: "dropdown",
    label: "Screen",
    choices: screens,
    default: screens[0]?.id ?? "",
    allowCustom: true,
  };

  const text = async (event, key) =>
    (
      await self.parseVariablesInString(String(event.options[key] ?? ""))
    ).trim();

  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      self.log("error", e.message);
    }
  };

  const transport = (action, extra) => async (event) =>
    run(async () => {
      const screen = await text(event, "screen");
      if (!screen) return;
      await post(self, `/api/screens/${encodeURIComponent(screen)}/transport`, {
        action,
        ...(extra ? await extra(event) : {}),
      });
    });

  self.setActionDefinitions({
    // --- Cues and pads -----------------------------------------------------
    fireCue: {
      name: "Fire a cue",
      description:
        "The cue's actions are compiled to one BEGIN/COMMIT batch, so a multi-screen cue lands on a single frame. Prefer this over stacking transport actions on a button.",
      options: [
        {
          id: "cue",
          type: "dropdown",
          label: "Cue",
          choices: cues,
          default: cues[0]?.id ?? "",
          allowCustom: true,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const cue = await text(event, "cue");
          if (!cue) return;
          await post(self, `/api/cues/${encodeURIComponent(cue)}/fire`);
        }),
    },

    firePad: {
      name: "Fire a pad by grid position",
      description:
        "Fires whatever cue is currently assigned to that pad, so a button keeps working when the show is re-laid-out. An empty pad does nothing.",
      options: [
        {
          id: "index",
          type: "number",
          label: "Pad index",
          min: 0,
          max: 255,
          default: 0,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const index = Number(event.options.index);
          const pad = self.pads().find((p) => Number(p.index) === index);
          if (!pad?.cue) {
            self.log("warn", `Pad ${index} has no cue assigned.`);
            return;
          }
          await post(self, `/api/cues/${encodeURIComponent(pad.cue)}/fire`);
        }),
    },

    // --- Screen transport ---------------------------------------------------
    play: {
      name: "Screen: play a clip",
      options: [
        screenOption,
        {
          id: "clip",
          type: "dropdown",
          label: "Clip",
          choices: media,
          default: media[0]?.id ?? "",
          allowCustom: true,
        },
        { id: "looping", type: "checkbox", label: "Loop", default: false },
        {
          id: "frames",
          type: "number",
          label: "Mix in (frames)",
          min: 0,
          max: 250,
          default: 0,
        },
      ],
      callback: transport("play", async (event) => ({
        clip: await text(event, "clip"),
        looping: !!event.options.looping,
        frames: Number(event.options.frames) || 0,
      })),
    },
    load: {
      name: "Screen: load a clip into the background",
      description:
        "Prepares the clip without putting it on air. Follow with Take to cut to it — the pair that makes a frame-accurate change possible.",
      options: [
        screenOption,
        {
          id: "clip",
          type: "dropdown",
          label: "Clip",
          choices: media,
          default: media[0]?.id ?? "",
          allowCustom: true,
        },
        { id: "looping", type: "checkbox", label: "Loop", default: false },
        {
          id: "frames",
          type: "number",
          label: "Mix in (frames)",
          min: 0,
          max: 250,
          default: 0,
        },
      ],
      callback: transport("load", async (event) => ({
        clip: await text(event, "clip"),
        looping: !!event.options.looping,
        frames: Number(event.options.frames) || 0,
      })),
    },
    take: {
      name: "Screen: take (background to foreground)",
      options: [screenOption],
      callback: transport("take"),
    },
    pause: {
      name: "Screen: pause",
      options: [screenOption],
      callback: transport("pause"),
    },
    resume: {
      name: "Screen: resume",
      options: [screenOption],
      callback: transport("resume"),
    },
    stop: {
      name: "Screen: stop",
      options: [screenOption],
      callback: transport("stop"),
    },
    clear: {
      name: "Screen: clear",
      options: [screenOption],
      callback: transport("clear"),
    },

    // --- Mixer --------------------------------------------------------------
    mixer: {
      name: "Screen: set a mixer property",
      description:
        "Values are normalised 0..1 for geometry — the show model works in normalised space and caspar-avd converts. Frames animates the change; a tween names an easing curve.",
      options: [
        screenOption,
        {
          id: "property",
          type: "dropdown",
          label: "Property",
          choices: [
            "opacity",
            "volume",
            "brightness",
            "saturation",
            "contrast",
            "rotation",
            "fill",
            "clip",
            "crop",
            "anchor",
            "perspective",
            "blend",
            "keyer",
          ].map((id) => ({ id, label: id })),
          default: "opacity",
        },
        {
          id: "values",
          type: "textinput",
          label: "Values (comma separated)",
          default: "1",
          useVariables: true,
          tooltip:
            "opacity/volume take one value. fill takes x, y, w, h. perspective takes eight. Anything missing is read as 0.",
        },
        {
          id: "frames",
          type: "number",
          label: "Animate over (frames)",
          min: 0,
          max: 500,
          default: 0,
        },
        {
          id: "tween",
          type: "textinput",
          label: "Tween (optional)",
          default: "",
          useVariables: true,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const screen = await text(event, "screen");
          if (!screen) return;
          const values = (await text(event, "values"))
            .split(",")
            .map((v) => Number(v.trim()))
            .filter((v) => Number.isFinite(v));
          const tween = await text(event, "tween");
          await post(self, `/api/screens/${encodeURIComponent(screen)}/mixer`, {
            property: event.options.property,
            values,
            frames: Number(event.options.frames) || 0,
            ...(tween ? { tween } : {}),
          });
        }),
    },

    screenEnable: {
      name: "Screen: enable / disable",
      description:
        "Compiles to MIXER OPACITY. Disabling leaves the layer loaded, so re-enabling does not restart the clip.",
      options: [
        screenOption,
        {
          id: "mode",
          type: "dropdown",
          label: "Set",
          choices: [
            { id: "enable", label: "Enable" },
            { id: "disable", label: "Disable" },
            { id: "toggle", label: "Toggle" },
          ],
          default: "toggle",
        },
      ],
      callback: async (event) =>
        run(async () => {
          const id = await text(event, "screen");
          if (!id) return;
          const enabled =
            event.options.mode === "toggle"
              ? !self.screen(id)?.enabled
              : event.options.mode === "enable";
          await patch(self, `/api/screens/${encodeURIComponent(id)}`, {
            enabled,
          });
        }),
    },

    // --- Templates -----------------------------------------------------------
    template: {
      name: "Screen: template (CG)",
      description:
        "add loads and plays, update pushes new data, invoke calls a method on the template, next steps it, stop takes it off.",
      options: [
        screenOption,
        {
          id: "template",
          type: "dropdown",
          label: "Template",
          choices: templates,
          default: templates[0]?.id ?? "",
          allowCustom: true,
        },
        {
          id: "action",
          type: "dropdown",
          label: "Action",
          choices: ["add", "update", "stop", "next", "invoke"].map((id) => ({
            id,
            label: id,
          })),
          default: "add",
        },
        {
          id: "cg_layer",
          type: "number",
          label: "CG layer",
          min: 0,
          max: 20,
          default: 1,
        },
        {
          id: "data",
          type: "textinput",
          label: "Data (JSON or XML, optional)",
          default: "",
          useVariables: true,
          width: 12,
        },
        {
          id: "method",
          type: "textinput",
          label: "Method (for invoke)",
          default: "",
          useVariables: true,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const screen = await text(event, "screen");
          const template = await text(event, "template");
          if (!screen || !template) return;
          const data = await text(event, "data");
          const method = await text(event, "method");
          await post(
            self,
            `/api/screens/${encodeURIComponent(screen)}/template`,
            {
              template,
              action: event.options.action,
              cg_layer: Number(event.options.cg_layer) || 0,
              ...(data ? { data } : {}),
              ...(method ? { method } : {}),
            },
          );
        }),
    },

    // --- Raw AMCP ------------------------------------------------------------
    rawCommand: {
      name: "Send a raw AMCP command",
      description:
        "The escape hatch every media server needs. Watch the two-word trap: a two-word command puts its target BETWEEN the words — 'MIXER 1-10 FILL 0 0 0.5 0.5' is right, 'MIXER FILL 1-10 ...' answers 400 ERROR.",
      options: [
        {
          id: "command",
          type: "textinput",
          label: "AMCP",
          default: "MIXER 1-10 FILL 0 0 0.5 0.5",
          useVariables: true,
          width: 12,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const command = await text(event, "command");
          if (!command) return;
          const body = await rawCommand(self, command);
          self.log("debug", `AMCP ${body.code} ${body.status ?? ""}`);
        }),
    },

    rawBatch: {
      name: "Send several AMCP commands as one batch",
      description:
        "Wrapped in BEGIN/COMMIT, so every touched channel is released on the same frame — this is how a multi-screen change lands together. One line per command.",
      options: [
        {
          id: "commands",
          type: "textinput",
          label: "Commands (one per line)",
          default: "",
          useVariables: true,
          width: 12,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const raw = await text(event, "commands");
          const commands = raw
            .split("\n")
            .map((c) => c.trim())
            .filter(Boolean);
          if (commands.length === 0) return;
          const body = await post(self, "/api/batch", { commands });
          // COMMIT answers 202 COMMIT OK, or 202 COMMIT PARTIAL if any inner
          // command failed. Partial is a real outcome and must not read as
          // success.
          if (
            String(body.status ?? "")
              .toUpperCase()
              .includes("PARTIAL")
          ) {
            self.log(
              "warn",
              "AMCP batch committed PARTIAL — at least one command in it failed.",
            );
          }
        }),
    },

    // --- Housekeeping ---------------------------------------------------------
    refreshLibrary: {
      name: "Refresh the media library",
      description:
        "Re-reads media-scanner. Without media-scanner running, CasparCG has no media list of its own and every CLS/TLS/THUMBNAIL command answers 501.",
      options: [],
      callback: async () => run(() => post(self, "/api/library/refresh")),
    },
    pushMapping: {
      name: "Push the screen mapping to CasparCG",
      options: [],
      callback: async () => run(() => post(self, "/api/mapping/push")),
    },
    setPads: {
      name: "Assign a cue to a pad",
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
      callback: async (event) =>
        run(async () => {
          const index = Number(event.options.index);
          const cue = await text(event, "cue");
          const pads = self.pads().filter((p) => Number(p.index) !== index);
          pads.push({ index, cue });
          pads.sort((a, b) => a.index - b.index);
          await put(self, "/api/pads", pads);
        }),
    },
    logState: {
      name: "Log the current snapshot",
      options: [],
      callback: async () =>
        run(async () => {
          const body = await getJson(self, "/api/state");
          self.log("info", JSON.stringify(body, null, 2));
        }),
    },
  });
}
