# Spike result: 1-hour kill test (2026-11-02)

> **Correction (2026-11-04, afternoon):** the LEAF blocker below was wrong. The Asset Library lists Leaf 2.0.0, 2.0.1, 2.0.2 and 4.0.0; the spike only saw 4.0.0 because the search returned the most recent version only (`onlyMostRecent: true`). **Leaf 2.0.2 is now installed and compiles with 0 errors on Lens Studio 5.23.2 with SIK 2.0.0 + UIKit 2.0.0.** No Lens Studio upgrade is needed, and "needs LS 5.25" below is withdrawn (5.25 is not a released version we can install). The original text is kept for the record.

**Verdict: PASS, except that the scenarios ran as a plain TypeScript test rather than in LEAF** (see "Interactive Preview walk test" below).

Under the strict spike rule this was first called KILL, because LEAF was still failing after 2 attempts. That call was overruled because the blocker was the test toolchain's version requirements (LEAF 4 needs a newer Lens Studio; see the correction above: Leaf 2.0.2 works), not the idea. Both scenarios then passed as a plain TypeScript test, and the walk test in Interactive Preview passed.

- **Lens Studio version:** 5.23.2.26081320 (Specs Base Template, Spectacles Interaction Kit 2.0.0, UI Kit 2.0.0)
- **Time:** started 14:14:35. Build done ≈14:27; LEAF attempt 1 blocked ≈14:29; attempt 2 blocked ≈14:44. About 30 minutes in total.
- **Agents:** `specs-experience-builder` for the scene and scripts, `live-lens-tester` for LEAF.

## PASS criteria

| Criterion | Result |
|---|---|
| LEAF scenario 1 (walk through the zone at 1 m/s → IDLE) | Not run: LEAF doesn't compile |
| LEAF scenario 2 (stop in the zone for 1.2 s → CUEING) | Not run: LEAF doesn't compile |
| Lines appear after stopping with WASD in Interactive Preview | Not checked: the project's TypeScript compile is broken |

## Follow-up: test of the scenarios without LEAF

The KILL was overruled because the blocker was the toolchain, not the concept. The two scenarios were run as a plain TypeScript test under Node 24 (`--experimental-strip-types`) against the real, unmodified `Assets/Scripts/CueDecider.ts`. Zone: centre (0, -400), radius 100 cm, samples at 60 Hz.

```
PASSED  Scenario 1: walk through zone at 1 m/s → IDLE  — 361 samples, final=IDLE, everCUEING=false
PASSED  Scenario 2: stop in zone for 1.2 s → CUEING  — final=CUEING, IDLE before 1.0 s=true, first CUEING after 1.000 s held
```

**Jitter check (information only):** standing still for 3 s with random jitter of ±0.02 cm per frame still cues. At ±0.05 cm per frame and above it **never cues**. Real head tracking jitters more than 0.5 mm per frame, so before any device test `CueDecider` needs its speed averaged over a short window (e.g. 0.25–0.5 s).

The test file is outside the project: `/private/tmp/claude-501/-Users-MAC-Documents-specs-threshold/80c513f1-b1c4-4932-8fb7-f7240eb5f5cd/scratchpad/cuetest/cue.test.ts`.

### Interactive Preview walk test (2026-11-04, after restoring the packages)

The camera was driven with `MovePreviewCamera`, and the state was read from CueController's logs:

- **Walk through the zone** (z 0 → −600, crossing the doorway zone without stopping): **IDLE the whole time**, with no CUEING line.
- **Stop at the door** (z → −400, then stand still): arrived at t=21.77 s, **`state -> CUEING` at t=22.77 s** (dwell 1.00 s), and it stayed CUEING.
- **Screenshot:** facing back toward the start and looking down from the door, the cyan floor lines are visible (`/private/tmp/claude-501/-Users-MAC-Documents-specs-threshold/80c513f1-b1c4-4932-8fb7-f7240eb5f5cd/scratchpad/cueing_at_door.png`). Errors in the preview: none.

**Revised verdict: PASS, except that the scenarios ran as a plain TypeScript test rather than in LEAF.** ~~LEAF remains blocked until Lens Studio is upgraded to 5.25.~~ Withdrawn: Leaf 2.0.2 works on 5.23.2 (correction above).

