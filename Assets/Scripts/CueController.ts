/**
 * CueController — runtime adapter around CueDecider (design brief "When things show").
 *
 * Owns: per-frame samples of the camera's world position and head direction (the real preview
 * camera; nothing is faked), the floor probe, and the cue's look and sound:
 *   - stepping lines on the floor (60 x 4 cm, bright cyan), world-anchored at cue start along the
 *     direction from the cue-start point to the marked doorway's centre, at the first-line distance,
 *     minus one spacing, minus two spacings; a line closer than 30 cm is not drawn;
 *   - a steady tick at the set BPM, played as spatial sound from the marked doorway;
 *   - the floating "LOOK DOWN" chevron about 1 m ahead and 15 cm below eye line, which catches up
 *     smoothly with a deadzone and a speed limit (not head-locked).
 * Lines, beat and chevron all fade with CueDecider.fade (1 s). Every cue outcome is printed to the
 * Lens Studio log ("[Threshold] cue outcome: ...") and kept as session counts only.
 *
 * Looked down: the farthest line's centre is inside a verticalFovDeg-tall view (SPECS ~37 deg).
 * With no floor detected (glasses only) no lines or chevron are drawn; "looked down" then means the
 * head pitched down as far as it would need to for a floor nominalEyeHeightCm below.
 * Floor probe: in the Lens Studio editor a physics probe against the stand-in floor's collider
 * (a straight-down ray and the view ray); on device WorldQuery hit testing on real surfaces.
 * A hit counts as floor when its normal points up and it is at least minFloorDropCm below the eyes.
 *
 * Detection starts disabled; ThresholdSetupUI enables it on Finish Setup.
 * Must not: contain cue decision logic (CueDecider.ts), record positions, or identify people.
 */
import { CueDecider, CueInfo, CueOutcome, CueState } from "./CueDecider";
import { Doorway } from "./Doorway";

const DEG = Math.PI / 180;
const FLOOR_NORMAL_MIN_Y = 0.85;
const LINE_LIFT_CM = 0.3;
const LINE_LENGTH_CM = 60;
const LINE_WIDTH_CM = 4;
const LINE_THICKNESS_CM = 0.5;
const MIN_LINE_DISTANCE_CM = 30;
const CHEVRON_AHEAD_CM = 100;
const CHEVRON_BELOW_EYES_CM = 15;
const CHEVRON_DEADZONE_CM = 6;
const CHEVRON_SETTLE_CM = 1;
const CHEVRON_MAX_SPEED_CM_PER_S = 80;
const CHEVRON_SMOOTHING_PER_S = 4;
const CHEVRON_TEXT_SIZE = 167;
const BEAT_SOURCE_HEIGHT_CM = 100;

export const SPACING_MIN_CM = 20;
export const SPACING_MAX_CM = 80;
export const BPM_MIN = 60;
export const BPM_MAX = 120;
export const FIRST_LINE_MIN_CM = 100;
export const FIRST_LINE_MAX_CM = 350;

