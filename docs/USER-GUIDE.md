# Companion — caspar-AV user guide

This module drives a [caspar-AV](https://github.com/stoatworks-labs/caspar-av) show from a Stream
Deck or any other Bitfocus Companion surface: **fire cues and pads, run transport on any screen,
and see what CasparCG is actually doing.**

The [README](../README.md) covers installing the module. This is how to build a surface with it.

> **Before you rely on this:** point it at **caspar-avd, the daemon** — not at CasparCG itself.
> Rehearse a page before a show; this drives a live playback server with no confirmation step.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

The same address as the console, port **8080** by default.

---

## Fire a cue rather than stacking transport buttons

This is the most important thing on the page.

caspar-avd compiles a cue into **one `BEGIN`/`COMMIT` batch**, so the server locks every touched
channel and releases them **on the same frame**. That is the whole reason cues exist rather than
being a list of buttons.

**A Companion button firing three separate screen actions lands them on three different frames.**
If a change has to be simultaneous — and on a multi-screen look it usually does — put it in a cue
and fire the cue.

An action naming an unknown screen fails the **entire** cue rather than firing the ones that
resolve. Half a cue on stage is worse than none.

---

## Three health lights, not one

Conflating them sends people to the wrong fault:

| Light | Question it answers |
| --- | --- |
| **caspar-avd is connected** | Can this module reach the daemon? |
| **CasparCG is connected** | Can the daemon reach CasparCG? |
| **OSC telemetry is arriving** | Does anyone know what is on screen? |

**The third is the subtle one, and it is the one to put on every page carrying playing colour.**

CasparCG answers no "what is playing" question over AMCP — it *pushes* its monitor state as OSC.
So commands can work perfectly while the module knows nothing at all, and every "is this playing"
feedback reads false. That is **unknowable**, not **not playing**, and the difference matters when
someone is deciding whether to fire a cue again.

---

## Intent and reality are never merged

- **Screen is enabled** reads the show — what it is *configured* to do.
- **Screen is playing / paused / playing a specific file / near its end** read telemetry — what
  CasparCG is *actually* doing.

caspar-avd never merges the two and neither does this module. **If they disagree, that is
information**, not a bug to reconcile.

**Clip near its end** is the one worth a dedicated button on a show where something has to follow
a clip out.

---

## The pad grid survives a re-lay-out

Pad presets fire by **pad position**, not by cue id — so a Stream Deck laid out to mirror the grid
stays correct when the show is re-laid-out.

The blue feedback lights while that pad still holds the cue the button was built for. When the
show changes underneath, the button still fires the right *pad*, and the blue tells you whether it
is still the cue you meant.

---

## Raw AMCP, and the mistake everyone makes

A two-word AMCP command puts its target **between** the words:

```
MIXER 1-10 FILL 0 0 0.5 0.5      ✓
MIXER FILL 1-10 0 0 0.5 0.5      ✗ 400 ERROR
```

Batches can answer **COMMIT PARTIAL**, meaning an inner command failed. This module logs that as a
warning rather than letting it pass as success — so check the log after a batch that looked fine
but did not land.

---

## media-scanner is not optional

In CasparCG 2.5 the media and thumbnail commands are **proxied to media-scanner**, and answer 501
without it running.

The **SCANNER** preset shows its state and refreshes the library when pressed. If media commands
return 501, that is what to look at first.

---

## Building a surface that fails safe

1. **Cues for anything that must be simultaneous.** Transport buttons are for single-screen work.
2. **All three health lights** on the main page.
3. **OSC telemetry** specifically on any page with playing colour — otherwise the colour lies by
   omission.
4. **Pad grid mirroring the show's grid**, so muscle memory transfers.
5. **Near-its-end** where the operator can see it, if anything has to follow a clip out.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| **Every "playing" light is off but video is on screen** | OSC telemetry is not arriving. It is unknowable, not stopped. |
| **A multi-screen change arrives ragged** | Separate transport actions on one button land on separate frames. Use a cue. |
| **A cue fired nothing at all** | One of its actions names a screen that does not exist, and that fails the whole cue by design. |
| **A raw AMCP command returns 400** | Two-word command with the target in the wrong place. See above. |
| **Media commands return 501** | media-scanner is not running. |
| **A batch reported success but only half landed** | Look for COMMIT PARTIAL in the log. |

---

## See also

- [README](../README.md) — installing, and the full action/feedback/variable list
- [`companion/HELP.md`](../companion/HELP.md) — the same material, in Companion's help panel
