import type { FaceShape, Point } from "./face-analysis";
import type { FaceBlueprint } from "./face-blueprint";

/**
 * Turns MediaPipe face landmarks into a makeup artist's face chart: the exact
 * region a product belongs on, and the direction it should be moved.
 *
 * Everything is computed in "display space", where y runs 0..1 down the photo
 * and x runs 0..aspect across it. That keeps circles round and perpendiculars
 * square no matter the photo's aspect ratio, and it matches the SVG viewBox
 * `0 0 ${aspect} 1` that PlacementGuide renders into.
 */

export type LessonRegion =
  | "all-face" | "complexion" | "forehead" | "both-cheeks" | "left-cheek" | "right-cheek"
  | "both-eyes" | "left-eye" | "right-eye" | "brows" | "nose" | "lips" | "jaw" | "none";

export type Technique =
  | "prep" | "base" | "conceal" | "contour" | "blush" | "highlight"
  | "eyes" | "eyeliner" | "brow" | "lips" | "finish";

/** One marked area on the face chart. */
export type PlacementZone = {
  /** Stable key for React and for tests. */
  id: string;
  /** Human label for the numbered badge, e.g. "Left cheek". */
  label: string;
  /** Closed SVG path outlining where the product goes. */
  outline: string;
  /** Open SVG paths showing which way to move the product. */
  arrows: string[];
  /** Where to place the numbered badge, in display space. */
  anchor: Point;
  /** -1 = image left, 0 = centre, 1 = image right. Used to flip label offsets. */
  side: -1 | 0 | 1;
};

/* ------------------------------------------------------------------ */
/* Landmark indices (MediaPipe canonical 468-point face mesh)          */
/* ------------------------------------------------------------------ */

const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
// "L"/"R" below are image-space: EYE_L sits on the left of the photo, which is
// the subject's right eye. Region names the user sees follow the app's existing
// convention, where "left-cheek" means the user's own left (image right).
const EYE_L = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_R = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const BROW_L = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_R = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];

const IDX = {
  top: 10, chin: 152, edgeL: 234, edgeR: 454, templeL: 127, templeR: 356,
  jawL: 172, jawR: 397, browTopL: 105, browTopR: 334,
  eyeInnerL: 133, eyeOuterL: 33, eyeInnerR: 362, eyeOuterR: 263,
  eyeUpperL: 159, eyeLowerL: 145, eyeUpperR: 386, eyeLowerR: 374,
  noseTop: 168, noseTip: 4, noseBottom: 2, noseAlarL: 98, noseAlarR: 327,
  mouthL: 61, mouthR: 291, lipTop: 0, lipBottom: 17,
};

/* ------------------------------------------------------------------ */
/* Small vector helpers                                               */
/* ------------------------------------------------------------------ */

const pt = (x: number, y: number): Point => ({ x, y });
const lerp = (a: Point, b: Point, t: number): Point => pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const shift = (p: Point, dx: number, dy: number): Point => pt(p.x + dx, p.y + dy);
const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const round = (n: number) => Math.round(n * 10000) / 10000;

const centroid = (points: Point[]): Point => {
  if (!points.length) return pt(0, 0);
  const sum = points.reduce((total, item) => pt(total.x + item.x, total.y + item.y), pt(0, 0));
  return pt(sum.x / points.length, sum.y / points.length);
};

/** Unit normal (rotated tangent) at index i of an open polyline. */
const normalAt = (line: Point[], index: number): Point => {
  const before = line[Math.max(0, index - 1)];
  const after = line[Math.min(line.length - 1, index + 1)];
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const size = Math.hypot(dx, dy) || 1;
  return pt(-dy / size, dx / size);
};

/* ------------------------------------------------------------------ */
/* Path building                                                      */
/* ------------------------------------------------------------------ */

const move = (p: Point) => `M ${round(p.x)} ${round(p.y)}`;
const curve = (c1: Point, c2: Point, to: Point) =>
  `C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(to.x)} ${round(to.y)}`;

/**
 * Catmull-Rom spline through every supplied point, emitted as cubic beziers so
 * outlines read as drawn curves rather than faceted polygons.
 */
export function smooth(points: Point[], closed: boolean): string {
  const list = points.filter(item => item && Number.isFinite(item.x) && Number.isFinite(item.y));
  if (list.length < 2) return "";
  if (list.length === 2) return `${move(list[0])} L ${round(list[1].x)} ${round(list[1].y)}`;
  const at = (index: number) => {
    if (closed) return list[(index + list.length) % list.length];
    return list[Math.min(list.length - 1, Math.max(0, index))];
  };
  const last = closed ? list.length : list.length - 1;
  let path = move(list[0]);
  for (let index = 0; index < last; index += 1) {
    const p0 = at(index - 1);
    const p1 = at(index);
    const p2 = at(index + 1);
    const p3 = at(index + 2);
    path += ` ${curve(
      pt(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6),
      pt(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6),
      p2,
    )}`;
  }
  return closed ? `${path} Z` : path;
}

