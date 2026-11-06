import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { nextFrame, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { CLEAR_Z, DOOR_Z, EYE_Y, FLOOR_Y, LEFT_X, STOP_Z, Sim, ensureLeftMarked, mustFind, waitForFloor, within } from "./ThresholdSim";

/** Largest distance (cm) between two world points. */
function dist(a: vec3, b: vec3): number {
  return a.sub(b).length;
}

function meshExtent(names: string[]): { min: vec3; max: vec3 } {
  let min = new vec3(1e6, 1e6, 1e6);
  let max = new vec3(-1e6, -1e6, -1e6);
  for (const n of names) {
    const rmv = mustFind(n).getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    const lo = rmv.worldAabbMin();
    const hi = rmv.worldAabbMax();
    min = new vec3(Math.min(min.x, lo.x), Math.min(min.y, lo.y), Math.min(min.z, lo.z));
    max = new vec3(Math.max(max.x, hi.x), Math.max(max.y, hi.y), Math.max(max.z, hi.z));
  }
  return { min, max };
}

/**
 * Done criterion 3, visual and audio guidance: the chevron appears ahead and slightly below centre;
 * tilting down brings the lines in one at a time, fixed to the floor; the chevron hides; the beat
 * plays at the set speed.
 */
@component
export class C3_VisualAudioGuidance extends Scenario {
  async run(): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await sleep(1000);
    await ensureLeftMarked(interactor);
    const sim = new Sim();
    try {
      const c = sim.controller;
      await sim.begin(LEFT_X, CLEAR_Z);
      const floor = await waitForFloor(c);
      within("floor y, cm", floor, FLOOR_Y - 1, FLOOR_Y + 1);

      await sim.walkInAndWaitForCue();
      await nextFrame();
      const cueStart = getTime();

      // Chevron: 1 m ahead, 15 cm below the eye line, about 15 cm wide, "LOOK DOWN" about 4 cm tall.
      expect(c.chevronVisible).toBe(true);
      const chev = c.chevronWorldPosition;
      within("chevron distance ahead, cm", STOP_Z - chev.z, 95, 105);
      within("chevron below eye line, cm", EYE_Y - chev.y, 13, 17);
      within("chevron sideways offset, cm", Math.abs(chev.x - LEFT_X), 0, 2);
      const chevron = meshExtent(["ChevronL", "ChevronR"]);
      within("chevron width, cm", chevron.max.x - chevron.min.x, 14, 16);
      const textVisual = c.chevronText as Text;
      expect(textVisual.text).toBe("LOOK DOWN");
      const textHeight = textVisual.worldAabbMax().y - textVisual.worldAabbMin().y;
      within("LOOK DOWN text height, cm", textHeight, 3.5, 4.5);
      // At 1 m the display shows about +/-29 cm, so the words must fit and stay on one line.
      within("LOOK DOWN text width, cm", textVisual.worldAabbMax().x - textVisual.worldAabbMin().x, 10, 50);

      // Not head-locked: a 1 degree head movement doesn't move the chevron.
      sim.setYaw(1);
      await sim.hold(0.3);
      within("chevron movement after a 1 degree turn, cm", dist(c.chevronWorldPosition, chev), 0, 0.01);
      // A real turn catches up, smoothly: no jump in the first frame, then it arrives.
      sim.setYaw(30);
      await nextFrame();
      within("chevron movement in the first frame of a 30 degree turn, cm", dist(c.chevronWorldPosition, chev), 0, 5);
      await sim.hold(1.5);
      within("chevron angle error after catching up, cm", dist(c.chevronWorldPosition, new vec3(LEFT_X - 50, -15, STOP_Z - 86.6)), 0, 8);
      sim.setYaw(0);
      await sim.hold(1.5);

      // Lines: world-anchored at 2.5, 2.1 and 1.7 m toward the doorway, 60 x 4 cm, flat on the floor.
      expect(c.lineCount).toBe(3);
      const expectedZ = [STOP_Z - 250, STOP_Z - 210, STOP_Z - 170];
      const anchored: vec3[] = [];
      for (let i = 0; i < 3; i++) {
        expect(c.lineDrawnNow(i)).toBe(true);
        const p = c.linePosition(i);
        anchored.push(p);
        within(`line ${i} x, cm`, p.x, LEFT_X - 0.5, LEFT_X + 0.5);
        within(`line ${i} z, cm`, p.z, expectedZ[i] - 1, expectedZ[i] + 1);
        within(`line ${i} height above the floor, cm`, p.y - floor, 0, 1);
      }
      const scale = mustFind("CueLine_Far").getTransform().getWorldScale();
      within("line length, cm", scale.x, 59.5, 60.5);
      within("line width, cm", scale.z, 3.5, 4.5);

      // Tilt down: nothing in view yet, then one line at a time. Farthest first.
      const expectInView = (a: boolean, b: boolean, d: boolean) => {
        expect(c.lineInView(0)).toBe(a);
        expect(c.lineInView(1)).toBe(b);
        expect(c.lineInView(2)).toBe(d);
      };
      expectInView(false, false, false);
      expect(c.lookedDown).toBe(false);

      sim.setPitch(11);
      await sim.hold(0.2);
      expectInView(false, false, false);
      expect(c.lookedDown).toBe(false);
      expect(c.chevronVisible).toBe(true);

      sim.setPitch(14);
      await sim.hold(0.2);
      expectInView(true, false, false);
      expect(c.lookedDown).toBe(true);
      expect(c.chevronVisible).toBe(false); // the chevron hides once the farthest line is in view

      sim.setPitch(19);
      await sim.hold(0.2);
      expectInView(true, true, false);

      sim.setPitch(25);
      await sim.hold(0.2);
      expectInView(true, true, true);
      expect(c.chevronVisible).toBe(false);
      expect(c.state).toBe("CUE_ACTIVE"); // looking down isn't recovery

      // The lines never moved, through head turns and tilts, and aren't animated.
      for (let i = 0; i < 3; i++) within(`line ${i} drift, cm`, dist(c.linePosition(i), anchored[i]), 0, 0.001);
      within("line opacity", c.lineOpacity, 0.999, 1);

      // Beat: from the marked doorway, at the set speed, at a steady volume.
      const source = c.beatAudio.getSceneObject().getTransform().getWorldPosition();
      within("beat source x, cm", source.x, LEFT_X - 1, LEFT_X + 1);
      within("beat source z, cm", source.z, DOOR_Z - 1, DOOR_Z + 1);
      expect(c.beatAudio.spatialAudio.enabled).toBe(true);
      expect(c.runningBpm).toBe(90);
      const volume = c.beatVolumeNow;
      within("beat volume", volume, 0.01, 1);
      await sim.hold(2);
      expect(c.beatVolumeNow).toBe(volume);
      const ticks = c.beatTimes;
      print(`[LEAF] ${ticks.length} ticks in ${(getTime() - cueStart).toFixed(1)} s`);
      expect(ticks.length).toBeGreaterThan(8);
      const mean = (ticks[ticks.length - 1] - ticks[0]) / (ticks.length - 1);
      within("mean beat interval, s (90 BPM = 0.667)", mean, 0.657, 0.677);
      for (let i = 1; i < ticks.length; i++) within(`tick ${i} interval, s`, ticks[i] - ticks[i - 1], 0.6, 0.72);
    } finally {
      sim.end();
    }
  }
}
