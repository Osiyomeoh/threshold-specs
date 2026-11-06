import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { nextFrame, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { CLEAR_Z, LEFT_X, Sim, controller, ensureLeftMarked, mustInteractable, pinch, sawState, setupUI, waitForFloor, within } from "./ThresholdSim";

/**
 * Not a done criterion: brief behaviours C1-C5 don't reach. First-line slider, the 30 cm line rule,
 * the chevron giving up at 5 s while the beat continues, and audio-only cues with no floor.
 */
@component
export class X1_BriefExtras extends Scenario {
  async run(): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await sleep(1000);
    await ensureLeftMarked(interactor);
    const ui = setupUI();
    const c = controller();

    // First-line distance slider: changes alone, shows its number.
    await pinch(interactor, "Setup");
    await interactor.drag(mustInteractable("First-line distance"), new vec3(-0.2, 0, 0), 500);
    await sleep(200);
    print(`[LEAF] first-line distance after drag: ${c.firstLineDistanceCm} cm, label "${ui.firstLineLabel}"`);
    expect(c.firstLineDistanceCm).not.toBe(250);
    expect(ui.firstLineLabel).toBe(`${(c.firstLineDistanceCm / 100).toFixed(1)} m`);
    expect(c.lineSpacingCm).toBe(40);
    expect(c.beatBpm).toBe(90);
    await pinch(interactor, "Finish Setup");

    const sim = new Sim();
    const probeLength = c.probeLengthCm;
    try {
      // 100, 60 and 20 cm: the third line is closer than 30 cm, so it isn't drawn.
      c.setFirstLineDistance(100);
      await sim.begin(LEFT_X, CLEAR_Z);
      await waitForFloor(c);
      await sim.walkInAndWaitForCue();
      const cueStart = getTime();
      await nextFrame();
      expect(c.lineDrawnNow(0)).toBe(true);
      expect(c.lineDrawnNow(1)).toBe(true);
      expect(c.lineDrawnNow(2)).toBe(false);

      // Never looks down: the chevron holds to 5 s, then fades while the beat carries on.
      await sim.hold(4.5 - (getTime() - cueStart));
      expect(c.chevronVisible).toBe(true);
      within("chevron opacity at 4.5 s", c.chevronOpacity, 0.999, 1);
      await sim.hold(5.5 - (getTime() - cueStart));
      within("chevron opacity at 5.5 s", c.chevronOpacity, 0.3, 0.7);
      await sim.hold(6.5 - (getTime() - cueStart));
      expect(c.chevronVisible).toBe(false);
      expect(c.state).toBe("CUE_ACTIVE");
      within("beat volume at 6.5 s", c.beatVolumeNow, 0.59, 0.61);
      const ticks = c.beatTimes.length;
      await sim.hold(1);
      expect(c.beatTimes.length).toBeGreaterThan(ticks);

      // No floor: audio only, same timers, no chevron and no lines.
      await sim.hold(2);
      c.probeLengthCm = 1;
      c.resetFloor();
      await sim.begin(LEFT_X, CLEAR_Z);
      await sim.hold(1);
      expect(c.floorY).toBeNull();
      await sim.walkInAndWaitForCue();
      const noFloorStart = getTime();
      const trace = await sim.hold(4);
      expect(c.chevronVisible).toBe(false);
      expect(c.lineDrawnNow(0)).toBe(false);
      within("no-floor beat volume at 4 s", c.beatVolumeNow, 0.59, 0.61);
      expect(c.beatTimes.length).toBeGreaterThan(3);
      expect(sawState(trace, "RECOVERY")).toBe(false);
      while (c.ending === null) {
        if (getTime() - noFloorStart > 10) throw new Error("no-floor cue never timed out");
        await nextFrame();
      }
      within("no-floor timeout, s", getTime() - noFloorStart, 7.8, 8.3);
      await sim.hold(1.2);
      expect(c.lastOutcome).toBe("UNRESOLVED");

      // No floor, looked down: the head angle alone counts, and the cue gets the 15 s timer.
      // At 250 cm the first line needs atan(150/250) - 18.5 = 12.5 deg, so 8 is short and 20 is enough.
      c.setFirstLineDistance(250);
      await sim.walkInAndWaitForCue();
      const lookStart = getTime();
      expect(c.floorY).toBeNull();
      sim.setPitch(8);
      await sim.hold(0.5);
      expect(c.lookedDown).toBe(false);
      sim.setPitch(20);
      await sim.hold(0.5);
      expect(c.lookedDown).toBe(true);
      const lookTrace = await sim.hold(8.5 - (getTime() - lookStart));
      expect(c.ending).toBeNull();
      expect(c.state).toBe("CUE_ACTIVE");
      expect(c.chevronVisible).toBe(false);
      expect(c.lineDrawnNow(0)).toBe(false);
      expect(sawState(lookTrace, "RECOVERY")).toBe(false);
      while (c.ending === null) {
        if (getTime() - lookStart > 17) throw new Error("no-floor looked-down cue never timed out");
        await nextFrame();
      }
      within("no-floor looked-down timeout, s", getTime() - lookStart, 14.8, 15.3);
      await sim.hold(1.2);
      expect(c.lastOutcome).toBe("UNRESOLVED");
    } finally {
      c.probeLengthCm = probeLength;
      c.setFirstLineDistance(250);
      c.resetFloor();
      sim.end();
    }
  }
}