/**
 * A closed band around a centreline — used for contour sweeps, the jawline and
 * nose sides, where a product sits as a stripe rather than a blob. `widths` is
 * the half-thickness at each centreline point, so bands can taper.
 */
export function band(centerline: Point[], widths: number[]): string {
  if (centerline.length < 2) return "";
  const upper: Point[] = [];
  const lower: Point[] = [];
  centerline.forEach((point, index) => {
    const normal = normalAt(centerline, index);
    const half = widths[Math.min(index, widths.length - 1)];
    upper.push(shift(point, normal.x * half, normal.y * half));
    lower.push(shift(point, -normal.x * half, -normal.y * half));
  });
  // The two long sides are splined, but the end caps are straight lines. Running
  // one closed spline around the whole outline instead makes the curve overshoot
  // at the sharp corners, which shows up as little hooks at each end of the band.
  const along = smooth(upper, false);
  const back = smooth([...lower].reverse(), false);
  if (!along || !back) return "";
  return `${along} ${back.replace(/^M/, "L")} Z`;
}

/** An oval rotated by `angle` radians, as a smooth closed path. */
export function oval(center: Point, rx: number, ry: number, angle = 0, steps = 16): string {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ring: Point[] = [];
  for (let index = 0; index < steps; index += 1) {
    const theta = (index / steps) * Math.PI * 2;
    const x = Math.cos(theta) * rx;
    const y = Math.sin(theta) * ry;
    ring.push(pt(center.x + x * cos - y * sin, center.y + x * sin + y * cos));
  }
  return smooth(ring, true);
}

/** An open, slightly bowed stroke from a to b — the direction-of-blending arrow. */
export function arrow(from: Point, to: Point, bow = 0.18): string {
  const midpoint = lerp(from, to, 0.5);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const control = pt(midpoint.x - dy * bow, midpoint.y + dx * bow);
  return `${move(from)} Q ${round(control.x)} ${round(control.y)} ${round(to.x)} ${round(to.y)}`;
}

/* ------------------------------------------------------------------ */
/* Face anchors                                                       */
/* ------------------------------------------------------------------ */

export type FaceAnchors = {
  oval: Point[]; eyeL: Point[]; eyeR: Point[]; browL: Point[]; browR: Point[]; lips: Point[];
  top: Point; chin: Point; edgeL: Point; edgeR: Point; templeL: Point; templeR: Point;
  jawL: Point; jawR: Point; eyeCenterL: Point; eyeCenterR: Point;
  eyeInnerL: Point; eyeOuterL: Point; eyeInnerR: Point; eyeOuterR: Point;
  browTopL: Point; browTopR: Point;
  noseTop: Point; noseTip: Point; noseBottom: Point; noseAlarL: Point; noseAlarR: Point;
  mouthL: Point; mouthR: Point; lipTop: Point; lipBottom: Point;
  width: number; height: number; centerX: number;
  /** True when real landmarks were used rather than the generic fallback face. */
  mapped: boolean;
};

