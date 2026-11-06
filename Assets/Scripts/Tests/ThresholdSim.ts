/**
 * ThresholdSim — LEAF test harness (not a component).
 *
 * Swaps CueController's camera for a scripted "SimUser" SceneObject and moves it frame by frame
 * through the stand-in room: two doorways in the wall at z = -400, eyes at y = 0, floor top at
 * y = -150. Scenarios share one live Lens, so each one resets the controller first and restores
 * the real camera in `end()`. The real preview camera can't be steered from a scenario, which is
 * why these tests read a stand-in; the controller's code path is otherwise the same.
 */
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { findSceneObjectByName, nextFrame, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { CueController } from "../CueController";
import { CueState } from "../CueDecider";
import { Doorway } from "../Doorway";
import { ThresholdSetupUI } from "../ThresholdSetupUI";

export const DOOR_Z = -400;
export const LEFT_X = -100;
export const RIGHT_X = 100;
export const EYE_Y = 0;
export const FLOOR_Y = -150;
/** A spot inside a doorway's area, facing straight through. */
export const STOP_Z = DOOR_Z + 70;
/** Past the area, where a cue can re-arm. */
export const CLEAR_Z = DOOR_Z + 200;
/** Enough to leave any fade behind and settle the speed window. */
export const SETTLE_S = 0.7;

export interface TraceEntry {
  t: number;
  st: CueState;
}

export function mustFind(name: string): SceneObject {
  const so = findSceneObjectByName(name);
  if (!so) throw new Error(`SceneObject "${name}" not found`);
  return so;
}

export function door(name: string): Doorway {
  const d = mustFind(name).getComponent(Doorway.getTypeName()) as Doorway;
  if (!d) throw new Error(`Doorway component not found on "${name}"`);
  return d;
}

export function controller(): CueController {
  const c = mustFind("CueController").getComponent(CueController.getTypeName()) as CueController;
  if (!c) throw new Error("CueController component not found");
  return c;
}

export function setupUI(): ThresholdSetupUI {
  const u = mustFind("ThresholdSetupUI").getComponent(ThresholdSetupUI.getTypeName()) as ThresholdSetupUI;
  if (!u) throw new Error("ThresholdSetupUI component not found");
  return u;
}

/** Pinches a control by name, the way the mouse does in the preview. */
export async function pinch(interactor: DefaultLeafInteractor, name: string): Promise<void> {
  await interactor.trigger(mustInteractable(name));
  await sleep(200);
}

/** Runs the physio flow on the left doorway unless it's already marked, and leaves setup finished. */
export async function ensureLeftMarked(interactor: DefaultLeafInteractor): Promise<void> {
  const ui = setupUI();
  if (!door("DoorwayLeft").marked) {
    if (!ui.isExpanded) await pinch(interactor, "Setup");
    if (!ui.isMarkingMode) await pinch(interactor, "Marking Mode");
    await pinch(interactor, "DoorwayLeft_Target");
    await pinch(interactor, "Mark as Trouble Spot");
  }
  if (ui.isExpanded) await pinch(interactor, "Finish Setup");
}

/** Prints a measurement so the run log shows it, and fails the scenario if it's outside lo..hi. */
export function within(label: string, value: number, lo: number, hi: number): void {
  print(`[LEAF] ${label} = ${value.toFixed(3)} (allowed ${lo}..${hi})`);
  if (!(value >= lo && value <= hi)) throw new Error(`${label} = ${value} is outside ${lo}..${hi}`);
}

/** Waits for the floor probe, which needs a few frames after a Lens reset. */
export async function waitForFloor(c: CueController, maxS: number = 3): Promise<number> {
  const t0 = getTime();
  while (c.floorY === null) {
    if (getTime() - t0 > maxS) throw new Error(`no floor detected within ${maxS} s`);
    await nextFrame();
  }
  return c.floorY as number;
}

export function mustInteractable(name: string): Interactable {
  const target = findInteractableByName(name, undefined, true);
  if (!target) throw new Error(`Interactable "${name}" not found or not enabled`);
  return target;
}

export class Sim {
  readonly controller: CueController;
  readonly user: SceneObject;
  private readonly realCamera: SceneObject;
  private x = 0;
  private z = 0;
  private pitchDeg = 0;
  private yawDeg = 0;

  constructor() {
    this.controller = controller();
    this.realCamera = this.controller.camera;
    this.user = global.scene.createSceneObject("SimUser");
  }

  /** Places the sim user, hands it to the controller and clears motion history and any cue. */
  async begin(x: number, z: number, yawDeg: number = 0, pitchDownDeg: number = 0): Promise<void> {
    this.x = x;
    this.z = z;
    this.yawDeg = yawDeg;
    this.pitchDeg = pitchDownDeg;
    this.apply();
    this.controller.camera = this.user;
    this.controller.resetRuntime();
    await nextFrame();
  }

  setPitch(pitchDownDeg: number): void {
    this.pitchDeg = pitchDownDeg;
    this.apply();
  }

  /** 0 = looking along -Z (straight through the doorways); positive turns toward -X. */
  setYaw(yawDeg: number): void {
    this.yawDeg = yawDeg;
    this.apply();
  }

  get position(): vec3 {
    return new vec3(this.x, EYE_Y, this.z);
  }

  /** Walks in a straight line to (x, z) at `speedCmPerS`; returns one entry per frame. */
  async walkTo(x: number, z: number, speedCmPerS: number = 100): Promise<TraceEntry[]> {
    const out: TraceEntry[] = [];
    const x0 = this.x;
    const z0 = this.z;
    const dist = Math.sqrt((x - x0) * (x - x0) + (z - z0) * (z - z0));
    const t0 = getTime();
    for (;;) {
      const travelled = Math.min(dist, speedCmPerS * (getTime() - t0));
      const f = dist > 0 ? travelled / dist : 1;
      this.x = x0 + (x - x0) * f;
      this.z = z0 + (z - z0) * f;
      this.apply();
      await nextFrame();
      out.push({ t: getTime() - t0, st: this.controller.state });
      if (travelled >= dist) break;
    }
    return out;
  }

  /** Stands still for `seconds`; returns one entry per frame. */
  async hold(seconds: number): Promise<TraceEntry[]> {
    const out: TraceEntry[] = [];
    const t0 = getTime();
    while (getTime() - t0 < seconds) {
      await nextFrame();
      out.push({ t: getTime() - t0, st: this.controller.state });
    }
    return out;
  }

  /**
   * Walks from outside the area to `stopZ` at the left doorway and stands facing through until the
   * cue starts on its own. Returns the seconds from stopping to cue start. `begin` must have run.
   */
  async walkInAndWaitForCue(stopZ: number = STOP_Z, maxWaitS: number = 4): Promise<number> {
    await this.walkTo(LEFT_X, CLEAR_Z);
    await this.hold(SETTLE_S);
    await this.walkTo(LEFT_X, stopZ);
    const t0 = getTime();
    while (this.controller.state !== "CUE_ACTIVE") {
      if (getTime() - t0 > maxWaitS) throw new Error(`no cue within ${maxWaitS} s of stopping`);
      await nextFrame();
    }
    return getTime() - t0;
  }

  /** Restores the real camera and removes the sim user. Call in `finally`. */
  end(): void {
    this.controller.camera = this.realCamera;
    this.controller.resetRuntime();
    this.user.destroy();
  }

  private apply(): void {
    const tr = this.user.getTransform();
    tr.setWorldPosition(new vec3(this.x, EYE_Y, this.z));
    // Camera looks down local -Z. Yaw about +Y, then a negative rotation about +X tips the view down.
    const yaw = quat.angleAxis((this.yawDeg * Math.PI) / 180, vec3.up());
    const pitch = quat.angleAxis((-this.pitchDeg * Math.PI) / 180, vec3.right());
    tr.setWorldRotation(yaw.multiply(pitch));
  }
}

export function sawState(trace: TraceEntry[], st: CueState): boolean {
  for (let i = 0; i < trace.length; i++) if (trace[i].st === st) return true;
  return false;
}

export function firstTime(trace: TraceEntry[], st: CueState): number | null {
  for (let i = 0; i < trace.length; i++) if (trace[i].st === st) return trace[i].t;
  return null;
}
