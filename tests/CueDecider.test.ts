/**
 * Logic tests for CueDecider (design brief "When things show"). Pure Node, no Lens Studio.
 * Run from the project root:  node --test tests/CueDecider.test.ts
 * Node >= 22.18 / 23.6 strips the TypeScript types natively.
 *
 * Geometry mirrors the stand-in room: two doorways at z = -400, centres x = -100 (marked) and
 * x = +100 (unmarked), opening 110 cm wide (halfWidth 55), normal +Z. The person starts at z = 0
 * and faces -Z (toward the wall). Sampling at 60 Hz, times in seconds, distances in cm.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CueDecider, inArea, facesThrough, type CueState, type Doorway } from "../Assets/Scripts/CueDecider.ts";

const LEFT: Doorway = { id: "L", center: { x: -100, z: -400 }, normal: { x: 0, z: 1 }, halfWidth: 55 };
const RIGHT: Doorway = { id: "R", center: { x: 100, z: -400 }, normal: { x: 0, z: 1 }, halfWidth: 55 };
const DT = 1 / 60;

interface P {
  x: number;
  z: number;
  fx: number;
  fz: number;
}
interface Trace {
  t: number;
  st: CueState;
  fade: number;
}

const toWall = (x: number, z: number): P => ({ x, z, fx: 0, fz: -1 });
const awayFromWall = (x: number, z: number): P => ({ x, z, fx: 0, fz: 1 });

function rngFrom(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648) * 2 - 1;
  };
}

/** Feeds samples from t0 (inclusive) to t1 (exclusive). */
function run(d: CueDecider, t0: number, t1: number, pos: (t: number) => P, jitterCm = 0): Trace[] {
  const rnd = rngFrom(12345);
  const out: Trace[] = [];
  const n = Math.round((t1 - t0) / DT);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * DT;
    const p = pos(t);
    const st = d.addSample({ t, x: p.x + rnd() * jitterCm, z: p.z + rnd() * jitterCm, fx: p.fx, fz: p.fz });
    out.push({ t, st, fade: d.fade });
  }
  return out;
}

const firstTime = (tr: Trace[], st: CueState) => {
  for (const e of tr) if (e.st === st) return e.t;
  return null;
};

function marked(): CueDecider {
  const d = new CueDecider();
  d.setMarkedDoorways([LEFT]);
  return d;
}

/** Walk from z=0 to z=-330 in front of the marked doorway (1 s at 330 cm/s), then stand. */
function approachAndStand(d: CueDecider, x: number, standUntil: number, face = toWall): Trace[] {
  const walk = run(d, 0, 1, (t) => toWall(x, -330 * t));
  const stand = run(d, 1, standUntil, () => face(x, -330));
  return walk.concat(stand);
}

// ---------- area and facing ----------

test("area: within 1 m of the plane either side and halfWidth + 50 along it", () => {
  assert.equal(inArea(LEFT, -100, -301), true);
  assert.equal(inArea(LEFT, -100, -499), true);
  assert.equal(inArea(LEFT, -100, -299), false);
  assert.equal(inArea(LEFT, -100 + 104, -400), true);
  assert.equal(inArea(LEFT, -100 + 106, -400), false);
});

test("facing: both approaches count, back to the doorway does not", () => {
  assert.equal(facesThrough(LEFT, { t: 0, x: -100, z: -330, fx: 0, fz: -1 }), true);
  assert.equal(facesThrough(LEFT, { t: 0, x: -100, z: -470, fx: 0, fz: 1 }), true);
  assert.equal(facesThrough(LEFT, { t: 0, x: -100, z: -330, fx: 0, fz: 1 }), false);
  // 44 deg off straight-through counts, 46 deg does not
  const r = (deg: number) => (deg * Math.PI) / 180;
  assert.equal(facesThrough(LEFT, { t: 0, x: -100, z: -330, fx: Math.sin(r(44)), fz: -Math.cos(r(44)) }), true);
  assert.equal(facesThrough(LEFT, { t: 0, x: -100, z: -330, fx: Math.sin(r(46)), fz: -Math.cos(r(46)) }), false);
});