/** A plain oval face, used when a scan is unavailable so the chart still reads. */
function fallbackAnchors(aspect: number): FaceAnchors {
  const cx = aspect / 2;
  const ring: Point[] = [];
  for (let index = 0; index < 24; index += 1) {
    const theta = (index / 24) * Math.PI * 2 - Math.PI / 2;
    ring.push(pt(cx + Math.cos(theta) * 0.21 * aspect, 0.5 + Math.sin(theta) * 0.38));
  }
  const eyeRing = (center: Point) => {
    const list: Point[] = [];
    for (let index = 0; index < 12; index += 1) {
      const theta = (index / 12) * Math.PI * 2;
      list.push(pt(center.x + Math.cos(theta) * 0.055 * aspect, center.y + Math.sin(theta) * 0.022));
    }
    return list;
  };
  const eyeCenterL = pt(cx - 0.1 * aspect, 0.4);
  const eyeCenterR = pt(cx + 0.1 * aspect, 0.4);
  const browRing = (center: Point) => [
    shift(center, -0.075 * aspect, -0.075), shift(center, -0.02 * aspect, -0.095),
    shift(center, 0.05 * aspect, -0.082), shift(center, 0.05 * aspect, -0.062),
    shift(center, -0.02 * aspect, -0.072), shift(center, -0.075 * aspect, -0.058),
  ];
  const lipRing: Point[] = [];
  for (let index = 0; index < 14; index += 1) {
    const theta = (index / 14) * Math.PI * 2;
    lipRing.push(pt(cx + Math.cos(theta) * 0.075 * aspect, 0.7 + Math.sin(theta) * 0.032));
  }
  return {
    oval: ring, eyeL: eyeRing(eyeCenterL), eyeR: eyeRing(eyeCenterR),
    browL: browRing(eyeCenterL), browR: browRing(eyeCenterR), lips: lipRing,
    top: pt(cx, 0.12), chin: pt(cx, 0.88), edgeL: pt(cx - 0.21 * aspect, 0.5), edgeR: pt(cx + 0.21 * aspect, 0.5),
    templeL: pt(cx - 0.19 * aspect, 0.34), templeR: pt(cx + 0.19 * aspect, 0.34),
    jawL: pt(cx - 0.17 * aspect, 0.72), jawR: pt(cx + 0.17 * aspect, 0.72),
    eyeCenterL, eyeCenterR,
    eyeInnerL: shift(eyeCenterL, 0.055 * aspect, 0), eyeOuterL: shift(eyeCenterL, -0.055 * aspect, 0),
    eyeInnerR: shift(eyeCenterR, -0.055 * aspect, 0), eyeOuterR: shift(eyeCenterR, 0.055 * aspect, 0),
    browTopL: shift(eyeCenterL, -0.02 * aspect, -0.095), browTopR: shift(eyeCenterR, 0.02 * aspect, -0.095),
    noseTop: pt(cx, 0.4), noseTip: pt(cx, 0.58), noseBottom: pt(cx, 0.62),
    noseAlarL: pt(cx - 0.04 * aspect, 0.6), noseAlarR: pt(cx + 0.04 * aspect, 0.6),
    mouthL: pt(cx - 0.075 * aspect, 0.7), mouthR: pt(cx + 0.075 * aspect, 0.7),
    lipTop: pt(cx, 0.668), lipBottom: pt(cx, 0.732),
    width: 0.42 * aspect, height: 0.76, centerX: cx, mapped: false,
  };
}

/** Reads landmarks into named anchors, converting to display space. */
export function faceAnchors(points: Point[], aspect: number): FaceAnchors {
  const usable = Array.isArray(points) && points.length >= 468;
  if (!usable) return fallbackAnchors(aspect);
  const at = (index: number): Point => {
    const found = points[index];
    return pt((found?.x ?? 0.5) * aspect, found?.y ?? 0.5);
  };
  const ring = (list: number[]) => list.map(at);
  const eyeL = ring(EYE_L);
  const eyeR = ring(EYE_R);
  const edgeL = at(IDX.edgeL);
  const edgeR = at(IDX.edgeR);
  const top = at(IDX.top);
  const chin = at(IDX.chin);
  return {
    oval: ring(FACE_OVAL), eyeL, eyeR, browL: ring(BROW_L), browR: ring(BROW_R), lips: ring(LIPS),
    top, chin, edgeL, edgeR, templeL: at(IDX.templeL), templeR: at(IDX.templeR),
    jawL: at(IDX.jawL), jawR: at(IDX.jawR),
    eyeCenterL: centroid(eyeL), eyeCenterR: centroid(eyeR),
    eyeInnerL: at(IDX.eyeInnerL), eyeOuterL: at(IDX.eyeOuterL),
    eyeInnerR: at(IDX.eyeInnerR), eyeOuterR: at(IDX.eyeOuterR),
    browTopL: at(IDX.browTopL), browTopR: at(IDX.browTopR),
    noseTop: at(IDX.noseTop), noseTip: at(IDX.noseTip), noseBottom: at(IDX.noseBottom),
    noseAlarL: at(IDX.noseAlarL), noseAlarR: at(IDX.noseAlarR),
    mouthL: at(IDX.mouthL), mouthR: at(IDX.mouthR), lipTop: at(IDX.lipTop), lipBottom: at(IDX.lipBottom),
    width: Math.max(0.001, edgeR.x - edgeL.x), height: Math.max(0.001, chin.y - top.y),
    centerX: (edgeL.x + edgeR.x) / 2, mapped: true,
  };
}

/* ------------------------------------------------------------------ */
/* Face-shape tuning                                                  */
/* ------------------------------------------------------------------ */

/** All values are fractions of the measured face, so tuning is size-independent. */
type Tuning = {
  /** How far above the apple the blush sweep ends, as a fraction of face height. */
  blushLift: number;
  /** How far in from the face edge the sweep stops, as a fraction of face width. */
  blushInset: number;
  /** How far below the apple the contour sweep ends, as a fraction of face height. */
  contourDrop: number;
  /** How far from the face edge toward the pupil the contour may travel (0-1). */
  contourReach: number;
  /** Extra shading at the hairline, for longer faces. */
  lengthSoftening: boolean;
};