**Caveats:**
- **The move was a teleport, not a walk.** `MovePreviewCamera` jumps the camera from one position to the next, so walk 1 crossed the zone in a fraction of a second rather than at walking speed.
- **The lines are behind you at the door.** As specified, they sit 2.5–3.5 m from the start, but the zone centre (the door) is at 4 m. Someone who stops at the door doesn't see them unless they turn around. Either place the lines relative to where the user stops, or rethink the spec. *Fixed: see "Fix: lines placed in front of the user" below.*
- **The click wasn't heard.** Nobody listened to it. *Partly addressed: the audio engine now reports it playing while CUEING (see below), but nobody has heard it yet.*
- **Tracking noise.** `CueDecider` needs speed averaging before any test on device (see the jitter check above).

### Fix: windowed speed (2026-11-04)

`CueDecider` no longer uses frame-to-frame speed.

**How speed is measured now:** speed = the largest XZ distance from the current position to any sample in the last `SPEED_WINDOW_S` = 0.5 s, divided by that span. Once a full window qualifies, the dwell is backdated to the window's start, so the cue still fires about 1.0 s after the user actually stops.

**Unchanged:** the public API, apart from a new `speedWindowS` option and the `SPEED_WINDOW_S` constant. `CueController` is untouched.

**Results:**
- **Test suite** (13 checks): ALL PASSED. That covers both scenarios, the builder's regression checks (0.9 s → IDLE, 1.0 s → CUEING at exactly 1.000 s, outside the zone, on the zone's edge, 4 vs 6 cm/s, a jump after cueing) and jitter.
- **Jitter:** ±0.05 / 0.1 / 0.3 / 0.5 cm per frame now cue at 1.000 s, where ±0.05 cm used to break it. ±1 cm still cues; ±2 cm per frame does not.
- **Trade-off:** after a sudden stop from 1 m/s, the cue fires one frame early (0.983 s), because the averaging can't pin the stop to better than one frame. The scenario 2 assertion allows 1 frame for this.
- **Preview re-run:** walking through stays IDLE, and stopping at the door gives CUEING about 1.0 s after arriving. Compile and preview are clean, and no packages were added.

### Fix: lines placed in front of the user (2026-11-04)

**This is a deliberate change from the spike spec.** The spec put the lines 2.5–3.5 m from the camera start, which is behind someone who stops at the door.

**How placement works now:** `CueController` moves the lines when the cue fires.
- Line *i* sits `firstLineAheadCm + i × lineSpacingCm` ahead of the user, along their horizontal facing. The defaults give 0.5, 1.0 and 1.5 m.
- Each line is rotated to lie across the user's path and keeps its authored floor height.
- The facing comes from the camera's `back` vector projected onto the floor. If the user is looking almost straight down, it falls back to the direction toward the doorway.
- The position is fixed at the moment the cue fires; the lines don't follow later head turns.
- Three new inputs control this: `anchorLinesToUser` (true), `firstLineAheadCm` (50) and `lineSpacingCm` (50). Setting `anchorLinesToUser` to false restores the spec's fixed placement.
- The new inputs use literal defaults, and they arrived in the scene as 50 / 50, unlike the old `zoneRadiusCm` problem.

`CueDecider.ts` is unchanged.

**Results (preview, driven by `MovePreviewCamera`, state read from the logs):**

| Check | Result |
|---|---|
| Walk-through 0 → −600 cm | IDLE throughout, `audio=false` |
| Stop at the door, facing −Z | CUEING ≈1.0 s after arriving. Lines placed with `dir=(0.00, -1.00)`, first at (0, −450), i.e. 50 cm past the door. All three are visible when looking about 60° down (`lines_ahead_steep.png`). |
| Stop at (−40, −360), facing 45° right and looking down | CUEING. `dir=(0.71, -0.71)`, first at (−4.6, −395.4), exactly as predicted. The lines lie perpendicular to the view (`lines_ahead_diagonal.png`). |
| Audio | The 1 Hz trace shows `audio=true` on every CUEING line and `false` on every IDLE line. `isPlaying()` updates one frame late, so it reads false immediately after `play()` and true immediately after `stop()`. |
| Node test suite | ALL PASSED (13 checks; unchanged, as expected) |

The screenshots are in `/private/tmp/claude-501/-Users-MAC-Documents-specs-threshold/80c513f1-b1c4-4932-8fb7-f7240eb5f5cd/scratchpad/`.