// ---------- activation (done criterion 2) ----------

test("stopping at the marked doorway facing it for 2 s starts the cue at ~2 s", () => {
  const d = marked();
  const tr = approachAndStand(d, -100, 5);
  const t = firstTime(tr, "CUE_ACTIVE");
  assert.ok(t !== null, "cue should start");
  assert.ok(t! >= 2.95 && t! <= 3.1, `cue at ${t}, expected ~3.0 (stopped at 1.0)`);
  assert.equal(d.cueCount, 1);
});

test("stopping at the marked doorway for under 2 s does not cue", () => {
  const d = marked();
  run(d, 0, 1, (t) => toWall(-100, -330 * t));
  run(d, 1, 2.8, () => toWall(-100, -330)); // 1.8 s stop
  const tr = run(d, 2.8, 6, (t) => toWall(-100 + (t - 2.8) * 30, -330)); // walks sideways at 30 cm/s
  assert.equal(firstTime(tr, "CUE_ACTIVE"), null);
  assert.equal(d.cueCount, 0);
});

test("stopping at the unmarked doorway never cues", () => {
  const d = marked();
  const tr = approachAndStand(d, 100, 10);
  assert.equal(firstTime(tr, "CUE_ACTIVE"), null);
});

test("standing in the marked doorway area facing away for over 2 s does not cue", () => {
  const d = marked();
  const tr = approachAndStand(d, -100, 8, awayFromWall);
  assert.equal(firstTime(tr, "CUE_ACTIVE"), null);
});

test("facing must hold for the whole 2 s: turning away part-way restarts the dwell", () => {
  const d = marked();
  run(d, 0, 1, (t) => toWall(-100, -330 * t));
  run(d, 1, 2.5, () => toWall(-100, -330));
  run(d, 2.5, 2.7, () => awayFromWall(-100, -330));
  const tr = run(d, 2.7, 6, () => toWall(-100, -330));
  const t = firstTime(tr, "CUE_ACTIVE");
  assert.ok(t !== null && t >= 4.65 && t <= 4.8, `cue at ${t}, expected ~4.7`);
});

test("slow walking (10 cm/s) is not stopped; standing with 1 cm jitter is", () => {
  const slow = marked();
  run(slow, 0, 1, (t) => toWall(-100, -330 * t));
  const trSlow = run(slow, 1, 6, (t) => toWall(-100, -330 - (t - 1) * 10));
  assert.equal(firstTime(trSlow, "CUE_ACTIVE"), null);

  const jit = marked();
  run(jit, 0, 1, (t) => toWall(-100, -330 * t));
  const trJit = run(jit, 1, 5, () => toWall(-100, -330), 1);
  assert.notEqual(firstTime(trJit, "CUE_ACTIVE"), null);
});

test("approaching from the other side also cues", () => {
  const d = marked();
  run(d, 0, 1, (t) => ({ x: -100, z: -800 + 330 * t, fx: 0, fz: 1 }));
  const tr = run(d, 1, 5, () => ({ x: -100, z: -470, fx: 0, fz: 1 }));
  assert.notEqual(firstTime(tr, "CUE_ACTIVE"), null);
});

test("detection disabled (setup open) starts no cue", () => {
  const d = marked();
  d.setDetectionEnabled(false);
  const tr = approachAndStand(d, -100, 6);
  assert.equal(firstTime(tr, "CUE_ACTIVE"), null);
});

// ---------- recovery (done criterion 5) ----------