const TUNING: Record<FaceShape, Tuning> = {
  // Balance a wider forehead and narrower chin: colour stays low, contour short.
  heart: { blushLift: 0.06, blushInset: 0.16, contourDrop: 0.06, contourReach: 0.62, lengthSoftening: false },
  // Add angles to soft curves: blush climbs toward the temple, contour cuts a clear diagonal.
  round: { blushLift: 0.16, blushInset: 0.11, contourDrop: 0.03, contourReach: 0.80, lengthSoftening: false },
  // Soften corners: rounded placement, contour hugging the jaw angle.
  square: { blushLift: 0.09, blushInset: 0.13, contourDrop: 0.05, contourReach: 0.70, lengthSoftening: false },
  // Shorten a long face: horizontal blush, plus shading at the hairline.
  oblong: { blushLift: 0.01, blushInset: 0.10, contourDrop: 0.07, contourReach: 0.74, lengthSoftening: true },
  // Cheekbones are already the widest point: keep colour central, contour minimal.
  diamond: { blushLift: 0.05, blushInset: 0.20, contourDrop: 0.04, contourReach: 0.52, lengthSoftening: false },
  oval: { blushLift: 0.10, blushInset: 0.13, contourDrop: 0.05, contourReach: 0.70, lengthSoftening: false },
};

const tuningFor = (shape: FaceShape | null): Tuning => (shape ? TUNING[shape] : TUNING.oval);

/* ------------------------------------------------------------------ */
/* Zone construction                                                  */
/* ------------------------------------------------------------------ */

type Side = "L" | "R";
const sideValue = (side: Side): -1 | 1 => (side === "L" ? -1 : 1);

/** Everything a per-side builder needs, resolved for one cheek/eye/brow. */
function sideParts(a: FaceAnchors, side: Side) {
  const outward = sideValue(side);
  return {
    outward,
    eyeCenter: side === "L" ? a.eyeCenterL : a.eyeCenterR,
    eyeInner: side === "L" ? a.eyeInnerL : a.eyeInnerR,
    eyeOuter: side === "L" ? a.eyeOuterL : a.eyeOuterR,
    eyeRing: side === "L" ? a.eyeL : a.eyeR,
    browRing: side === "L" ? a.browL : a.browR,
    browTop: side === "L" ? a.browTopL : a.browTopR,
    edge: side === "L" ? a.edgeL : a.edgeR,
    temple: side === "L" ? a.templeL : a.templeR,
    jaw: side === "L" ? a.jawL : a.jawR,
    alar: side === "L" ? a.noseAlarL : a.noseAlarR,
    mouthCorner: side === "L" ? a.mouthL : a.mouthR,
    /** The user's own left is the right of an unmirrored photo. */
    label: side === "L" ? "Right" : "Left",
  };
}

/** Apple of the cheek: directly below the pupil, level with the tip of the nose. */
const applePoint = (a: FaceAnchors, side: Side): Point => {
  const parts = sideParts(a, side);
  return pt(parts.eyeCenter.x, (a.noseTip.y + a.noseBottom.y) / 2);
};

/**
 * Where the edge of the face is at a given height, read off the outline itself.
 * Zones anchored this way follow the real jaw and temple instead of a bounding
 * box, so nothing spills past the face on a narrow chin or a wide forehead.
 */
function edgeAt(a: FaceAnchors, y: number, outward: -1 | 1): number {
  const onSide = a.oval.filter(point => (point.x - a.centerX) * outward > 0);
  if (onSide.length < 2) return a.centerX + outward * a.width * 0.5;
  const sorted = [...onSide].sort((first, second) => Math.abs(first.y - y) - Math.abs(second.y - y));
  const near = sorted[0];
  const other = sorted.find(point => Math.abs(point.y - near.y) > 1e-6);
  if (!other) return near.x;
  // Linear interpolation between the two outline points bracketing this height,
  // clamped so a y beyond the outline does not extrapolate off the face.
  const t = Math.max(0, Math.min(1, (y - near.y) / (other.y - near.y)));
  return near.x + (other.x - near.x) * t;
}

