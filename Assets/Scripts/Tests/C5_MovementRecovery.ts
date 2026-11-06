import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { CLEAR_Z, LEFT_X, SETTLE_S, STOP_Z, Sim, door, ensureLeftMarked, firstTime, sawState, waitForFloor, within } from "./ThresholdSim";

const WALK_SPEED = 60;

/**
 * Done criterion 5, movement and recovery: walk through after a cue. After about 80 cm the lines,
 * chevron and beat fade over about 1 s, monitoring resumes and the doorway is still marked.
 */
@component
export class C5_MovementRecovery extends Scenario {
  async run(): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await sleep(1000);
    await ensureLeftMarked(interactor);
    const sim = new Sim();
    try {
      const c = sim.controller;
      await sim.begin(LEFT_X, CLEAR_Z);
      await waitForFloor(c);
      const recovered0 = c.recoveredCount;
      const unresolved0 = c.unresolvedCount;
      const cues0 = c.cueCount;

      await sim.walkInAndWaitForCue();
      await sim.hold(1);
      expect(c.chevronVisible).toBe(true);
      expect(c.lineDrawnNow(0)).toBe(true);
      const volume = c.beatVolumeNow;

      // Walk through. Recovery starts at about 80 cm, not before.
      const walk = await sim.walkTo(LEFT_X, STOP_Z - 90, WALK_SPEED);
      const recoveryT = firstTime(walk, "RECOVERY");
      if (recoveryT === null) throw new Error("no recovery during a 90 cm walk");
      within("distance walked when recovery started, cm", recoveryT * WALK_SPEED, 75, 88);
      expect(c.ending).toBe("RECOVERED");

      // Halfway through the fade, all three are partway down.
      const elapsed = walk[walk.length - 1].t - recoveryT;
      await sim.hold(0.5 - elapsed);
      expect(c.state).toBe("RECOVERY");
      within("line opacity mid-fade", c.lineOpacity, 0.3, 0.7);
      within("chevron opacity mid-fade", c.chevronOpacity, 0.3, 0.7);
      within("beat volume mid-fade (share of full)", c.beatVolumeNow / volume, 0.3, 0.7);

      // Fade finishes at about 1 s; monitoring resumes; the doorway is still marked.
      const rest = await sim.hold(0.8);
      const monitoringT = firstTime(rest, "MONITORING");
      if (monitoringT === null) throw new Error("monitoring didn't resume after the fade");
      within("fade length, s", 0.5 + monitoringT, 0.9, 1.2);
      expect(c.state).toBe("MONITORING");
      expect(c.lastOutcome).toBe("RECOVERED");
      expect(c.recoveredCount).toBe(recovered0 + 1);
      expect(c.unresolvedCount).toBe(unresolved0);
      expect(c.lineDrawnNow(0)).toBe(false);
      expect(c.chevronVisible).toBe(false);
      expect(door("DoorwayLeft").marked).toBe(true);
      expect(door("DoorwayLeft").markedRoot.enabled).toBe(true);
      expect(sawState(rest, "CUE_ACTIVE")).toBe(false);

      // Monitoring really is live: leave, come back, stop, and a new cue starts.
      await sim.walkTo(LEFT_X, CLEAR_Z);
      await sim.hold(SETTLE_S);
      await sim.walkTo(LEFT_X, STOP_Z);
      const again = await sim.hold(3);
      expect(sawState(again, "CUE_ACTIVE")).toBe(true);
      expect(c.cueCount).toBe(cues0 + 2);
    } finally {
      sim.end();
    }
  }
}
