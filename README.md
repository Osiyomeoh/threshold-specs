# Threshold

A Lens for Snap Specs. Someone living with Parkinson's stops at a doorway that has given them trouble before. Threshold notices, and a chevron asks them to look down. Stepping lines show on the floor ahead and a steady beat plays from the doorway. Once they walk on, the cues fade.

**A cueing aid to try with your physio; not a medical device.**

**Demo video (2:40):** https://youtu.be/D0Uo5_ValxE. It includes an uncut recording of the Lens in the Lens Studio preview.

Built for Learn AR with SPECS (Devpost). The design brief is in [`devpost/design-brief.md`](devpost/design-brief.md).

## Try it in 1 minute (Lens Studio preview)

1. Open `Specs Base Template.esproj` in **Lens Studio 5.23.2**.
2. In the Preview panel, choose the Specs device and **Interactive Preview**. You start in a stand-in room with two doorways about 4 m ahead.
3. On the setup panel, click (click = pinch): **Marking Mode** → the left doorway → **Mark as Trouble Spot** → **Finish Setup**. The marked doorway gets a soft outline and a small corner marker. The other one stays plain.
4. Walk to the marked doorway with **W A S D** and stop, facing it. After 2 s the chevron appears.
5. Look down with the mouse. Three cyan lines come into view one by one on the floor, and the beat plays.
6. Press **W** and walk through. After about 80 cm, everything fades over about 1 s.

The small **Setup** button (bottom right) reopens the panel. It has sliders for line spacing, beat speed and first-line distance.

No keys, accounts or internet are needed. The Lens makes no network calls.

## Who it's for

- **The wearer**, who has freezing of gait, often at particular doorways. They never press, hold or confirm anything while walking.
- **A physiotherapist or carer**, who marks doorways and sets the sliders on the same glasses before the walk, then steps back.

Doorways are only ever marked on purpose. Threshold does not label doorways by itself.

## Why glasses

A phone or watch adds a task at the worst moment and can't draw a path on the floor. Laser shoes need special footwear. Glasses can put the lines where the feet go and play the beat from the doorway, while the hands stay free.

## How it works

| State | What happens |
|---|---|
| **MONITORING** | Watches for a stop at a marked doorway. |
| **CUE_ACTIVE** | Starts when the person is within the doorway's area, has been stopped (under 5 cm/s) for 2 s, and their head points within 45° of straight through, from either side. Shows the chevron, places the lines on the floor and starts the beat. |
| **RECOVERY** | After about 80 cm of forward movement, everything fades over 1 s, then back to MONITORING. |

- If nothing changes, the cue ends at 15 s, or at 8 s if they never looked down. That outcome is logged as **UNRESOLVED**, and recovery is never claimed.
- Looking down is engagement, not recovery. Only movement counts as recovery.
- After any ending, a new cue needs the person to leave the doorway area and come back.
- Lines are anchored to the floor and never lifted into view. With no floor detected, there are no lines; the beat plays alone.

Main scripts in `Assets/Scripts/`:
- `CueDecider.ts`: the state machine. Pure logic with no scene references.
- `CueController.ts`: runs the cue (chevron, lines, beat, fades).
- `Doorway.ts`: one doorway and its marked indicator.
- `ThresholdSetupUI.ts`: the UI Kit setup panel.

The room and doorways are a stand-in for the preview. Stop detection and the facing check use the preview camera's real position and direction.

## Tests

**LEAF**, one scenario per done criterion in the brief, in `Assets/Scripts/Tests/`. All five passed in the Lens Studio preview on 2026-11-04 (twice) and 2026-11-06 (twice, the second time after the panel was made bigger).

| Scenario | What it checks |
|---|---|
| C1_DoorwayMarking | Marking one doorway; the other stays unchanged. |
| C2_CorrectActivation | No cue at the unmarked doorway, for a stop under 2 s, or when facing away. A cue after 2 s facing the marked doorway. |
| C3_VisualAudioGuidance | Chevron position and size, lines coming into view as the head tilts, chevron hiding, beat at the set speed. |
| C4_SettingsAndTimeout | Sliders change separately and show numbers. Looking down without moving is not recovery. Fade at 15 s, UNRESOLVED. |
| C5_MovementRecovery | Recovery after about 80 cm, a 1 s fade, and the doorway still marked. |

`X1_BriefExtras` covers other rules from the brief: the first-line distance slider, the chevron's 5 s fade, and audio only when no floor is detected.

To run them: open the LEAF panel in Lens Studio and run each scenario on its own.

**Logic tests** for `CueDecider.ts` (15 tests, Node 22.18 or newer):

```
node --test tests/CueDecider.test.ts
```

What the tests don't show: LEAF drives a scripted user, not a hand on a mouse. Nothing has been run on Specs glasses, so real hand tracking, head-tracking jitter and real floor detection are untested.

## Limits

- Stopping for 2 s is a guess, not a diagnosis of a freeze. Every number here (2 s, 45°, 5/8/15 s, 80 cm, 40 cm, 90 BPM, 2.5 m) is a first prototype setting. None of them is clinically validated.
- Looking down, or following a line, may not be safe for everyone. It needs supervised testing.
- Visual cues on HoloLens did not reduce freezing during turns ([study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7105859/)). Whether this helps people is an open question.
- Marks last for one session. Nothing is stored or reported.
- On glasses the stand-in room is off, so doorways can't be marked on a device yet.

## How it was built

- The `plan-lens` skill interviewed me and wrote the design brief.
- Claude Code with the Lens Studio MCP and the CLAD agent toolkit built the Lens from the brief, then wrote and ran the LEAF scenarios.
- When the brief and an earlier spike disagreed, the brief won.

### Built with / prior work

None of this was written before the hackathon. It uses:
- the Lens Studio Specs Base Template
- Spectacles Interaction Kit 2.0.0 and Spectacles UI Kit 2.0.0
- LEAF 2.0.2 for the scenario tests
- code and assets generated by CLAD, including the beat tick in `Assets/GeneratedSFX/`, which was synthesised locally with no samples
- the hackathon skill pack's brief template (`plan-lens`)

## License

MIT. See [LICENSE](LICENSE).
