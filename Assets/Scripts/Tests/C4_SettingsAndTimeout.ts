import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { nextFrame, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { CLEAR_Z, LEFT_X, STOP_Z, Sim, controller, ensureLeftMarked, mustInteractable, pinch, sawState, setupUI, waitForFloor, within } from "./ThresholdSim";

/**
 * Done criterion 4, settings and engagement timeout: line spacing and beat speed change separately
 * and show as numbers; looking down without moving doesn't count as recovery; the cue fades at
 * 15 s and no recovery is reported.
 */
@component
export class C4_SettingsAndTimeout extends Scenario {
  async run(): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await sleep(1000);
    await ensureLeftMarked(interactor);
    const ui = setupUI();
    const c = controller();

    // Open setup; detection pauses while it's open.
    await pinch(interactor, "Setup");
    expect(ui.isExpanded).toBe(true);
    expect(c.detectionEnabled).toBe(false);
    expect(ui.spacingLabel).toBe("40 cm");
    expect(ui.bpmLabel).toBe("90 BPM");
    expect(ui.firstLineLabel).toBe("2.5 m");

    // Line spacing, by dragging its slider. Only line spacing changes.
    await interactor.drag(mustInteractable("Line spacing"), new vec3(0.2, 0, 0), 500);
    await sleep(200);
    const spacing = c.lineSpacingCm;
    print(`[LEAF] line spacing after drag: ${spacing} cm, label "${ui.spacingLabel}"`);
    expect(spacing).not.toBe(40);
    expect(spacing % 5).toBe(0);
    expect(ui.spacingLabel).toBe(`${spacing} cm`);
    expect(c.beatBpm).toBe(90);
    expect(ui.bpmLabel).toBe("90 BPM");
    expect(c.firstLineDistanceCm).toBe(250);

    // Beat speed, by dragging its slider. Only beat speed changes.
    await interactor.drag(mustInteractable("Beat speed"), new vec3(0.2, 0, 0), 500);
    await sleep(200);
    const bpm = c.beatBpm;
    print(`[LEAF] beat speed after drag: ${bpm} BPM, label "${ui.bpmLabel}"`);
    expect(bpm).not.toBe(90);
    expect(ui.bpmLabel).toBe(`${bpm} BPM`);
    expect(c.lineSpacingCm).toBe(spacing);
    expect(ui.spacingLabel).toBe(`${spacing} cm`);
    expect(c.firstLineDistanceCm).toBe(250);

    await pinch(interactor, "Finish Setup");
    expect(c.detectionEnabled).toBe(true);

    const sim = new Sim();
    try {
      await sim.begin(LEFT_X, CLEAR_Z);
      await waitForFloor(c);
      const recovered0 = c.recoveredCount;
      const unresolved0 = c.unresolvedCount;

      await sim.walkInAndWaitForCue();
      const cueStart = getTime();
      await nextFrame();

      // Both settings reached the cue.
      expect(c.runningBpm).toBe(bpm);
      within("line 0 to line 1 gap, cm", c.linePosition(1).z - c.linePosition(0).z, spacing - 0.5, spacing + 0.5);
      within("line 1 to line 2 gap, cm", c.linePosition(2).z - c.linePosition(1).z, spacing - 0.5, spacing + 0.5);

      // Look down without moving.
      sim.setPitch(25);
      const early = await sim.hold(3);
      expect(c.lookedDown).toBe(true);
      expect(sawState(early, "RECOVERY")).toBe(false);
      expect(c.state).toBe("CUE_ACTIVE");

      // Guidance continues past the 8 s limit that applies only if the person never looked down.
      await sim.hold(14 - (getTime() - cueStart));
      expect(c.state).toBe("CUE_ACTIVE");
      expect(c.ending).toBeNull();
      within("line opacity at 14 s", c.lineOpacity, 0.999, 1);
      within("beat volume at 14 s", c.beatVolumeNow, 0.01, 1);

      // The beat runs at the speed that was set, not the default.
      const ticks = c.beatTimes;
      expect(ticks.length).toBeGreaterThan(8);
      const interval = 60 / bpm;
      within(`mean beat interval, s (${bpm} BPM = ${interval.toFixed(3)})`, (ticks[ticks.length - 1] - ticks[0]) / (ticks.length - 1), interval - 0.01, interval + 0.01);

      // At about 15 s it fades over about 1 s, and it isn't recovery.
      const trace = await sim.hold(3);
      expect(sawState(trace, "RECOVERY")).toBe(false);
      expect(c.state).toBe("MONITORING");
      expect(c.lastOutcome).toBe("UNRESOLVED");
      expect(c.recoveredCount).toBe(recovered0);
      expect(c.unresolvedCount).toBe(unresolved0 + 1);
      let endT: number | null = null;
      for (let i = 0; i < trace.length; i++) {
        if (trace[i].st === "MONITORING") {
          endT = trace[i].t;
          break;
        }
      }
      if (endT === null) throw new Error("the cue never finished");
      within("cue ended (15 s + 1 s fade), s after start", 14 + endT, 15.8, 16.4);
      expect(c.lineDrawnNow(0)).toBe(false);
      expect(c.chevronVisible).toBe(false);
      expect(STOP_Z).toBe(sim.position.z); // never moved
    } finally {
      sim.end();
    }
  }
}
