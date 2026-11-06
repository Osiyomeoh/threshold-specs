/**
 * CueDecider — pure, deterministic cue logic (design brief "When things show"). NO scene references.
 *
 * Owns: the three states MONITORING / CUE_ACTIVE / RECOVERY, the cue-start conditions, recovery,
 * the engagement timeout, re-arming, and the outcome of each cue (RECOVERED or UNRESOLVED).
 * Inputs: samples {t (s), x, z (cm), fx, fz (horizontal head direction)}, the marked doorways,
 * and lookedDown() from the adapter once the farthest line is in view.
 * Must not: touch SceneObjects, components, getTime(), or any Lens runtime API.
 *
 * Cue start (all true, brief "The cue starts when all of these are true"):
 *   1. In a MARKED doorway's area: |distance to the doorway plane| <= AREA_DEPTH_CM (either side)
 *      and |offset along the plane| <= halfWidth + AREA_SIDE_MARGIN_CM.
 *   2. Stopped: windowed speed over SPEED_WINDOW_S below SPEED_THRESHOLD_CM_PER_S.
 *   3. Stopped for DWELL_S in a row (dwell is backdated to the window start once a full window
 *      qualifies, so the cue fires DWELL_S after the person actually stopped).
 *   4. Head direction within FACING_MAX_DEG of straight through the doorway for the whole dwell.
 *      "Straight through" is worked out for the side the person is on, so both approaches work
 *      and standing with your back to the doorway is facing away. Within PLANE_BAND_CM of the
 *      plane, either direction through counts.
 * Windowed speed: the largest XZ distance from the current position to any sample in the last
 * SPEED_WINDOW_S, divided by the window. Frame-to-frame speed is not used (tracking jitter).
 *
 * During CUE_ACTIVE:
 *   - progress = displacement since cue start, projected on the direction from the cue-start
 *     point to the doorway centre ("forward movement toward the marked doorway").
 *     progress >= RECOVERY_DISTANCE_CM -> RECOVERY (fade FADE_S) -> MONITORING, outcome RECOVERED.
 *   - timeout at TIMEOUT_S from cue start, or TIMEOUT_NO_LOOK_S if the person never looked down.
 *     Looking down never resets the timer. Fade FADE_S (state stays CUE_ACTIVE while fading,
 *     ending = "UNRESOLVED") -> MONITORING, outcome UNRESOLVED. A timeout is never RECOVERY.
 * Re-arm: after any ending, that doorway cannot start a new cue until the person has left its
 * area and come back.
 */

export type CueState = "MONITORING" | "CUE_ACTIVE" | "RECOVERY";
export type CueOutcome = "RECOVERED" | "UNRESOLVED";

export const AREA_DEPTH_CM = 100;
export const AREA_SIDE_MARGIN_CM = 50;
export const SPEED_WINDOW_S = 0.5;
export const SPEED_THRESHOLD_CM_PER_S = 5;
export const DWELL_S = 2;
export const FACING_MAX_DEG = 45;
export const PLANE_BAND_CM = 15;
export const RECOVERY_DISTANCE_CM = 80;
export const TIMEOUT_S = 15;
export const TIMEOUT_NO_LOOK_S = 8;
export const FADE_S = 1;
export const CHEVRON_GIVE_UP_S = 5;

export interface Doorway {
  id: string;
  /** floor-plane centre of the opening, cm */
  center: { x: number; z: number };
  /** horizontal unit normal of the doorway plane (either way) */
  normal: { x: number; z: number };
  /** half the opening width, cm */
  halfWidth: number;
}

export interface Sample {
  /** seconds */
  t: number;
  /** cm */
  x: number;
  /** cm */
  z: number;
  /** horizontal head direction (need not be unit length) */
  fx: number;
  fz: number;
}

export interface CueInfo {
  doorId: string;
  startT: number;
  startX: number;
  startZ: number;
  /** unit horizontal direction from the cue-start point toward the doorway centre */
  dirX: number;
  dirZ: number;
}

const COS_FACING = Math.cos((FACING_MAX_DEG * Math.PI) / 180);

export class CueDecider {
  private doors: Doorway[] = [];
  private armed: { [id: string]: boolean } = {};
  private history: Sample[] = [];
  private dwellStart: number | null = null;
  private dwellDoorId: string | null = null;
  private lastBadT = -Infinity;
  private _state: CueState = "MONITORING";
  private _cue: CueInfo | null = null;
  private _lookedDownT: number | null = null;
  private _ending: CueOutcome | null = null;
  private _endingT = 0;
  private _outcome: CueOutcome | null = null;
  private _progress = 0;
  private _lastT = 0;
  private _detection = true;
  private _cueCount = 0;
  private _unresolvedCount = 0;
  private _recoveredCount = 0;
  /** called once per cue ending (at the moment it is decided) */
  onEnding: ((outcome: CueOutcome, info: CueInfo, t: number) => void) | null = null;
  /** called when a cue starts */
  onCueStart: ((info: CueInfo) => void) | null = null;

