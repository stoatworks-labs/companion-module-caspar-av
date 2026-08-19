# companion-module-caspar-av

> **AI-assisted project.** This module was built with the help of
> [Claude](https://claude.ai), Anthropic's AI assistant — including
> implementation and documentation. Review it accordingly before relying on
> it in production.

A [Bitfocus Companion](https://bitfocus.io/companion) connection module for
[caspar-AV](https://github.com/stoatworks-labs/caspar-av) — fire cues and pads,
run transport on any screen, and see what CasparCG is actually doing.

<!-- downloads:start -->

## Download

**[v1.0.1](https://github.com/stoatworks-labs/companion-module-caspar-av/releases/tag/v1.0.1)**

This release contains:

- [`caspar-av-1.0.1.tgz`](https://github.com/stoatworks-labs/companion-module-caspar-av/releases/download/v1.0.1/caspar-av-1.0.1.tgz) — npm package, 25 KB
- [`companion-module-caspar-av-pkg.tgz`](https://github.com/stoatworks-labs/companion-module-caspar-av/releases/latest/download/companion-module-caspar-av-pkg.tgz) — npm package, 25 KB

All builds, checksums and release notes: [github.com/stoatworks-labs/companion-module-caspar-av/releases](https://github.com/stoatworks-labs/companion-module-caspar-av/releases).

<!-- downloads:end -->

## What it does

- **Actions** — fire a cue, fire a pad by grid position, screen transport
  (play / load / take / pause / resume / stop / clear), mixer properties
  (opacity, fill, perspective, keyer and the rest), enable/disable a screen,
  templates (add / update / stop / next / invoke), **raw AMCP** single and
  batched, refresh the media library, push the screen mapping, assign a cue to a
  pad, and log the snapshot.
- **Feedbacks** — caspar-avd connected, **CasparCG connected**, **OSC telemetry
  arriving**, media-scanner up, screen playing, screen paused, screen playing a
  specific file, **clip near its end**, screen enabled, pad holds a cue,
  configuration warnings.
- **Variables** — per screen: name, channel-layer, enabled, opacity, producer,
  file, position, duration, paused. Plus health, counts and CasparCG version.
- **Presets** — Cues, **Pad grid**, a section per screen, and Health.

## Fire a cue rather than stacking transport buttons

caspar-avd compiles a cue into **one `BEGIN`/`COMMIT` batch**, so the server
locks every touched channel and releases them on the same frame. That is the
whole reason cues exist rather than being a list of buttons.

A Companion button firing three separate screen actions lands them on three
different frames. If a change has to be simultaneous, put it in a cue.

An action naming an unknown screen fails the _entire_ cue rather than firing the
ones that resolve — half a cue on stage is worse than none.

## Three health signals, not one

Conflating them sends people to the wrong fault:

| Feedback                      | Question it answers                 |
| ----------------------------- | ----------------------------------- |
| caspar-avd is connected       | Can this module reach the daemon?   |
| CasparCG is connected         | Can the daemon reach CasparCG?      |
| **OSC telemetry is arriving** | Does anyone know what is on screen? |

The third is the subtle one. **CasparCG answers no "what is playing" question
over AMCP** — it pushes its monitor state as OSC. So commands can work perfectly
while the module knows nothing, and every "is this playing" feedback reads
false. That is _unknowable_, not _not playing_, which is why telemetry has a
light of its own. Put it on any page carrying playing colour.

## Show intent vs live state

The show is **intent**; telemetry is what CasparCG is actually doing.
caspar-avd never merges them, and neither does this module:

- _Screen is enabled_ reads the show.
- _Screen is playing / paused / playing a file / near its end_ read telemetry.

If they disagree, that is information.

## The pad grid keeps working when the show changes

Pad presets fire by **pad position**, not by cue id — so a Stream Deck laid out
to mirror the grid stays correct when the show is re-laid-out. The blue lights
while the pad still holds the cue the button was built for.

## Raw AMCP: the two-word trap

A two-word AMCP command puts its **target between the words**:

```
MIXER 1-10 FILL 0 0 0.5 0.5      ✓ 202 MIXER OK
MIXER FILL 1-10 0 0 0.5 0.5      ✗ 400 ERROR
```

The module says so in the error when CasparCG answers 400, because otherwise
that mistake reads as a broken module rather than a wrong command.

Batches answer `202 COMMIT OK` or **`202 COMMIT PARTIAL`** when an inner command
failed. Partial is warned about rather than being read as success.

## media-scanner is not optional

In CasparCG 2.5, `CLS`, `TLS`, `FLS`, `CINF` and every `THUMBNAIL` command are
HTTP-proxied straight to media-scanner and answer `501` without it — the server
has no media list of its own. Hence a feedback for it, on a button that also
refreshes the library.

## Tests

```bash
npm test
```

Drives the module's real source against a fake caspar-avd (real HTTP + real
WebSocket): the three health signals staying distinct, telemetry absence vs
nothing playing, `file/time` read as `[position, duration]`, pads firing by
index, and both AMCP failure paths.

## Installing

Not in the official Companion module store. Install via
**Settings → Developer modules path**.

<!-- attributions:start -->
This project is built on other people's work — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
<!-- attributions:end -->

## Licence

MIT — see [LICENSE](LICENSE).