function cheekZone(a: FaceAnchors, side: Side, technique: Technique, tune: Tuning, blueprint:FaceBlueprint|null): PlacementZone {
  const parts = sideParts(a, side);
  const apple = applePoint(a, side);
  const id = `${technique}-cheek-${side}`;

  if (technique === "blush") {
    // From the apple, angled up toward the top of the ear. How steeply it climbs
    // and how far out it reaches are the two things face shape actually changes.
    const confirmedLift = blueprint?.cheeks.placement === "higher" ? 0.035 : blueprint?.cheeks.placement === "lower" ? -0.015 : 0;
    const endY = apple.y - a.height * (tune.blushLift + confirmedLift);
    const endX = edgeAt(a, endY, parts.outward) - parts.outward * a.width * tune.blushInset;
    const templeEnd = pt(endX, endY);
    const center = lerp(apple, templeEnd, 0.45);
    const angle = Math.atan2(templeEnd.y - apple.y, templeEnd.x - apple.x);
    const reach = Math.max(len(apple, templeEnd) * 0.62, a.width * 0.15);
    return {
      id, label: `${parts.label} cheek`, side: parts.outward,
      outline: oval(center, reach, a.height * 0.085, angle),
      arrows: [arrow(shift(apple, -parts.outward * a.width * 0.02, a.height * 0.02), templeEnd, 0.1)],
      anchor: center,
    };
  }

  if (technique === "contour") {
    // The hollow under the cheekbone: from the top of the ear, diagonally down
    // and forward, stopping short of the pupil line so it never reads as a stripe.
    const startY = parts.eyeOuter.y + a.height * 0.05;
    const start = pt(edgeAt(a, startY, parts.outward) - parts.outward * a.width * 0.015, startY);
    const endY = apple.y + a.height * tune.contourDrop;
    const endX = start.x + (parts.eyeCenter.x - start.x) * tune.contourReach;
    const inner = pt(endX, endY);
    const line = [start, lerp(start, inner, 0.5), inner];
    return {
      id, label: `${parts.label} cheek hollow`, side: parts.outward,
      outline: band(line, [a.height * 0.05, a.height * 0.038, a.height * 0.02]),
      // Contour is blended back up toward the ear, never forward onto the apple.
      arrows: [arrow(inner, start, 0.1)],
      anchor: line[1],
    };
  }

  if (technique === "highlight") {
    // The sliver of cheekbone above the contour sweep, angled toward the temple.
    const startY = apple.y - a.height * 0.1;
    const start = pt(parts.eyeCenter.x - parts.outward * a.width * 0.04, startY);
    const endY = startY - a.height * 0.085;
    const end = pt(edgeAt(a, endY, parts.outward) - parts.outward * a.width * 0.05, endY);
    const line = [start, lerp(start, end, 0.5), end];
    return {
      id, label: `${parts.label} cheekbone`, side: parts.outward,
      outline: band(line, [a.height * 0.016, a.height * 0.024, a.height * 0.014]),
      arrows: [arrow(lerp(start, end, 0.1), lerp(start, end, 0.9), 0)],
      anchor: line[1],
    };
  }

  // prep / base / finish: the broad cheek plane.
  const center = shift(apple, parts.outward * a.width * 0.06, 0);
  return {
    id, label: `${parts.label} cheek`, side: parts.outward,
    outline: oval(center, a.width * 0.19, a.height * 0.15, 0),
    arrows: [arrow(shift(center, -parts.outward * a.width * 0.1, 0), shift(center, parts.outward * a.width * 0.16, -a.height * 0.02), 0.08)],
    anchor: center,
  };
}

function underEyeZone(a: FaceAnchors, side: Side): PlacementZone {
  const parts = sideParts(a, side);
  // The classic concealer triangle: corner to corner, down to mid-cheek.
  const inner = shift(parts.eyeInner, parts.outward * a.width * 0.012, a.height * 0.035);
  const outer = shift(parts.eyeOuter, -parts.outward * a.width * 0.005, a.height * 0.042);
  const apex = pt(lerp(inner, outer, 0.45).x, (a.noseTip.y + a.noseBottom.y) / 2 + a.height * 0.02);
  return {
    id: `conceal-undereye-${side}`, label: `${parts.label} under-eye`, side: parts.outward,
    outline: smooth([inner, lerp(inner, outer, 0.5), outer, lerp(outer, apex, 0.55), apex, lerp(apex, inner, 0.55)], true),
    arrows: [arrow(apex, lerp(inner, outer, 0.5), 0.1)],
    anchor: lerp(lerp(inner, outer, 0.5), apex, 0.45),
  };
}