  // ---------- configuration ----------

  /** Replaces the set of MARKED doorways. Newly added doorways start armed. */
  setMarkedDoorways(doors: Doorway[]): void {
    const next: { [id: string]: boolean } = {};
    for (const d of doors) next[d.id] = this.armed[d.id] === undefined ? true : this.armed[d.id];
    this.doors = doors.slice();
    this.armed = next;
  }

  /** When false, no NEW cue can start (an active cue still runs to its normal ending). */
  setDetectionEnabled(on: boolean): void {
    this._detection = on;
    if (!on) this.clearDwell();
  }

  get detectionEnabled(): boolean {
    return this._detection;
  }

  /** Clears motion history, any cue and all arming. Outcome counters are kept. */
  reset(): void {
    this.history = [];
    this.clearDwell();
    this.lastBadT = -Infinity;
    this._state = "MONITORING";
    this._cue = null;
    this._lookedDownT = null;
    this._ending = null;
    this._progress = 0;
    for (const id in this.armed) this.armed[id] = true;
  }

  // ---------- read-outs ----------

  get state(): CueState {
    return this._state;
  }
  get cue(): CueInfo | null {
    return this._cue;
  }
  /** "RECOVERED" / "UNRESOLVED" while a cue is fading out, else null */
  get ending(): CueOutcome | null {
    return this._ending;
  }
  /** outcome of the most recent finished (or ending) cue */
  get lastOutcome(): CueOutcome | null {
    return this._outcome;
  }
  get lookedDown(): boolean {
    return this._lookedDownT !== null;
  }
  /** seconds since the cue started (0 when no cue) */
  get cueAge(): number {
    return this._cue ? this._lastT - this._cue.startT : 0;
  }
  /** forward progress (cm) since cue start */
  get progress(): number {
    return this._progress;
  }
  /** seconds of the current qualifying dwell (0 if none) */
  get dwellSeconds(): number {
    return this.dwellStart === null ? 0 : Math.max(0, this._lastT - this.dwellStart);
  }
  get cueCount(): number {
    return this._cueCount;
  }
  get recoveredCount(): number {
    return this._recoveredCount;
  }
  get unresolvedCount(): number {
    return this._unresolvedCount;
  }
  isArmed(id: string): boolean {
    return this.armed[id] === true;
  }

  /** 1 while the cue is fully shown, ramping to 0 over FADE_S while ending; 0 with no cue. */
  get fade(): number {
    if (!this._cue) return 0;
    if (this._ending === null) return 1;
    return Math.max(0, 1 - (this._lastT - this._endingT) / FADE_S);
  }

  /** Chevron visibility factor: 1 until looked down / given up, fades out over FADE_S after 5 s. */
  get chevronLevel(): number {
    if (!this._cue || this._lookedDownT !== null) return 0;
    const age = this._lastT - this._cue.startT;
    const giveUp = age <= CHEVRON_GIVE_UP_S ? 1 : Math.max(0, 1 - (age - CHEVRON_GIVE_UP_S) / FADE_S);
    return Math.min(giveUp, this.fade);
  }

  // ---------- input ----------

  /** Adapter reports the farthest line came into view (or, with no floor, the head tilted down). */
  reportLookedDown(t: number): void {
    if (this._state === "CUE_ACTIVE" && this._ending === null && this._lookedDownT === null) this._lookedDownT = t;
  }

  addSample(s: Sample): CueState {
    this._lastT = s.t;
    this.history.push(s);
    while (this.history.length > 2 && s.t - this.history[1].t >= SPEED_WINDOW_S) this.history.shift();

    // Re-arm doorways the person is outside of.
    for (const d of this.doors) if (!this.armed[d.id] && !inArea(d, s.x, s.z)) this.armed[d.id] = true;

    if (this._state === "MONITORING") this.monitor(s);
    else this.runCue(s);
    return this._state;
  }

  // ---------- internals ----------