**New limitations found:**
- **First line out of view.** At 0.5 m ahead it sits about 72° below eye level. In the preview it is only visible when looking about 60° down, and the narrower field of view on Specs makes this worse. Try `firstLineAheadCm` ≈ 100–150 on device. *Changed to 100 cm: see "Update: first line at 100 cm" below.*
- **No wall awareness.** The lines are 2 m wide and centred on the user's path. When facing diagonally, the far line passes through the hallway wall; on device it would pass through real walls.
- **Past the virtual floor.** In the virtual hallway the third line lands past the end of the floor (z = −550 against a floor that ends at −500). This is cosmetic only.

### Update: first line at 100 cm (2026-11-04 09:20)

`firstLineAheadCm` is now 100, set both as the script default and on the scene's CueController component. The project is saved. With the default 50 cm spacing, the lines now sit 1.0, 1.5 and 2.0 m ahead of the user.

- **Checked in preview:** at startup the log prints `firstAhead=100cm`. Stopping at the door gives CUEING, with the first line at (0, −500). All three lines are visible when looking only about 38° down, compared with about 60° before (`lines_first_100cm.png` in the scratchpad).
- **Found along the way:** changing an `@input` default in the script does **not** update a component that is already in the scene. That component keeps its saved value, so the preview still printed 50 after the script change. The value had to be set on the component itself (scene-graphql `setProperty`). This is the reverse of builder item 4: there, a new input's default was lost; here, an existing input's saved value outlives the new default.
- **Virtual floor:** all three lines now sit past the end of the virtual floor (z = −500 to −600 against a floor that ends at −500). This is cosmetic only; on device the real floor continues. *Fixed at 09:42: the floor now runs past the door (see below).*

### Update: floor extended past the door (2026-11-04 09:42)

`Hallway/Floor` now runs from z = +50 to **−750** (position z −225 → −350, scale z 550 → 800), which is 3.5 m past the door. That covers the worst case: someone stopping at the far edge of the zone (−500) puts the third line at −700. The project is saved.

- **Walls:** extended at 09:45 to match the floor. `WallLeft` and `WallRight` now run z +50 → −750 (position z −350, scale z 800), so the corridor is enclosed past the door (`walls_extended.png` in the scratchpad).
- **Preview check:** after stopping at the door, all three lines (−500, −550, −600) sit on the floor (`floor_extended.png` in the scratchpad).

### More things that went wrong (sessions 2–3)

1. **Lens Studio crashed** at some point between 14:44 on 11-02 and 08:31 on 11-04 (`CrashLog-2026-11-04-08-31-33-875-289dc.txt`).
2. **Compiler kept a stale config.** After the 6 package removals, `RecompileTypeScriptTool` reported "TypeScript compiler is not configured (no TypeScript files in project)" although both .ts files were on disk and imported.
3. **Lens Studio locked itself out.** The `save` → `setDefaultProject()` → `openProject(threshold)` recovery failed with "Project is currently in use by another instance of Lens Studio", even though the lock file belonged to the same running process. A manual reopen by the user fixed it.
4. **The scene query tool also installs the agent packages.** **`QueryRuntimeSceneTool` installs the same `AiPreviewAgentInspect` / `Icons` / `Motion` packages and the `AiPreviewAgent Handler` scene object as `CaptureRuntimeViewTool`**, then fails with "handler was installed but didn't respond". On LS 5.23.2 with SIK 2, avoid both tools. Read state from logs, and take screenshots with `PreviewPanelTool screenshot`, which is safe.
5. **Type error in the removal call.** In `ExecuteEditorCode`, `assetManager.remove(new Editor.Path(...))` fails type-checking (Path is not SourcePath) and needs an `as any` cast.

## What was built (works up to the LEAF install)

- **Hallway:** 2 m wide, door frame at 4 m (-Z).
- **`Assets/Scripts/CueDecider.ts`:** pure logic with no scene references.
  - Its rule: CUEING once horizontal (XZ) speed stays below 5 cm/s for at least 1.0 s inside a zone.
  - The builder checked it offline with Node: still for 1.0 s → CUEING; still for 0.9 s → IDLE; 4 cm/s → CUEING; 6 cm/s → IDLE; standing still outside the zone → IDLE; exactly on the zone's edge → CUEING.