function lidZone(a: FaceAnchors, side: Side, technique: Technique, blueprint:FaceBlueprint|null): PlacementZone {
  const parts = sideParts(a, side);
  const browCenter = centroid(parts.browRing);
  const eyeCenter = parts.eyeCenter;

  if (technique === "eyeliner") {
    // The lash line plus the outward flick, angled along the lower lid.
    const lashInner = shift(parts.eyeInner, 0, -a.height * 0.004);
    const lashTop = shift(eyeCenter, 0, -a.height * 0.022);
    const lashOuter = shift(parts.eyeOuter, 0, -a.height * 0.006);
    const wingRise = blueprint?.eyes.direction === "softly downturned" ? 0.055 : blueprint?.eyes.direction === "softly lifted" ? 0.028 : 0.038;
    const wingTip = pt(
      parts.eyeOuter.x + parts.outward * a.width * 0.075,
      parts.eyeOuter.y - a.height * wingRise,
    );
    return {
      id: `eyeliner-${side}`, label: `${parts.label} lash line`, side: parts.outward,
      outline: band([lashInner, lashTop, lashOuter, wingTip], [a.height * 0.006, a.height * 0.009, a.height * 0.011, a.height * 0.004]),
      arrows: [arrow(lashInner, wingTip, 0.06)],
      anchor: lerp(lashOuter, wingTip, 0.4),
    };
  }

  if (technique === "highlight") {
    // Inner corner and brow bone — the two places light actually sits.
    const innerCorner = shift(parts.eyeInner, -parts.outward * a.width * 0.012, 0);
    return {
      id: `highlight-eye-${side}`, label: `${parts.label} inner corner`, side: parts.outward,
      outline: oval(innerCorner, a.width * 0.028, a.height * 0.02, 0),
      arrows: [arrow(shift(innerCorner, -parts.outward * a.width * 0.015, a.height * 0.012), shift(innerCorner, parts.outward * a.width * 0.02, -a.height * 0.012), 0.05)],
      anchor: innerCorner,
    };
  }

  // Shadow: the mobile lid, the crease above it, and the outer V — measured from
  // the eye's own lash line up toward the brow, so it fits the eye it is drawn on.
  const lashY = Math.min(...parts.eyeRing.map(point => point.y));
  const lidReach = blueprint?.eyes.openness === "narrow visible lid" ? 0.62 : blueprint?.eyes.openness === "open visible lid" ? 0.92 : 0.82;
  const ceilingY = lashY - (lashY - browCenter.y) * lidReach;
  const inner = shift(parts.eyeInner, parts.outward * a.width * 0.006, -a.height * 0.006);
  const shadowRise = blueprint?.eyes.direction === "softly downturned" ? 0.052 : blueprint?.eyes.direction === "softly lifted" ? 0.027 : 0.037;
  const outerV = pt(
    parts.eyeOuter.x + parts.outward * a.width * 0.05,
    parts.eyeOuter.y - a.height * shadowRise,
  );
  const ring = [
    inner,
    pt(lerp(inner, outerV, 0.3).x, ceilingY),
    pt(lerp(inner, outerV, 0.68).x, ceilingY - a.height * 0.008),
    outerV,
    shift(parts.eyeOuter, 0, -a.height * 0.002),
    pt(eyeCenter.x, lashY - a.height * 0.002),
  ];
  return {
    id: `eyes-lid-${side}`, label: `${parts.label} lid & crease`, side: parts.outward,
    outline: smooth(ring, true),
    // Shadow is worked from the lash line up and outward toward the outer V.
    arrows: [arrow(pt(eyeCenter.x, lashY - a.height * 0.004), outerV, 0.12)],
    anchor: pt(lerp(inner, outerV, 0.5).x, (lashY + ceilingY) / 2),
  };
}

function browZone(a: FaceAnchors, side: Side, blueprint:FaceBlueprint|null): PlacementZone {
  const parts = sideParts(a, side);
  const center = centroid(parts.browRing);
  const inner = parts.browRing.reduce((best, item) => (Math.abs(item.x - a.centerX) < Math.abs(best.x - a.centerX) ? item : best), parts.browRing[0]);
  const outer = parts.browRing.reduce((best, item) => (Math.abs(item.x - a.centerX) > Math.abs(best.x - a.centerX) ? item : best), parts.browRing[0]);
  const headLift = blueprint?.brows.arch === "straighter" ? 0.006 : blueprint?.brows.arch === "defined arch" ? 0.018 : 0.012;
  return {
    id: `brow-${side}`, label: `${parts.label} brow`, side: parts.outward,
    outline: smooth(parts.browRing, true),
    // Brow hair is drawn in short upward-and-outward strokes: one at the head
    // of the brow, one carrying through the arch toward the tail.
    arrows: [
      arrow(shift(inner, 0, a.height * 0.018), shift(inner, parts.outward * a.width * 0.03, -a.height * headLift), 0.05),
      arrow(shift(center, -parts.outward * a.width * 0.01, a.height * 0.012), shift(outer, 0, -a.height * 0.006), 0.05),
    ],
    anchor: shift(center, 0, -a.height * 0.045),
  };
}

