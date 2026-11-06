import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { CLEAR_Z, DOOR_Z, LEFT_X, RIGHT_X, SETTLE_S, STOP_Z, Sim, ensureLeftMarked, firstTime, sawState, within } from "./ThresholdSim";

/**
 * Done criterion 2, correct activation. Each attempt walks in from outside the area; nothing is
 * reset between attempts except by walking away.
 */
@component
export class C2_CorrectActivation extends Scenario {
  async run(): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await sleep(1000);
    await ensureLeftMarked(interactor);
    const sim = new Sim();
    try {
      const c = sim.controller;
      await sim.begin(RIGHT_X, CLEAR_Z);
      const cues0 = c.cueCount;

      // Walk to the unmarked doorway and stop: no cue.
      await sim.walkTo(RIGHT_X, STOP_Z);
      const atUnmarked = await sim.hold(3);
      expect(sawState(atUnmarked, "CUE_ACTIVE")).toBe(false);
      expect(c.cueCount).toBe(cues0);

      // Stop at the marked doorway for less than 2 s: no cue.
      await sim.walkTo(RIGHT_X, CLEAR_Z);
      await sim.walkTo(LEFT_X, CLEAR_Z);
      await sim.walkTo(LEFT_X, STOP_Z);
      const brief = await sim.hold(1.2);
      expect(sawState(brief, "CUE_ACTIVE")).toBe(false);
      await sim.walkTo(LEFT_X, CLEAR_Z);
      expect(c.cueCount).toBe(cues0);

      // Stand at the marked doorway facing away for more than 2 s: no cue (side-on, then back turned).
      await sim.walkTo(LEFT_X, STOP_Z);
      sim.setYaw(90);
      const sideOn = await sim.hold(3);
      expect(sawState(sideOn, "CUE_ACTIVE")).toBe(false);
      sim.setYaw(180);
      const backTurned = await sim.hold(3);
      expect(sawState(backTurned, "CUE_ACTIVE")).toBe(false);
      expect(c.cueCount).toBe(cues0);

      // Turning to face the doorway starts a fresh 2 s, it doesn't count the time spent facing away.
      sim.setYaw(0);
      const turned = await sim.hold(3);
      const afterTurn = firstTime(turned, "CUE_ACTIVE");
      if (afterTurn === null) throw new Error("no cue after turning to face the doorway");
      within("cue after turning to face, s", afterTurn, 1.9, 2.3);
      expect(c.cueCount).toBe(cues0 + 1);

      // It doesn't re-arm while still in the area; leaving and coming back does.
      await sim.hold(9); // never looked down: fades at 8 s
      expect(c.state).toBe("MONITORING");
      expect(c.lastOutcome).toBe("UNRESOLVED");
      const stillHere = await sim.hold(3);
      expect(sawState(stillHere, "CUE_ACTIVE")).toBe(false);
      expect(c.cueCount).toBe(cues0 + 1);

      // Stand still facing the marked doorway for at least 2 s: the cue starts.
      await sim.walkTo(LEFT_X, CLEAR_Z);
      await sim.hold(SETTLE_S);
      await sim.walkTo(LEFT_X, STOP_Z);
      const stood = await sim.hold(3);
      const afterStop = firstTime(stood, "CUE_ACTIVE");
      if (afterStop === null) throw new Error("no cue after standing facing the doorway");
      within("cue after stopping, s", afterStop, 1.9, 2.3);
      expect(c.cueCount).toBe(cues0 + 2);
      expect(c.activeDoorId).toBe("DoorwayLeft");

      // The other approach: from beyond the doorway, facing back through it.
      await sim.begin(LEFT_X, DOOR_Z - 200, 180);
      await sim.hold(SETTLE_S);
      await sim.walkTo(LEFT_X, DOOR_Z - 70);
      const fromBeyond = await sim.hold(3);
      const afterBeyond = firstTime(fromBeyond, "CUE_ACTIVE");
      if (afterBeyond === null) throw new Error("no cue on the approach from beyond the doorway");
      within("cue from the far side, s", afterBeyond, 1.9, 2.3);
    } finally {
      sim.end();
    }
  }
}