@component
export class CueController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CueController – Threshold cue (lines, beat, chevron)</span>')
  @ui.separator
  @ui.group_start("References")
  @input
  @hint("Camera SceneObject; its world position and view direction are sampled every frame")
  camera!: SceneObject;

  @input
  @hint("Parent of the Doorway components (searched recursively)")
  doorwaysRoot!: SceneObject;

  @input
  @hint("Parent of the floor lines; child 0 is the farthest line")
  cueLinesRoot!: SceneObject;

  @input
  @hint("Tick sound; played once per beat as spatial sound from the marked doorway")
  beatAudio!: AudioComponent;

  @input
  @hint("Look-down chevron root (bars + text), built facing +Z")
  chevronRoot!: SceneObject;

  @input
  @allowUndefined
  @hint("The chevron's LOOK DOWN text")
  chevronText: Text | undefined;

  @input
  @allowUndefined
  @hint("Preview-only stand-in room; disabled on device")
  previewOnlyRoot: SceneObject | undefined;
  @ui.group_end

  @ui.separator
  @ui.group_start("Settings")
  @input
  @hint("Distance between lines, cm (setup panel slider)")
  @widget(new SliderWidget(20, 80, 5))
  lineSpacingCm: number = 40;

  @input
  @hint("Beat speed, BPM (setup panel slider)")
  @widget(new SliderWidget(60, 120, 1))
  beatBpm: number = 90;

  @input
  @hint("Distance from the cue-start point to the farthest line, cm (setup panel slider)")
  @widget(new SliderWidget(100, 350, 10))
  firstLineDistanceCm: number = 250;

  @input
  @hint("Line colour")
  @widget(new ColorWidget())
  lineColor: vec3 = new vec3(0, 1, 1);

  @input
  @hint("Chevron and text colour (light; the display is additive)")
  @widget(new ColorWidget())
  chevronColor: vec3 = new vec3(0.92, 0.96, 1.0);

  @input
  @hint("Beat volume (constant; it only fades out)")
  @widget(new SliderWidget(0.05, 1, 0.05))
  beatVolume: number = 0.6;

  @input
  @hint("Display height used for 'farthest line in view', degrees (SPECS ~37)")
  @widget(new SliderWidget(20, 60, 0.5))
  verticalFovDeg: number = 37;

  @input
  @hint("Eye height assumed when no floor is detected, cm")
  nominalEyeHeightCm: number = 150;

  @input
  @hint("Seconds between floor probe rays")
  probeIntervalS: number = 0.2;

  @input
  @hint("Floor probe ray length, cm")
  probeLengthCm: number = 600;

  @input
  @hint("A floor hit must be at least this far below the eyes, cm")
  minFloorDropCm: number = 50;

  @input
  @hint("Print state changes (never positions)")
  debugLogs: boolean = false;
  @ui.group_end

  private decider = new CueDecider();
  private doorways: Doorway[] | null = null;
  private lines: SceneObject[] = [];
  private lineDrawn: boolean[] = [];
  private lineMat: Material | null = null;
  private chevronMat: Material | null = null;
  private linesPlaced = false;
  private cueShown = false;
  private cueBpm = 90;
  private nextBeatT = 0;
  private _beatTimes: number[] = [];
  private chevronMoving = false;
  private chevronShown = false;
  private lastState: CueState = "MONITORING";
  private lastProbeT = -1;
  private floorYCm: number | null = null;
  private isEditor = false;
  private physicsProbe: Probe | null = null;
  private hitSession: HitTestSession | null = null;
  private ready = false;

  onAwake(): void {
    if (!this.camera || !this.doorwaysRoot || !this.cueLinesRoot || !this.beatAudio || !this.chevronRoot) {
      print("[Threshold] ERROR: CueController is missing camera/doorwaysRoot/cueLinesRoot/beatAudio/chevronRoot");
      return;
    }
    this.lineSpacingCm = clamp(this.lineSpacingCm, SPACING_MIN_CM, SPACING_MAX_CM);
    this.beatBpm = clamp(this.beatBpm, BPM_MIN, BPM_MAX);
    this.firstLineDistanceCm = clamp(this.firstLineDistanceCm, FIRST_LINE_MIN_CM, FIRST_LINE_MAX_CM);

    for (let i = 0; i < this.cueLinesRoot.getChildrenCount(); i++) this.lines.push(this.cueLinesRoot.getChild(i));
    this.lineMat = shareClonedMaterial(this.cueLinesRoot, false);
    this.chevronMat = shareClonedMaterial(this.chevronRoot, true);
    if (this.chevronText) {
      const t = this.chevronText;
      t.text = "LOOK DOWN";
      t.size = CHEVRON_TEXT_SIZE;
      t.horizontalAlignment = HorizontalAlignment.Center;
      t.verticalAlignment = VerticalAlignment.Center;
      t.horizontalOverflow = HorizontalOverflow.Overflow;
      t.verticalOverflow = VerticalOverflow.Overflow;
      t.depthTest = false;
    }

    const sa = this.beatAudio.spatialAudio;
    sa.enabled = true;
    sa.positionEffect.enabled = true;
    sa.distanceEffect.enabled = true;
    this.beatAudio.playbackMode = Audio.PlaybackMode.LowLatency;

    this.isEditor = global.deviceInfoSystem.isEditor();
    if (this.previewOnlyRoot) this.previewOnlyRoot.enabled = this.isEditor;
    this.setUpFloorProbe();

    this.decider.setDetectionEnabled(false);
    this.decider.onCueStart = (c) => this.onCueStart(c);
    this.decider.onEnding = (o, c, t) => this.onEnding(o, c, t);

    this.hideCue();
    this.ready = true;
    const cam = this.camera.getComponent("Component.Camera") as Camera;
    if (cam) print(`[Threshold] preview camera vertical FOV ${(cam.fov / DEG).toFixed(1)} deg (in-view test uses ${this.verticalFovDeg} deg)`);
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  // ---------- public API (ThresholdSetupUI, LEAF scenarios) ----------

  /** Re-reads which doorways are marked and hands them to the decider. */
  refreshMarkedDoorways(): void {
    const marked = this.allDoorways().filter((d) => d.marked);
    this.decider.setMarkedDoorways(marked.map((d) => d.geometry));
    print(`[Threshold] marked doorways: ${marked.map((d) => d.sceneObject.name).join(", ") || "none"}`);
  }

  setDetectionEnabled(on: boolean): void {
    this.decider.setDetectionEnabled(on);
    if (this.debugLogs) print(`[Threshold] detection ${on ? "on" : "paused"}`);
  }

  get detectionEnabled(): boolean {
    return this.decider.detectionEnabled;
  }

  setLineSpacing(cm: number): void {
    this.lineSpacingCm = clamp(cm, SPACING_MIN_CM, SPACING_MAX_CM);
  }

  /** Takes effect at the next cue; a running cue keeps its speed. */
  setBpm(bpm: number): void {
    this.beatBpm = clamp(bpm, BPM_MIN, BPM_MAX);
  }

  setFirstLineDistance(cm: number): void {
    this.firstLineDistanceCm = clamp(cm, FIRST_LINE_MIN_CM, FIRST_LINE_MAX_CM);
  }

  get state(): CueState {
    return this.decider.state;
  }
  get lastOutcome(): CueOutcome | null {
    return this.decider.lastOutcome;
  }
  get ending(): CueOutcome | null {
    return this.decider.ending;
  }
  get fade(): number {
    return this.decider.fade;
  }
  get lookedDown(): boolean {
    return this.decider.lookedDown;
  }
  get cueAge(): number {
    return this.decider.cueAge;
  }
  get cueCount(): number {
    return this.decider.cueCount;
  }
  get recoveredCount(): number {
    return this.decider.recoveredCount;
  }
  get unresolvedCount(): number {
    return this.decider.unresolvedCount;
  }
  get activeDoorId(): string | null {
    return this.decider.cue ? this.decider.cue.doorId : null;
  }
  /** Cached floor height (cm, world Y), or null if no floor has been found. */
  get floorY(): number | null {
    return this.floorYCm;
  }
  /** Beat speed of the running cue (fixed at cue start). */
  get runningBpm(): number {
    return this.cueBpm;
  }
  /** getTime() of every tick played in the current / last cue. */
  get beatTimes(): number[] {
    return this._beatTimes.slice();
  }
  get beatVolumeNow(): number {
    return this.beatAudio.volume;
  }
  get chevronVisible(): boolean {
    return this.chevronShown && this.chevronRoot.enabled;
  }
  get chevronWorldPosition(): vec3 {
    return this.chevronRoot.getTransform().getWorldPosition();
  }
  get chevronOpacity(): number {
    return this.chevronMat ? this.chevronMat.mainPass.baseColor.w : 0;
  }
  get lineCount(): number {
    return this.lines.length;
  }
  /** True when line i is placed and drawn (enabled) right now. */
  lineDrawnNow(i: number): boolean {
    return this.cueLinesRoot.enabled && this.lineDrawn[i] === true && this.lines[i].enabled;
  }
  linePosition(i: number): vec3 {
    return this.lines[i].getTransform().getWorldPosition();
  }
  get lineOpacity(): number {
    return this.lineMat ? this.lineMat.mainPass.baseColor.w : 0;
  }
  /** True when line i's centre is inside the verticalFovDeg view (square) of the camera. */
  lineInView(i: number): boolean {
    return this.lineDrawnNow(i) && this.pointInView(this.linePosition(i));
  }

  /** Clears motion history, any cue and arming (marks, settings and floor are kept). */
  resetRuntime(): void {
    if (!this.ready) return;
    this.decider.reset();
    this.hideCue();
    this.lastState = "MONITORING";
  }

  /** Forgets the floor; the probe finds it again. */
  resetFloor(): void {
    this.floorYCm = null;
  }

  // ---------- per frame ----------

  private onUpdate(): void {
    if (!this.ready) return;
    const t = getTime();
    const camT = this.camera.getTransform();
    const p = camT.getWorldPosition();
    const look = camT.back;

    if (this.floorYCm === null && t - this.lastProbeT >= this.probeIntervalS) {
      this.lastProbeT = t;
      this.probeFloor(p, new vec3(0, -1, 0));
      this.probeFloor(p, look);
    }

    const st = this.decider.addSample({ t: t, x: p.x, z: p.z, fx: look.x, fz: look.z });
    if (st !== this.lastState) {
      if (this.debugLogs) print(`[Threshold] state ${this.lastState} -> ${st}`);
      this.lastState = st;
    }

    if (this.decider.cue === null) {
      if (this.cueShown) this.hideCue();
      return;
    }
    if (!this.linesPlaced && this.floorYCm !== null) this.placeLines(this.decider.cue);
    if (st === "CUE_ACTIVE" && this.decider.ending === null && !this.decider.lookedDown && this.looksDown(look)) {
      this.decider.reportLookedDown(t);
      if (this.debugLogs) print(`[Threshold] looked down ${this.decider.cueAge.toFixed(1)} s into the cue`);
    }
    const fade = this.decider.fade;
    this.setOpacity(this.lineMat, this.lineColor, fade);
    this.updateBeat(t, fade);
    this.updateChevron(p, look);
  }

  private onCueStart(c: CueInfo): void {
    this.cueShown = true;
    this.cueBpm = this.beatBpm;
    this._beatTimes = [];
    const door = this.allDoorways().filter((d) => d.sceneObject.name === c.doorId)[0];
    if (door) {
      const dp = door.sceneObject.getTransform().getWorldPosition();
      this.beatAudio.getSceneObject().getTransform().setWorldPosition(new vec3(dp.x, dp.y + BEAT_SOURCE_HEIGHT_CM, dp.z));
    }
    this.linesPlaced = false;
    if (this.floorYCm !== null) this.placeLines(c);
    this.nextBeatT = c.startT;
    this.chevronShown = false;
    print(`[Threshold] cue start at ${c.doorId}: beat ${this.cueBpm} BPM, lines ${this.firstLineDistanceCm} cm / ${this.lineSpacingCm} cm, floor ${this.floorYCm === null ? "not detected (audio only)" : "detected"}`);
  }

  private onEnding(outcome: CueOutcome, c: CueInfo, t: number): void {
    print(
      `[Threshold] cue outcome: ${outcome} at ${c.doorId} after ${(t - c.startT).toFixed(1)} s` +
        ` (session: ${this.decider.cueCount} cues, ${this.decider.recoveredCount} recovered, ${this.decider.unresolvedCount} unresolved)`
    );
  }

  private hideCue(): void {
    this.cueShown = false;
    this.linesPlaced = false;
    this.cueLinesRoot.enabled = false;
    this.chevronRoot.enabled = false;
    this.chevronShown = false;
    this.chevronMoving = false;
    if (this.beatAudio.isPlaying()) this.beatAudio.stop(false);
  }

  // ---------- lines ----------

  /** Lines at the cue-start point + u * d for d = first, first - s, first - 2s (u toward the doorway). */
  private placeLines(c: CueInfo): void {
    const y = (this.floorYCm as number) + LINE_LIFT_CM;
    const rot = quat.angleAxis(Math.atan2(-c.dirX, -c.dirZ), vec3.up()); // local -Z along u, local X across
    for (let i = 0; i < this.lines.length; i++) {
      const d = this.firstLineDistanceCm - i * this.lineSpacingCm;
      const drawn = d >= MIN_LINE_DISTANCE_CM;
      this.lineDrawn[i] = drawn;
      this.lines[i].enabled = drawn;
      if (!drawn) continue;
      const tr = this.lines[i].getTransform();
      tr.setWorldPosition(new vec3(c.startX + c.dirX * d, y, c.startZ + c.dirZ * d));
      tr.setWorldRotation(rot);
      tr.setWorldScale(new vec3(LINE_LENGTH_CM, LINE_THICKNESS_CM, LINE_WIDTH_CM));
    }
    this.setOpacity(this.lineMat, this.lineColor, this.decider.fade);
    this.cueLinesRoot.enabled = true;
    this.linesPlaced = true;
  }

  private looksDown(look: vec3): boolean {
    if (this.linesPlaced && this.lineDrawn[0]) return this.pointInView(this.linePosition(0));
    if (this.floorYCm !== null) return false; // lines are about to be placed
    // No floor detected: the pitch the farthest line would need over a floor nominalEyeHeightCm below.
    const pitch = Math.asin(clamp(-look.normalize().y, -1, 1)) / DEG;
    const need = Math.atan(this.nominalEyeHeightCm / this.firstLineDistanceCm) / DEG - this.verticalFovDeg / 2;
    return pitch >= need;
  }

  private pointInView(worldPoint: vec3): boolean {
    const local = this.camera.getTransform().getInvertedWorldTransform().multiplyPoint(worldPoint);
    if (local.z >= -1) return false;
    const half = (this.verticalFovDeg / 2) * DEG;
    return Math.abs(Math.atan2(local.y, -local.z)) <= half && Math.abs(Math.atan2(local.x, -local.z)) <= half;
  }

  // ---------- beat ----------

  private updateBeat(t: number, fade: number): void {
    this.beatAudio.volume = this.beatVolume * fade;
    if (fade <= 0) return;
    const interval = 60 / this.cueBpm;
    if (t + 1e-4 < this.nextBeatT) return;
    this.beatAudio.play(1);
    this._beatTimes.push(t);
    this.nextBeatT += interval;
    if (this.nextBeatT <= t) this.nextBeatT = t + interval; // fell behind (long frame): resync, never rush
  }

  // ---------- chevron ----------

  private updateChevron(p: vec3, look: vec3): void {
    const level = this.floorYCm === null ? 0 : this.decider.chevronLevel;
    if (level <= 0) {
      if (this.chevronRoot.enabled) this.chevronRoot.enabled = false;
      return;
    }
    let fx = look.x;
    let fz = look.z;
    const len = Math.sqrt(fx * fx + fz * fz);
    if (len > 0.05) {
      fx /= len;
      fz /= len;
    } else {
      fx = 0;
      fz = -1;
    }
    const target = new vec3(p.x + fx * CHEVRON_AHEAD_CM, p.y - CHEVRON_BELOW_EYES_CM, p.z + fz * CHEVRON_AHEAD_CM);
    const tr = this.chevronRoot.getTransform();
    if (!this.chevronShown) {
      this.chevronShown = true;
      this.chevronMoving = false;
      tr.setWorldPosition(target);
      this.chevronRoot.enabled = true;
    } else {
      const pos = tr.getWorldPosition();
      const delta = target.sub(pos);
      const dist = delta.length;
      if (!this.chevronMoving && dist > CHEVRON_DEADZONE_CM) this.chevronMoving = true;
      if (this.chevronMoving) {
        const dt = getDeltaTime();
        const step = Math.min(dist * (1 - Math.exp(-CHEVRON_SMOOTHING_PER_S * dt)), CHEVRON_MAX_SPEED_CM_PER_S * dt);
        if (dist > 1e-3) tr.setWorldPosition(pos.add(delta.uniformScale(step / dist)));
        if (dist - step < CHEVRON_SETTLE_CM) this.chevronMoving = false;
      }
    }
    // Face the person (the chevron is built facing +Z).
    const cp = tr.getWorldPosition();
    tr.setWorldRotation(quat.angleAxis(Math.atan2(p.x - cp.x, p.z - cp.z), vec3.up()));
    this.setOpacity(this.chevronMat, this.chevronColor, level);
    if (this.chevronText) {
      const c = this.chevronColor;
      this.chevronText.textFill.color = new vec4(c.x, c.y, c.z, level);
    }
  }

  private setOpacity(mat: Material | null, c: vec3, a: number): void {
    if (mat) mat.mainPass.baseColor = new vec4(c.x, c.y, c.z, a);
  }

  // ---------- doorways ----------

  private allDoorways(): Doorway[] {
    if (this.doorways) return this.doorways;
    const out: Doorway[] = [];
    const visit = (so: SceneObject) => {
      const d = so.getComponent(Doorway.getTypeName()) as Doorway;
      if (d) out.push(d);
      for (let i = 0; i < so.getChildrenCount(); i++) visit(so.getChild(i));
    };
    visit(this.doorwaysRoot);
    this.doorways = out;
    return out;
  }

  // ---------- floor probe ----------

  private setUpFloorProbe(): void {
    if (this.isEditor) {
      this.physicsProbe = Physics.createGlobalProbe();
      return;
    }
    try {
      const wq = require("LensStudio:WorldQueryModule") as WorldQueryModule;
      const opts = HitTestSessionOptions.create();
      opts.filter = true;
      this.hitSession = wq.createHitTestSessionWithOptions(opts);
      this.hitSession.start();
    } catch (e) {
      print(`[Threshold] WorldQuery unavailable (${e}); cues will be audio only`);
      this.hitSession = null;
    }
  }

  private probeFloor(from: vec3, dir: vec3): void {
    const to = from.add(dir.normalize().uniformScale(this.probeLengthCm));
    const camY = from.y;
    if (this.hitSession) {
      this.hitSession.hitTest(from, to, (hit: WorldQueryHitTestResult) => {
        if (hit) this.onFloorCandidate(hit.position, hit.normal, camY);
      });
    } else if (this.physicsProbe) {
      this.physicsProbe.rayCast(from, to, (hit: RayCastHit) => {
        if (hit) this.onFloorCandidate(hit.position, hit.normal, camY);
      });
    }
  }

  private onFloorCandidate(pos: vec3, normal: vec3, camY: number): void {
    if (this.floorYCm !== null) return;
    if (normal.normalize().y < FLOOR_NORMAL_MIN_Y || pos.y > camY - this.minFloorDropCm) return;
    this.floorYCm = pos.y;
    print(`[Threshold] floor detected ${(camY - pos.y).toFixed(0)} cm below the eyes`);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Clones the first mesh material under `root`, switches it to alpha blending and shares it with every mesh there. */
function shareClonedMaterial(root: SceneObject, overlay: boolean): Material | null {
  const visuals: RenderMeshVisual[] = [];
  const collect = (so: SceneObject) => {
    const rmv = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (rmv) visuals.push(rmv);
    for (let i = 0; i < so.getChildrenCount(); i++) collect(so.getChild(i));
  };
  collect(root);
  if (visuals.length === 0 || !visuals[0].mainMaterial) return null;
  const mat = visuals[0].mainMaterial.clone();
  mat.mainPass.blendMode = BlendMode.Normal;
  mat.mainPass.depthWrite = false;
  if (overlay) mat.mainPass.depthTest = false; // floating prompt: never hidden by the stand-in walls
  for (const v of visuals) v.mainMaterial = mat;
  return mat;
}
