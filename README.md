# companion-module-caspar-av

> **AI-assisted project.** This module was created with [Claude](https://claude.com/claude-code)
> (Anthropic), directed and reviewed by a human author. Check it over before you rely on it for
> a show.

A [Bitfocus Companion](https://bitfocus.io/companion) module for
[caspar-AV](https://github.com/stoatworks-labs/caspar-av). It fires cues and pads,
runs transport on any screen, and shows you what CasparCG is actually up to.

<!-- downloads:start -->

## Download

**[v1.0.5](https://github.com/stoatworks-labs/companion-module-caspar-av/releases/tag/v1.0.5)**

This release contains:

- [`caspar-av-1.0.5.tgz`](https://github.com/stoatworks-labs/companion-module-caspar-av/releases/download/v1.0.5/caspar-av-1.0.5.tgz) — npm package, 26 KB
- [`companion-module-caspar-av-pkg.tgz`](https://github.com/stoatworks-labs/companion-module-caspar-av/releases/latest/download/companion-module-caspar-av-pkg.tgz) — npm package, 26 KB

All builds, checksums and release notes: [github.com/stoatworks-labs/companion-module-caspar-av/releases](https://github.com/stoatworks-labs/companion-module-caspar-av/releases).

<!-- downloads:end -->

## What it does

- **Actions:** fire a cue, fire a pad by grid position, screen transport
  (play / load / take / pause / resume / stop / clear), mixer properties
  (opacity, fill, perspective, keyer and the rest), enable/disable a screen,
  templates (add / update / stop / next / invoke), raw AMCP single and
  batched, refresh the media library, push the screen mapping, assign a cue to a
  pad, and log the snapshot.
- **Feedbacks:** caspar-avd connected, CasparCG connected, OSC telemetry
  arriving, media-scanner up, screen playing, screen paused, screen playing a
  specific file, clip near its end, screen enabled, pad holds a cue, and
  configuration warnings.
- **Variables:** per screen, the name, channel-layer, enabled, opacity, producer,
  file, position, duration and paused. Plus health, counts and the CasparCG version.
- **Presets:** Cues, Pad grid, a section per screen, and Health.

## Fire a cue rather than stacking transport buttons

caspar-avd compiles a cue into one `BEGIN`/`COMMIT` batch, so the server locks
every channel the cue touches and releases them all on the same frame. That's the
reason cues exist at all, rather than being a list of buttons.

If a Companion button fires three separate screen actions, they land on three
different frames. If a change has to happen all at once, put it in a cue.

If an action names a screen that doesn't exist, the _entire_ cue fails rather than
firing the bits that do resolve, on the basis that half a cue on stage is worse
than none.

## Three health signals, not one

Lumping them together sends you off looking for the wrong fault, so there are three:

| Feedback                      | Question it answers                 |
| ----------------------------- | ----------------------------------- |
| caspar-avd is connected       | Can this module reach the daemon?   |
| CasparCG is connected         | Can the daemon reach CasparCG?      |
| **OSC telemetry is arriving** | Does anyone know what is on screen? |

The third one's the sneaky one. CasparCG won't answer any "what's playing?"
question over AMCP; it pushes its monitor state out as OSC instead. So your
commands can all work fine while the module knows nothing, and every "is this
playing" feedback reads false. False there means _unknowable_ rather than _not
playing_, which is why telemetry gets a light of its own. Put it on any page where
the buttons show playing colour.

## Show intent vs live state

The show is what you intended, and telemetry is what CasparCG is actually doing.
caspar-avd never mixes the two, and neither does this module:

- _Screen is enabled_ reads the show.
- _Screen is playing / paused / playing a file / near its end_ read telemetry.

If they disagree, that tells you something.

## The pad grid keeps working when the show changes

Pad presets fire by pad position rather than by cue id, so a Stream Deck laid out
to match the grid stays right when the show gets re-laid out. The blue lights
while the pad still holds the cue the button was built for.

## Raw AMCP: the two-word trap

A two-word AMCP command wants its target in the middle, between the words:

```
MIXER 1-10 FILL 0 0 0.5 0.5      ✓ 202 MIXER OK
MIXER FILL 1-10 0 0 0.5 0.5      ✗ 400 ERROR
```

When CasparCG answers 400, the module says so in the error, because otherwise
that mistake looks like a broken module when it's really a wrong command.

Batches answer `202 COMMIT OK`, or `202 COMMIT PARTIAL` when a command inside
failed. The module warns you about a partial rather than counting it as a success.

## media-scanner is not optional

In CasparCG 2.5, `CLS`, `TLS`, `FLS`, `CINF` and every `THUMBNAIL` command get
passed over HTTP straight to media-scanner, and answer `501` without it. The
server doesn't keep a media list of its own. So media-scanner gets its own
feedback, on a button that also refreshes the library.

## Tests

```bash
npm test
```

This runs the module's actual code against a pretend caspar-avd (over real HTTP
and a real WebSocket). It checks that the three health signals stay separate,
that missing telemetry isn't mistaken for nothing playing, that `file/time` is read as
`[position, duration]`, that pads fire by index, and both AMCP failure paths.

## Installing

It's not in the official Companion module store. The quick way is to download
`companion-module-caspar-av-pkg.tgz` from the
[releases page](https://github.com/stoatworks-labs/companion-module-caspar-av/releases) and
import it with Companion's **Modules → Import module package**. Or install it as a developer
module through **Settings → Developer modules path**.

<!-- attributions:start -->
This project is built on other people's work — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
<!-- attributions:end -->

## Licence

MIT, see [LICENSE](LICENSE).