  private monitor(s: Sample): void {
    if (!this._detection) return;
    const door = this.qualifyingDoor(s);
    if (!door) {
      this.lastBadT = s.t;
      this.clearDwell();
      return;
    }
    if (this.dwellDoorId !== door.id) {
      this.clearDwell();
      this.dwellDoorId = door.id;
    }
    const oldest = this.history[0];
    const span = s.t - oldest.t;
    if (span < SPEED_WINDOW_S - 1e-6) return; // not enough history to judge speed yet
    let maxD = 0;
    for (const h of this.history) {
      const dx = h.x - s.x;
      const dz = h.z - s.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > maxD) maxD = d;
    }
    const speed = maxD / span;
    if (speed >= SPEED_THRESHOLD_CM_PER_S) {
      this.dwellStart = null;
      return;
    }
    if (this.dwellStart === null) this.dwellStart = Math.max(s.t - span, this.lastBadT);
    if (s.t - this.dwellStart >= DWELL_S - 1e-6) this.startCue(door, s);
  }

  /** The armed marked doorway whose area contains the person AND that they face, else null. */
  private qualifyingDoor(s: Sample): Doorway | null {
    for (const d of this.doors) {
      if (!this.armed[d.id] || !inArea(d, s.x, s.z)) continue;
      if (facesThrough(d, s)) return d;
    }
    return null;
  }

  private startCue(door: Doorway, s: Sample): void {
    let dx = door.center.x - s.x;
    let dz = door.center.z - s.z;
    let len = Math.sqrt(dx * dx + dz * dz);
    if (len < PLANE_BAND_CM) {
      // Standing at the centre: forward is the through-direction the head points along.
      const along = s.fx * door.normal.x + s.fz * door.normal.z;
      const sign = along >= 0 ? 1 : -1;
      dx = door.normal.x * sign;
      dz = door.normal.z * sign;
      len = 1;
    }
    this._cue = { doorId: door.id, startT: s.t, startX: s.x, startZ: s.z, dirX: dx / len, dirZ: dz / len };
    this._state = "CUE_ACTIVE";
    this._lookedDownT = null;
    this._ending = null;
    this._progress = 0;
    this._cueCount++;
    this.armed[door.id] = false;
    this.clearDwell();
    if (this.onCueStart) this.onCueStart(this._cue);
  }

  private runCue(s: Sample): void {
    const cue = this._cue!;
    if (this._ending !== null) {
      if (s.t - this._endingT >= FADE_S - 1e-6) this.finish();
      return;
    }
    this._progress = (s.x - cue.startX) * cue.dirX + (s.z - cue.startZ) * cue.dirZ;
    const age = s.t - cue.startT;
    if (this._progress >= RECOVERY_DISTANCE_CM) {
      this.beginEnding("RECOVERED", s.t);
      this._state = "RECOVERY";
      return;
    }
    const limit = this._lookedDownT === null ? TIMEOUT_NO_LOOK_S : TIMEOUT_S;
    if (age >= limit - 1e-6) this.beginEnding("UNRESOLVED", s.t);
  }

  private beginEnding(outcome: CueOutcome, t: number): void {
    this._ending = outcome;
    this._endingT = t;
    this._outcome = outcome;
    if (outcome === "RECOVERED") this._recoveredCount++;
    else this._unresolvedCount++;
    if (this.onEnding) this.onEnding(outcome, this._cue!, t);
  }

  private finish(): void {
    this._state = "MONITORING";
    this._cue = null;
    this._ending = null;
    this._lookedDownT = null;
    this._progress = 0;
    this.clearDwell();
    this.history = this.history.slice(-1);
  }

  private clearDwell(): void {
    this.dwellStart = null;
    this.dwellDoorId = null;
  }
}

/** Area test (brief cue-start condition 1). Measured the same way for every doorway. */
export function inArea(d: Doorway, x: number, z: number): boolean {
  const rx = x - d.center.x;
  const rz = z - d.center.z;
  const across = rx * d.normal.x + rz * d.normal.z; // distance from the plane
  const along = rx * -d.normal.z + rz * d.normal.x; // offset along the plane
  return Math.abs(across) <= AREA_DEPTH_CM && Math.abs(along) <= d.halfWidth + AREA_SIDE_MARGIN_CM;
}

/**
 * Facing test (brief cue-start condition 4): head direction within FACING_MAX_DEG of straight
 * through the doorway, from the side the person is on. Near the plane either way counts.
 */
export function facesThrough(d: Doorway, s: Sample): boolean {
  const flen = Math.sqrt(s.fx * s.fx + s.fz * s.fz);
  if (flen < 1e-6) return false;
  const cosN = (s.fx * d.normal.x + s.fz * d.normal.z) / flen;
  const across = (s.x - d.center.x) * d.normal.x + (s.z - d.center.z) * d.normal.z;
  if (Math.abs(across) <= PLANE_BAND_CM) return Math.abs(cosN) >= COS_FACING;
  // On the +normal side, through means heading along -normal (and vice versa).
  return (across > 0 ? -cosN : cosN) >= COS_FACING;
}
