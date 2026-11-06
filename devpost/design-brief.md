---
status: approved
---

# Design brief: Threshold

<!-- Filled in by plan-lens from Sam's interview (2026-11-04). Sam's words are quoted. Anything Sam didn't choose is marked (default). -->

## The one spatial moment
Someone living with Parkinson's walks through their home toward "a doorway that has previously caused them difficulty," and stops. Their "feet aren't responding as expected." Threshold notices and a floating chevron asks them to look down. Stepping lines show on the floor ahead and "a gentle, rhythmic sound" gives them a beat to follow. "As they begin walking again, Threshold recognises that movement has resumed and gradually removes the cues." The guiding idea: "It intervenes when necessary and gets out of the way when it is no longer needed."

## Who it's for
- **Primary user:** the person wearing the glasses, someone living with Parkinson's who has freezing of gait, often at particular doorways. They are "hands-free during walking."
- **Physiotherapist:** before the walk, marks doorways and sets line spacing, beat speed and first-line distance. During the walk, watches. Afterwards, reviews what happened by talking with the wearer, not through records in the Lens.
- **Caregiver:** helps identify doorways and can do the setup. During the walk, gives reassurance "without unnecessarily interrupting."
- Sam's principle: "The physiotherapist and caregiver should support the experience, not become operators whom the person depends on every time they need to walk."

## Why it belongs on glasses
- **Uses:**
  - **Draws in the world:** stepping lines anchored to the floor ahead.
  - **Leaves your body free:** the wearer never presses, holds or confirms anything.
- **Why it's better than the phone or laptop version:**
  - A phone or watch "introduces another task at precisely the wrong moment."
  - A smartwatch "cannot naturally display spatial walking instructions on the floor."
  - Laser shoes need "specialised footwear or hardware," while glasses bring visual guidance, sound and context together in one experience.
  - Sam's caveat: "glasses are not automatically better than laser shoes."

## Product or overlay
- **Type:** overlay. It responds to the wearer stopping at a real doorway that has been marked as a trouble spot.
- **What the real version would sense:**
  - The wearer's head position and direction, to tell whether they stopped at a marked doorway and are facing it.
  - The real floor, to lay the lines on.
  - It does **not** recognise doorways by itself. Doorways are marked on purpose: "I would not want Threshold independently labelling every doorway as dangerous."
- **Stand-in for the preview:**
  - A virtual room with **two** virtual doorways at real size: one gets marked during setup and the other stays ordinary.
  - A virtual floor.
  - In Interactive Preview, the W, A, S and D keys are walking and the mouse moves the head.
  - Stop detection and the facing check use the preview camera's real position and direction. They are not faked.

## Where things live
- **Where the user is looking during the main task:** first ahead at the marked doorway. Then, after the chevron prompt, down toward the floor in front of the doorway.
- **Room (stand-in):**
  - Two doorways side by side in a wall about 4 m ahead of the start, about 2 m apart centre to centre (default).
  - Each opening is about 110 cm wide by 210 cm tall (default).
  - Eyes are about 150 cm above the floor (default).
  - Normal doorway: "Ordinary doorway appearance." No border, marker, lines or doorway sound.
- **Marked indicator:**
  - A "subtle, persistent outline around the doorway" and a "small visual marker near the upper corner of the frame."
  - The outline is about 2 cm thick and the marker is about 8 cm across, in a soft light colour, not red (default).
  - "No large warning sign or flashing red graphics. The objective is not to communicate danger. It is to communicate that Threshold recognises this location."
- **Floating chevron:**
  - Sits about 1 m ahead, "slightly below the centre of the visual field" (about 15 cm below eye line, default).
  - A downward-pointing chevron about 15 cm wide with the short text "LOOK DOWN" in light capitals about 4 cm tall (default).
  - "Smoothly catches up when the wearer turns their head," with "gentle smoothing and a limited movement speed." It must not "chase every tiny head movement" and is "not a HUD element attached to the user's face."
- **Stepping lines:**
  - Three lines (Sam said "two or three"; three is the default) lie flat on the floor across the path toward the marked doorway.
  - They are "spatially anchored to the virtual environment, not simply drawn at fixed screen coordinates."
  - The farthest line is **2.5 m** ahead of where the person stood when the cue started. The others step back toward the person **40 cm** apart: 2.5 m, 2.1 m and 1.7 m.
  - Changing the first-line distance moves all three lines and keeps their spacing. The lines sit at the first-line distance, then minus one spacing, then minus two spacings. A line that would land closer than 30 cm in front of the person isn't drawn (default).
  - They come into view one at a time as the head tilts down, at about 12°, 17° and 23°. "Don't require all three lines to be visible simultaneously."
  - Never "move the floor lines upwards to force them into the display."
  - Each line is about 60 cm long and 4 cm wide, in bright cyan (default).
  - The direction runs from the person toward the centre of the marked doorway (default).