function foreheadZone(a: FaceAnchors, technique: Technique): PlacementZone {
  const browLine = Math.min(a.browTopL.y, a.browTopR.y);
  const center = pt(a.centerX, (a.top.y + browLine) / 2);
  if (technique === "contour") {
    // Shading follows the hairline to shorten the face, sitting inside the
    // outline rather than floating above the head.
    const sideY = a.top.y + a.height * 0.2;
    const line = [
      pt(edgeAt(a, sideY, -1) + a.width * 0.03, sideY),
      pt(a.centerX, a.top.y + a.height * 0.055),
      pt(edgeAt(a, sideY, 1) - a.width * 0.03, sideY),
    ];
    return {
      id: "contour-forehead", label: "Hairline", side: 0,
      outline: band(line, [a.height * 0.026, a.height * 0.03, a.height * 0.026]),
      // Worked inward from each temple so the shading fades toward the centre.
      arrows: [
        arrow(line[0], shift(line[0], a.width * 0.1, a.height * 0.05), 0.08),
        arrow(line[2], shift(line[2], -a.width * 0.1, a.height * 0.05), -0.08),
      ],
      anchor: pt(a.centerX, a.top.y + a.height * 0.1),
    };
  }
  return {
    id: `${technique}-forehead`, label: "Forehead", side: 0,
    outline: oval(center, a.width * 0.34, (browLine - a.top.y) * 0.44, 0),
    arrows: [
      arrow(center, pt(center.x - a.width * 0.28, center.y - a.height * 0.02), 0.08),
      arrow(center, pt(center.x + a.width * 0.28, center.y - a.height * 0.02), -0.08),
    ],
    anchor: center,
  };
}

function noseZone(a: FaceAnchors, technique: Technique, blueprint:FaceBlueprint|null): PlacementZone {
  const bridge = [a.noseTop, lerp(a.noseTop, a.noseTip, 0.5), a.noseTip];
  if (technique === "contour") {
    const bridgeInset = blueprint?.nose.width === "wide" ? 0.038 : blueprint?.nose.width === "narrow" ? 0.052 : 0.045;
    const sideLine = (outward: -1 | 1) => [
      pt(a.noseTop.x + outward * a.width * bridgeInset, a.noseTop.y),
      pt(a.noseTip.x + outward * a.width * (bridgeInset + 0.005), lerp(a.noseTop, a.noseTip, 0.6).y),
      pt((outward === -1 ? a.noseAlarL : a.noseAlarR).x, a.noseTip.y + a.height * 0.008),
    ];
    const left = sideLine(-1);
    const right = sideLine(1);
    return {
      id: "contour-nose", label: "Nose sides", side: 0,
      outline: `${band(left, [a.height * 0.009, a.height * 0.011, a.height * 0.009])} ${band(right, [a.height * 0.009, a.height * 0.011, a.height * 0.009])}`,
      // Shading is drawn downward along each side, stopping above the nostril.
      arrows: [arrow(left[0], lerp(left[1], left[2], 0.5), 0.04), arrow(right[0], lerp(right[1], right[2], 0.5), -0.04)],
      anchor: shift(a.noseTip, 0, -a.height * 0.02),
    };
  }
  if (technique === "highlight") {
    return {
      id: "highlight-nose", label: "Bridge", side: 0,
      outline: band(bridge, [a.height * 0.008, a.height * 0.009, a.height * 0.007]),
      arrows: [arrow(a.noseTop, shift(a.noseTip, 0, -a.height * 0.01), 0.03)],
      anchor: lerp(a.noseTop, a.noseTip, 0.45),
    };
  }
  return {
    id: `${technique}-nose`, label: "Nose", side: 0,
    outline: band([a.noseTop, lerp(a.noseTop, a.noseTip, 0.6), shift(a.noseBottom, 0, a.height * 0.004)], [a.height * 0.016, a.height * 0.028, a.height * 0.036]),
    arrows: [arrow(a.noseTop, a.noseBottom, 0.03)],
    anchor: lerp(a.noseTop, a.noseTip, 0.5),
  };
}

function lipZone(a: FaceAnchors): PlacementZone {
  const center = centroid(a.lips);
  return {
    id: "lips", label: "Lips", side: 0,
    outline: smooth(a.lips, true),
    // Colour is taken from each corner in toward the centre so the edge stays clean.
    arrows: [
      arrow(shift(a.mouthL, a.width * 0.012, 0), shift(center, -a.width * 0.02, 0), 0.06),
      arrow(shift(a.mouthR, -a.width * 0.012, 0), shift(center, a.width * 0.02, 0), -0.06),
    ],
    anchor: shift(center, 0, a.height * 0.045),
  };
}

function jawZone(a: FaceAnchors, side: Side): PlacementZone {
  const parts = sideParts(a, side);
  const inset = parts.outward * a.width * 0.025;
  // Starts just below the ear, not up at the cheekbone, so jaw shading does not
  // collide with the contour sweep when a step marks both.
  const earY = parts.jaw.y - a.height * 0.08;
  // Follows the jawbone from below the ear to just short of the chin, held
  // inside the outline so the shading never draws a line off the face.
  const line = [
    pt(edgeAt(a, earY, parts.outward) - inset, earY),
    pt(parts.jaw.x - inset, parts.jaw.y),
    lerp(pt(parts.jaw.x - inset, parts.jaw.y), shift(a.chin, 0, -a.height * 0.01), 0.6),
  ];
  return {
    id: `jaw-${side}`, label: `${parts.label} jaw`, side: parts.outward,
    outline: band(line, [a.height * 0.022, a.height * 0.02, a.height * 0.012]),
    arrows: [arrow(line[2], line[0], 0.08)],
    anchor: line[1],
  };
}

