# Companion — caspar-AV user guide

This module runs a [caspar-AV](https://github.com/stoatworks-labs/caspar-av) show from a Stream
Deck or any other Bitfocus Companion surface. It fires cues and pads, runs transport on any
screen, and shows you what CasparCG is actually doing.

The [README](../README.md) covers installing the module. This guide is about building a surface
with it.

> **Before you rely on this:** point it at **caspar-avd, the daemon**, not at CasparCG itself.
> Rehearse a page before a show: this drives a live playback server and there's no confirmation
> step.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

Use the same address as the console, port **8080** by default.

---

## Fire a cue rather than stacking transport buttons

If you only read one section, make it this one.

caspar-avd compiles a cue into **one `BEGIN`/`COMMIT` batch**, so the server locks every channel
the cue touches and releases them all **on the same frame**. That's the reason cues exist at all,
rather than being a list of buttons.

**A Companion button that fires three separate screen actions lands them on three different
frames.** If a change has to happen all at once (and on a multi-screen look it usually does), put
it in a cue and fire the cue.

If an action names a screen that doesn't exist, the **entire** cue fails rather than firing the
bits that do resolve. Half a cue on stage is worse than none.

---

## Three health lights, not one

Lumping them together sends people off looking for the wrong fault:

| Light | Question it answers |
| --- | --- |
| **caspar-avd is connected** | Can this module reach the daemon? |
| **CasparCG is connected** | Can the daemon reach CasparCG? |
| **OSC telemetry is arriving** | Does anyone know what is on screen? |

**The third one's the sneaky one, and it's the one to put on every page that shows playing
colour.**

CasparCG won't answer any "what's playing?" question over AMCP; it *pushes* its monitor state out
as OSC instead. So your commands can all work fine while the module knows nothing at all, and
every "is this playing" feedback reads false. That false means **unknowable**, not **not
playing**, and the difference matters when someone's deciding whether to fire a cue again.

---

## Intent and reality are never merged

- **Screen is enabled** reads the show: what it's *configured* to do.
- **Screen is playing / paused / playing a specific file / near its end** read telemetry: what
  CasparCG is *actually* doing.

caspar-avd never mixes the two, and neither does this module. **If they disagree, that tells you
something.** It isn't a bug for anything to smooth over.

**Clip near its end** is worth a button of its own on a show where something has to follow a clip
out.

---

## The pad grid survives a re-lay-out

Pad presets fire by **pad position** rather than by cue id, so a Stream Deck laid out to match the
grid stays right when the show gets re-laid out.

The blue feedback lights while that pad still holds the cue the button was built for. When the
show changes underneath you, the button still fires the right *pad*, and the blue tells you
whether it's still the cue you meant.

---

## Raw AMCP, and the mistake everyone makes

A two-word AMCP command puts its target **between** the words:

```
MIXER 1-10 FILL 0 0 0.5 0.5      ✓
MIXER FILL 1-10 0 0 0.5 0.5      ✗ 400 ERROR
```

Batches can answer **COMMIT PARTIAL**, which means a command inside failed. The module logs that as
a warning rather than letting it pass as a success, so if a batch looked fine but didn't land,
check the log.

---

## media-scanner is not optional

In CasparCG 2.5 the media and thumbnail commands get **passed on to media-scanner**, and answer 501
if it isn't running.

The **SCANNER** preset shows its state and refreshes the library when you press it. If media
commands come back 501, look there first.

---

## Building a surface that fails safe

1. **Cues for anything that has to happen all at once.** Transport buttons are for single-screen
   work.
2. **All three health lights** on the main page.
3. **OSC telemetry** on any page with playing colour, specifically. Without it the colour lies by
   omission.
4. **A pad grid that matches the show's grid**, so muscle memory carries over.
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

- [README](../README.md): installing, and the full list of actions, feedbacks and variables
- [`companion/HELP.md`](../companion/HELP.md): the same material, in Companion's help panel