- **Beat:** a gentle, steady tick at the beat speed (90 BPM). It's spatial sound coming from the marked doorway (default). It should be "clearly distinguishable from environmental noise" and "free of unnecessary spoken instructions."
- **Setup panel:**
  - A UI Kit panel about 32 × 38 cm, about 1 m in front of the start spot and a little below eye level (default). It was 32 × 28 cm until 2026-11-06. Sam then approved growing it so the targets are easier to pinch, following the hackathon judges' "big buttons" advice.
  - Buttons: **Marking Mode**, **Mark as Trouble Spot**, **Finish Setup**, each about 6 cm tall. The slider knobs are about 4 cm.
  - Three sliders, each showing its value as a number:
    - **Line spacing** 40 cm (range 20–80 cm, default)
    - **Beat speed** 90 BPM (range 60–120 BPM, default)
    - **First-line distance** 2.5 m (range 1.0–3.5 m, default)
  - The settings are independent: "changing the line spacing should not automatically change the beat speed."
  - After Finish Setup, the panel shrinks to a small **Setup** button so it's out of the walker's way and can be reopened between trials (default).

## Hands and input
- **Wearer:** none. They don't press buttons, reach for a phone, use a controller, confirm a cue or switch the lines on.
- **Physio or carer, before the walk, on the same glasses:**
  1. Pinch **Marking Mode**.
  2. Point at the virtual doorway and pinch it. The selected doorway highlights (default).
  3. Pinch **Mark as Trouble Spot**.
  4. Pinch **Finish Setup**.
- **Sliders:** drag to set line spacing, beat speed and first-line distance.
- In the preview a mouse click is the pinch. "There should be no controller-based interaction or alternative control system introduced just for this demo."
- Targets are big and highlight when aimed at.
- **Voice:** none.

## When things show
The Lens has three states, in Sam's words. These keep the cue from "switching on and off unpredictably."
- **MONITORING:** "Watching for a potential freeze at a marked doorway."
- **CUE_ACTIVE:** "Providing visual and audio guidance." This means the chevron, the floor lines and the beat.
- **RECOVERY:** "Detecting resumed movement and fading the cues."

Transitions:

| From | When | To |
|---|---|---|
| MONITORING | All the start conditions below are true | CUE_ACTIVE |
| CUE_ACTIVE | About 80 cm of forward movement | RECOVERY: everything fades over 1 s, then MONITORING |
| CUE_ACTIVE | Timeout: 15 s, or 8 s if the person never looked down | Everything fades over 1 s, then MONITORING. Outcome: **UNRESOLVED**, and no recovery is claimed |

**UNRESOLVED is an outcome, not a fourth state.** It has no visuals of its own. The state machine never treats a timeout as recovery.

- **Marked indicator:** shows from Mark as Trouble Spot until the session ends. Marks last for this session only.
- **The cue starts when all of these are true:**
  1. The person is in the marked doorway's area. That means within 1 m of the doorway plane on either side, and no more than 50 cm past either edge of the opening (default). Measure it the same way every time.
  2. They have stopped moving: average speed over about 0.5 s is below 5 cm/s (default).
  3. They stay stopped for **2 seconds** in a row.
  4. Their head points within **45°** of straight through the doorway for the whole 2 s (default). Work out "straight through" for **both** approaches, so someone coming from the other side isn't classed as facing away.

  An unmarked doorway never starts the cue, and neither does facing away. The facing check uses **head direction only**: "avoid claiming full body-orientation detection if it only tracks the headset."
- **When the cue starts:**
  - The chevron appears.
  - The lines are placed on the floor and can be seen whenever the head tilts down far enough.
  - The beat starts at the set speed.
  - "Synchronised" means the beat and the lines start and stop together. The beat starts when the cue starts, and it fades with the lines on recovery or timeout.
  - The beat keeps a steady rhythm at the set speed. It is not timed to lines coming into view.
  - The lines don't pulse or animate.
- **Chevron:**
  - It hides once the head tilts down enough for the farthest line to be in view, about 12° at the default distance. That counts as "looked down."
  - If the person hasn't looked down by **5 s**, the chevron fades and the beat continues (default reading).
- **Never looks down:** at **8 s** from the cue starting, everything fades and the Lens returns to monitoring.
- **Looked down but still not moving:**
  - Guidance continues for up to **15 s** from the moment CUE_ACTIVE begins, which is about 17 s from the first stop. Looking down does **not** reset the timer. Then everything fades over about 1 s.
  - "Looking down is engagement, not recovery. Movement is the recovery signal."
  - The beat never speeds up or gets louder. There are no flashing warnings.
- **Recovery:** after about **80 cm** of forward movement (toward the marked doorway) from where the cue started, everything fades over about **1 second** and the Lens returns to monitoring.
- **After a cue ends without recovery (UNRESOLVED):**
  - The attempt is recorded as unresolved for this session only. It isn't shown to the wearer and is written to the Lens Studio log (default).
  - The Lens never reports that the person has recovered.
