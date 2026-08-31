/**
 * A synthetic but anatomically proportioned 468-point face mesh.
 *
 * Every landmark index that lib/placement-map.ts reads is placed where it sits
 * on a real front-facing portrait, so the geometry can be tested — and rendered
 * for visual review — without shipping a real person's face into the repo.
 *
 * Proportions follow a 3:4 portrait: the face spans half the frame height, and
 * its height-to-width ratio is ~1.4, which is what MediaPipe actually reports
 * for a head-and-shoulders selfie. Every anchor is derived from the same
 * outline curve, so the mesh is internally consistent.
 */

const EYE_L = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_R = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const BROW_L = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_R = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
/** Index 0 is the top of the forehead; index 18 is the chin. */
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

const CX = 0.5;
const TOP = 0.22;
const CHIN = 0.72;
const HEIGHT = CHIN - TOP;
/** Half the cheekbone width, in normalized image x. */
const HALF = 0.235;

/**
 * Half-width of the face at height fraction t (0 = hairline, 1 = chin):
 * a rounded cranium, widest at the cheekbones, tapering to a narrow chin.
 */
function halfWidthAt(t) {
  // A low exponent widens the curve fast, giving a rounded cranium rather than
  // a pointed one; the tail exponent narrows late, giving a defined chin.
  if (t <= 0.44) return HALF * Math.sin((Math.PI / 2) * (t / 0.44)) ** 0.3;
  const past = (t - 0.44) / 0.56;
  return HALF * (1 - 0.82 * past ** 1.9);
}

const outlinePoint = (t, direction) => ({ x: CX + direction * halfWidthAt(t), y: TOP + t * HEIGHT });

/** The 36-point oval: down the image-right side, then back up the image-left. */
function outlineRing() {
  const points = [];
  for (let index = 0; index < 19; index += 1) points.push(outlinePoint(index / 18, 1));
  for (let index = 19; index < 36; index += 1) points.push(outlinePoint(1 - (index - 18) / 18, -1));
  return points;
}

export function makeFaceLandmarks() {
  const points = Array.from({ length: 468 }, () => ({ x: CX, y: 0.5 }));
  const set = (index, x, y) => { points[index] = { x, y }; };
  const setRing = (indices, list) => indices.forEach((index, position) => { points[index] = list[position % list.length]; });

  const ring = outlineRing();
  setRing(FACE_OVAL, ring);
  // Anchors read straight off the outline, so edges and jaw always sit on it.
  set(10, CX, TOP);
  set(152, CX, CHIN);

  // Eyes: five eye-widths across the face, on the horizontal midline.
  const eyeY = TOP + 0.45 * HEIGHT;
  const eyeHalfW = HALF / 2.5 / 2;
  const eyeOffset = eyeHalfW * 2;
  const eyeHalfH = 0.013;
  const eyeRing = (cx, count) => Array.from({ length: count }, (_, index) => {
    const theta = (index / count) * Math.PI * 2;
    return { x: cx + Math.cos(theta) * eyeHalfW, y: eyeY + Math.sin(theta) * eyeHalfH };
  });
  setRing(EYE_L, eyeRing(CX - eyeOffset, EYE_L.length));
  setRing(EYE_R, eyeRing(CX + eyeOffset, EYE_R.length));
  set(33, CX - eyeOffset - eyeHalfW, eyeY + 0.002);
  set(133, CX - eyeOffset + eyeHalfW, eyeY - 0.001);
  set(362, CX + eyeOffset - eyeHalfW, eyeY - 0.001);
  set(263, CX + eyeOffset + eyeHalfW, eyeY + 0.002);
  set(159, CX - eyeOffset, eyeY - eyeHalfH);
  set(145, CX - eyeOffset, eyeY + eyeHalfH);
  set(386, CX + eyeOffset, eyeY - eyeHalfH);
  set(374, CX + eyeOffset, eyeY + eyeHalfH);

  // Brows: an arch above each eye, peaking two thirds of the way out.
  const browY = eyeY - 0.037;
  const brow = direction => {
    const cx = CX + direction * eyeOffset;
    const inner = cx - direction * eyeHalfW * 1.15;
    const outer = cx + direction * eyeHalfW * 1.2;
    const peak = cx + direction * eyeHalfW * 0.35;
    return [
      { x: inner, y: browY + 0.004 }, { x: (inner + peak) / 2, y: browY - 0.007 },
      { x: peak, y: browY - 0.010 }, { x: (peak + outer) / 2, y: browY - 0.005 },
      { x: outer, y: browY + 0.006 },
      { x: outer - direction * 0.004, y: browY + 0.014 }, { x: peak, y: browY + 0.002 },
      { x: (inner + peak) / 2, y: browY + 0.003 }, { x: inner + direction * 0.004, y: browY + 0.012 },
      { x: inner, y: browY + 0.010 },
    ];
  };
  setRing(BROW_L, brow(-1));
  setRing(BROW_R, brow(1));
  set(105, CX - eyeOffset - eyeHalfW * 0.35, browY - 0.010);
  set(334, CX + eyeOffset + eyeHalfW * 0.35, browY - 0.010);

  // Nose: bridge from between the brows to a tip at 72% of face height.
  const noseTipY = TOP + 0.72 * HEIGHT;
  set(168, CX, eyeY - 0.006);
  set(4, CX, noseTipY);
  set(2, CX, noseTipY + 0.014);
  set(98, CX - eyeHalfW * 0.82, noseTipY + 0.008);
  set(327, CX + eyeHalfW * 0.82, noseTipY + 0.008);

  // Mouth: a third of the way from the nose base to the chin.
  const mouthY = points[2].y + (CHIN - points[2].y) * 0.34;
  const mouthHalf = HALF * 0.27;
  setRing(LIPS, Array.from({ length: LIPS.length }, (_, index) => {
    const theta = (index / LIPS.length) * Math.PI * 2 + Math.PI;
    return { x: CX + Math.cos(theta) * mouthHalf, y: mouthY + Math.sin(theta) * 0.017 };
  }));
  set(61, CX - mouthHalf, mouthY);
  set(291, CX + mouthHalf, mouthY);
  set(0, CX, mouthY - 0.016);
  set(17, CX, mouthY + 0.021);

  return points;
}

export const FIXTURE_ASPECT = 0.75;
