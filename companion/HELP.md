# caspar-AV

Controls a [caspar-AV](https://github.com/stoatworks-labs/caspar-av) show.

## Connection

Point this at **caspar-avd**, the daemon — not at CasparCG itself. Same address
as the console, port 8080 by default.

## Prefer cues over stacked transport buttons

caspar-avd compiles a cue into one `BEGIN`/`COMMIT` batch, so every touched
channel is released on the same frame. Three separate transport actions on one
button land on three different frames.

## Three health lights, not one

| Light                         | Answers                             |
| ----------------------------- | ----------------------------------- |
| caspar-avd is connected       | Can Companion reach the daemon?     |
| CasparCG is connected         | Can the daemon reach CasparCG?      |
| **OSC telemetry is arriving** | Does anyone know what is on screen? |

Commands can work perfectly with telemetry dark — CasparCG pushes its monitor
state over OSC rather than answering questions over AMCP. While it is dark,
every "is this playing" colour is **unknowable**, not false. Put that light on
any page carrying playing colour.

## Intent vs reality

- **Screen is enabled** — the show's configuration.
- **Screen is playing / paused / near its end** — what CasparCG is actually
  doing.

They are never merged. A disagreement is information.

## Pad buttons survive a re-lay-out

Pad presets fire by **position**, not by cue id. The blue lights while that pad
still holds the cue the button was built for.

## Raw AMCP

A two-word command puts its target **between** the words:

```
MIXER 1-10 FILL 0 0 0.5 0.5      ✓
MIXER FILL 1-10 0 0 0.5 0.5      ✗ 400 ERROR
```

Batches can answer **COMMIT PARTIAL** — an inner command failed. That is logged
as a warning rather than passing as success.

## media-scanner

Not optional in CasparCG 2.5: the media and thumbnail commands are proxied to it
and answer 501 without it. The **SCANNER** preset shows its state and refreshes
the library when pressed.