- **Re-arming:** after a recovery or an unresolved ending, there is no new attempt until the person leaves the doorway area and comes back.
- **When the person can't see a floor, there are two cases:**
  - **The floor is out of view** because the wearer hasn't looked down. This is the normal case, and the chevron asks them to look down.
  - **No floor is detected** by the glasses' sensing of the room. This only happens on glasses. The Lens draws no lines and never shows "floating lines pretending to be anchored to a floor it cannot identify." Guidance is audio only, with the same timers, and the chevron doesn't show either (default).
- **If something needs attention out of view:** the floating chevron and the beat coming from the doorway point the person to it.

## Done criteria
Each one can be checked in Lens Studio's preview with W, A, S, D and the mouse. "The preview is functionally complete when all five tests can be demonstrated repeatedly without manually forcing the cue to appear or disappear."

1. **Doorway marking.**
   1. Pinch Marking Mode.
   2. Pinch a virtual doorway.
   3. Pinch Mark as Trouble Spot.
   4. Pinch Finish Setup.
   5. The marked doorway shows its outline and corner marker, and the other doorway is unchanged.
2. **Correct activation.**
   1. Walk to the unmarked doorway and stop. No cue appears.
   2. Stop at the marked doorway for less than 2 s. No cue appears.
   3. Stand at the marked doorway facing away for more than 2 s. No cue appears.
   4. Stand still facing the marked doorway for at least 2 s. The cue starts.
3. **Visual and audio guidance.**
   1. Trigger a cue.
   2. The floating chevron appears ahead and slightly below centre.
   3. Tilt the view down with the mouse.
   4. The floor lines come into view one at a time and stay fixed to the floor. The chevron hides.
   5. The beat plays at the set speed.
4. **Settings and engagement timeout.**
   1. Open setup and change line spacing and beat speed separately.
   2. Both values show as numbers.
   3. Trigger a cue and look down without moving.
   4. Guidance continues; looking down is not treated as recovery.
   5. The cue fades at 15 s and no recovery is reported.
5. **Movement and recovery.**
   1. Trigger the cue again.
   2. Walk through the doorway with W.
   3. After about 80 cm of movement, the lines, chevron and beat fade over about 1 s.
   4. Monitoring resumes and the doorway is still marked.

"These acceptance tests establish that the prototype's programmed behaviour works. They do not establish that it reliably detects clinical freezing or improves walking safety."

## Out of scope
- Recognising doorways automatically. Marking is always deliberate.
- Turns, obstacles and moving between spaces. These are later ideas; this version is about doorways only.
- Counting steps. The preview moves the camera smoothly with no footsteps, so recovery uses distance moved.
- Remembering marks between sessions, and any lasting records or reports.
- The physio or carer using their own device. That would mean two people sharing a Lens, which the preview can't show.
- An on/off control for the wearer. The existing on/off tile (`CueToggle`) is removed.
- Unmarking a doorway, voice and eye tracking.
- Letting the physio change the 15 s limit. That comes later.

## Risks and open questions
- **Detection is a guess, not a diagnosis.** "Two seconds of immobility cannot establish that a clinical freezing episode has occurred." Every number here is "an initial prototype" setting, not clinically validated: 2 s, 45°, 5/8/15 s, 80 cm, 40 cm, 90 BPM and 2.5 m.
- **Looking down may not be safe for everyone.** "Threshold must never assume that looking down or following a visual line is safe for every wearer. These interactions need supervised testing, particularly for balance, posture and turning."
- **Far lines.** Lines starting 2.5 m away are farther than the next step. "A longer distance is not automatically safer: visibility, depth perception and the person's actual ability to follow the projected path still need evaluation."
- **Tilt angles.** The angles (12°, 17°, 23°) assume SPECS' view, about 37° tall, and eyes about 150 cm up. If the preview's view is taller than the glasses', lines appear with less tilt in the preview. Feel unproven.
- **Head tracking jitter.** Real head tracking jitters, so stopping on glasses may not read as standing still unless speed is smoothed. An earlier spike found this. Feel unproven until tested on glasses.
- **Evidence warning.** Visual cues through HoloLens didn't reduce freezing during turns. "We need to establish where AR assistance works, where it doesn't, and whether the experience genuinely helps users."
- **Wording.** Never describe the thresholds as clinically validated, and never use the demo "to establish that the system prevents falls." Public wording (from `CLAIMS.md`): "a cueing aid to try with your physio; not a medical device."

## Already in this project (from the earlier spike)
The project already has a working version built before this interview, using values Sam didn't choose:
- `Assets/Scripts/CueDecider.ts` with states IDLE, CUEING and AUDIO_ONLY, a 1 s dwell and a 50 cm release.
- `CueController.ts`.
- `PinchToggle.ts` plus a `CueToggle` tile.
- `LookDownChevron`, `CueLines`.
- A one-doorway `Hallway`.
- LEAF scenarios T1–T6 in `Assets/Scripts/Tests/`.

Where it differs from this brief, **the brief wins**. Reuse what fits, and remove the wearer toggle. Replace the old scenarios with tests for the five done criteria above.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