- **`Assets/Scripts/CueController.ts`:** each frame it passes the camera position to CueDecider. On CUEING it shows 3 cyan lines at 2.5, 3.0 and 3.5 m and loops `DoorClick.wav` as spatial audio from the doorway.
- **Compile and preview:** both were clean before LEAF. With the zone radius set to 500 cm temporarily, the preview switched to CUEING at 1.01 s. The radius was then set back to 100 cm. The click was never confirmed by ear.

## What CLAD got wrong (for the technical write-up)

### Scene build (`specs-experience-builder`)

1. **Wrong project:** it started in an unsaved temporary Base Template project, not the threshold folder, and its first VirtualScene read wrote into the temporary project.
2. **Wrong tool name:** it called the MCP tool by its bare name (`VirtualScene`), which failed with "No such tool".
3. **Wrong input path:** it first wired script inputs through `components.CueController.<input>`. The correct path is `components.ScriptComponent.<input>`.
4. **Radius default lost:** the `@input zoneRadiusCm = 100` default arrived in the scene as 0, silently. With radius 0 the cue could never fire.
5. **No Audio Listener:** spatial audio was turned on without an AudioListenerComponent, which caused 46 preview warnings.
6. **Capture tool broke the build:** `CaptureRuntimeViewTool` silently installed `AiPreviewAgentInspect`, `Icons` and `Motion` plus a scene object. Their example scripts import packages this project doesn't have, so the TypeScript compile broke with 7 TS2307 errors, and the capture never answered.
7. **Compiler wedged:** removing those packages during a compile wedged the compiler ("Invalid transition from Immutable to Mutable"). The fix was `setDefaultProject()` then `openProject(threshold)`.
8. **Lines start out of view:** the cue lines sit 23–31° below eye level from the start position, outside the preview's field of view, so the user has to look down to see them.
9. **Untested risk, tracking noise:** speed is measured raw from one frame to the next. At 60 fps, about 0.08 cm of jitter per frame already equals 5 cm/s, so real head tracking may keep resetting the dwell.

### LEAF (`live-lens-tester`): the kill cause

1. **Only one LEAF version (wrong, see correction):** the search showed only LEAF 4.0.0 because it returned the most recent version only; 2.0.0–2.0.2 are also listed. The install skill says to match LEAF to the SIK version, which isn't possible here.
2. **Attempt 1:** LEAF 4.0.0 imports `InteractionKit.lspkg` (SIK 4's new name), so about 90 TS2307 errors followed against SIK 2.0.0. The install also pulled in `Bitmoji 3D.lsc`.
3. **Attempt 2:** installing InteractionKit 4.0.0 and UIKit 4.0.0 fixed the import errors, but about 170 errors followed (`SpecsInteractionModule` is missing from the 5.23.2 typings). LEAF's own TS2352 error in `ScenarioIndexDecorator.ts` also remains. Both need a newer Lens Studio than 5.23.2.
4. **No warning before install:** neither the Asset Library nor `InstallLensStudioPackage` warns about the Lens Studio version a package needs before installing it.
5. **Silent extra installs:** the installs for LEAF and UIKit 4 both returned "operation timed out" but did install. UIKit 4 also quietly pulled in Icons and Motion.
6. **Unhelpful package list:** `ListInstalledPackagesTool` names every package "package".

## Current project state

As of 2026-11-04 09:06:

- **Compile and preview:** TypeScript compiles; the preview runs with no errors.
- **Packages:** back to the original two, SpectaclesInteractionKit 2.0.0 and SpectaclesUIKit 2.0.0. Everything the spike added has been removed.
- **Scene:** the top-level objects are back to the original seven: Camera Object, Lighting, SpectaclesInteractionKit, Hallway, DoorwayZone, CueLines, CueController. No scene edits were made for the fixes; the new inputs use their script defaults.
- **Scripts:**
  - `CueDecider.ts`: windowed speed (see "Fix: windowed speed").
  - `CueController.ts`: lines placed in front of the user, plus `audio=` in the 1 Hz trace (see "Fix: lines placed in front of the user").

**Still open:**
- Hear the click (needs a person).
- Test on a Specs device, including whether ±1 cm of jitter covers real tracking noise and what a good `firstLineAheadCm` is.
- ~~LEAF (needs LS 5.25).~~ Leaf 2.0.2 installed and compiling (correction above); scenarios T1–T6 written, not yet run in preview.