function fullFaceZone(a: FaceAnchors, technique: Technique): PlacementZone {
  const center = pt(a.centerX, (a.top.y + a.chin.y) / 2);
  return {
    id: `${technique}-face`, label: technique === "prep" ? "Whole face" : "Complexion", side: 0,
    outline: smooth(a.oval, true),
    // Base products are pressed at the centre and moved outward to the hairline.
    arrows: [
      arrow(center, pt(a.edgeL.x + a.width * 0.06, center.y - a.height * 0.06), 0.06),
      arrow(center, pt(a.edgeR.x - a.width * 0.06, center.y - a.height * 0.06), -0.06),
      arrow(center, pt(a.centerX, a.top.y + a.height * 0.1), 0.04),
      arrow(center, pt(a.centerX, a.chin.y - a.height * 0.08), -0.04),
    ],
    anchor: center,
  };
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                 */
/* ------------------------------------------------------------------ */

const CHEEK_AREAS: LessonRegion[] = ["both-cheeks", "left-cheek", "right-cheek"];
const EYE_AREAS: LessonRegion[] = ["both-eyes", "left-eye", "right-eye"];

/** "left-*" means the user's own left, which is the right of an unmirrored photo. */
const sidesFor = (area: LessonRegion): Side[] => {
  if (area === "left-cheek" || area === "left-eye") return ["R"];
  if (area === "right-cheek" || area === "right-eye") return ["L"];
  return ["L", "R"];
};

/**
 * The face chart for one lesson step: every area the step touches, drawn in the
 * shape that technique actually calls for, adapted to the estimated face shape.
 */
export function buildPlacement(
  points: Point[],
  areas: LessonRegion[],
  technique: Technique,
  shape: FaceShape | null,
  aspect = 0.75,
  includeShapeComplements = true,
  blueprint: FaceBlueprint | null = null,
): PlacementZone[] {
  const safeAspect = Number.isFinite(aspect) && aspect > 0.2 && aspect < 5 ? aspect : 0.75;
  const a = faceAnchors(points, safeAspect);
  const tune = tuningFor(shape);
  // A step covering the whole complexion is drawn once, not once per sub-area.
  const wholeFace = areas.some(area => area === "all-face" || area === "complexion");
  const list = wholeFace && technique !== "conceal" ? (["all-face"] as LessonRegion[]) : areas;
  const zones: PlacementZone[] = [];

  for (const area of new Set(list)) {
    if (area === "none") continue;
    if (area === "all-face" || area === "complexion") {
      if (technique === "conceal") sidesFor("both-cheeks").forEach(side => zones.push(underEyeZone(a, side)));
      else zones.push(fullFaceZone(a, technique));
      continue;
    }
    if (area === "forehead") { zones.push(foreheadZone(a, technique)); continue; }
    if (CHEEK_AREAS.includes(area)) {
      sidesFor(area).forEach(side => zones.push(technique === "conceal" ? underEyeZone(a, side) : cheekZone(a, side, technique, tune, blueprint)));
      continue;
    }
    if (EYE_AREAS.includes(area)) {
      sidesFor(area).forEach(side => zones.push(technique === "conceal" ? underEyeZone(a, side) : lidZone(a, side, technique, blueprint)));
      continue;
    }
    if (area === "brows") { sidesFor("both-eyes").forEach(side => zones.push(browZone(a, side, blueprint))); continue; }
    if (area === "nose") { zones.push(noseZone(a, technique, blueprint)); continue; }
    if (area === "lips") { zones.push(lipZone(a)); continue; }
    if (area === "jaw") { sidesFor("both-cheeks").forEach(side => zones.push(jawZone(a, side))); continue; }
  }

  // Longer faces get hairline and chin shading so contour shortens rather than
  // lengthens — the one place face shape changes which zones appear at all.
  if (includeShapeComplements && technique === "contour" && tune.lengthSoftening && !zones.some(zone => zone.id === "contour-forehead")) {
    zones.push(foreheadZone(a, "contour"));
  }

  // De-duplicate: a step listing both "complexion" and "both-cheeks" for the
  // same technique must not stack two identical outlines on top of each other.
  const seen = new Set<string>();
  return zones.filter(zone => (seen.has(zone.id) ? false : (seen.add(zone.id), true)));
}