test("~80 cm forward from the cue-start point -> RECOVERY, 1 s fade, MONITORING, RECOVERED", () => {
  const d = marked();
  approachAndStand(d, -100, 3.1);
  assert.equal(d.state, "CUE_ACTIVE");
  // walk through at 60 cm/s
  const tr = run(d, 3.1, 6, (t) => toWall(-100, -330 - Math.min(150, (t - 3.1) * 60)));
  const tRec = firstTime(tr, "RECOVERY");
  assert.ok(tRec !== null, "should enter RECOVERY");
  const walked = (tRec! - 3.1) * 60;
  assert.ok(walked >= 79 && walked <= 82, `recovered after ${walked} cm`);
  const tMon = tr.find((e) => e.t > tRec! && e.st === "MONITORING")?.t;
  assert.ok(tMon !== undefined && Math.abs(tMon - tRec! - 1) < 0.05, `fade lasted ${tMon! - tRec!} s`);
  const mid = tr.find((e) => e.t >= tRec! + 0.5)!;
  assert.ok(mid.fade > 0.4 && mid.fade < 0.6, `mid-fade ${mid.fade}`);
  assert.equal(d.lastOutcome, "RECOVERED");
  assert.equal(d.recoveredCount, 1);
  assert.equal(d.unresolvedCount, 0);
});

// ---------- timeout (done criterion 4) ----------

test("never looked down -> fades at 8 s, UNRESOLVED, never RECOVERY", () => {
  const d = marked();
  const tr = approachAndStand(d, -100, 14);
  const tCue = firstTime(tr, "CUE_ACTIVE")!;
  assert.equal(firstTime(tr, "RECOVERY"), null);
  const tMon = tr.find((e) => e.t > tCue && e.st === "MONITORING")!.t;
  assert.ok(Math.abs(tMon - tCue - 9) < 0.05, `cue lasted ${tMon - tCue} s (8 s + 1 s fade)`);
  assert.equal(d.lastOutcome, "UNRESOLVED");
});

test("looked down at 3 s -> timer not reset, fades at 15 s, UNRESOLVED", () => {
  const d = marked();
  let tCue = -1;
  d.onCueStart = (c) => (tCue = c.startT);
  approachAndStand(d, -100, 3.1);
  d.reportLookedDown(tCue + 3);
  const ends: string[] = [];
  let endT = -1;
  d.onEnding = (o, _c, t) => {
    ends.push(o);
    endT = t;
  };
  const tr = run(d, 3.1, 22, () => toWall(-100, -330));
  assert.deepEqual(ends, ["UNRESOLVED"]);
  assert.ok(Math.abs(endT - tCue - 15) < 0.05, `ended at ${endT - tCue} s`);
  assert.equal(firstTime(tr, "RECOVERY"), null);
  const tMon = tr.find((e) => e.st === "MONITORING")!.t;
  assert.ok(Math.abs(tMon - tCue - 16) < 0.05);
});

test("chevron level: shown until 5 s, gone by 6 s; hidden once looked down", () => {
  const d = marked();
  let tCue = -1;
  d.onCueStart = (c) => (tCue = c.startT);
  approachAndStand(d, -100, 3.1);
  run(d, 3.1, tCue + 4.9, () => toWall(-100, -330));
  assert.equal(d.chevronLevel, 1);
  run(d, tCue + 4.9, tCue + 5.5, () => toWall(-100, -330));
  assert.ok(d.chevronLevel > 0.4 && d.chevronLevel < 0.6, `level ${d.chevronLevel}`);
  run(d, tCue + 5.5, tCue + 6.1, () => toWall(-100, -330));
  assert.equal(d.chevronLevel, 0);
  assert.equal(d.state, "CUE_ACTIVE", "beat continues after the chevron gives up");

  const e = marked();
  approachAndStand(e, -100, 3.1);
  e.reportLookedDown(3.2);
  assert.equal(e.chevronLevel, 0);
});

// ---------- re-arm ----------

test("re-arm only after leaving the doorway area and coming back", () => {
  const d = marked();
  approachAndStand(d, -100, 14); // cue + timeout + fade, still standing
  assert.equal(d.cueCount, 1);
  run(d, 14, 20, () => toWall(-100, -330));
  assert.equal(d.cueCount, 1, "no new cue while staying in the area");
  run(d, 20, 21, (t) => toWall(-100, -330 + (t - 20) * 100)); // back out to z = -230
  assert.equal(d.isArmed("L"), true);
  run(d, 21, 22, (t) => toWall(-100, -230 - (t - 21) * 100)); // in again
  run(d, 22, 25, () => toWall(-100, -330));
  assert.equal(d.cueCount, 2);
});
