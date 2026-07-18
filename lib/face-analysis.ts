export type Point = { x: number; y: number; z?: number };
export type FaceShape = "heart" | "oval" | "round" | "square" | "oblong" | "diamond";

export type FaceProfile = {
  shape: FaceShape;
  confidence: number;
  ratios: { lengthToWidth: number; foreheadToJaw: number; cheekToJaw: number; eyeSpacing: number; lipToNose: number };
};

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const width = (p: Point[], a: number, b: number) => dist(p[a], p[b]);

export function estimateFaceProfile(p: Point[]): FaceProfile | null {
  if (p.length < 468) return null;
  const faceLength = width(p, 10, 152);
  const cheek = width(p, 234, 454);
  const forehead = width(p, 127, 356);
  const jaw = width(p, 172, 397);
  const chinWidth = width(p, 148, 377);
  const eyeWidth = (width(p, 33, 133) + width(p, 362, 263)) / 2;
  const eyeGap = width(p, 133, 362);
  const nose = width(p, 49, 279);
  const lips = width(p, 61, 291);
  const lengthToWidth = faceLength / cheek;
  const foreheadToJaw = forehead / jaw;
  const cheekToJaw = cheek / jaw;
  const jawAngular = jaw / chinWidth;
  let shape: FaceShape;
  if (lengthToWidth > 1.48) shape = "oblong";
  else if (foreheadToJaw > 1.13 && jawAngular > 1.2) shape = "heart";
  else if (cheekToJaw > 1.18 && foreheadToJaw < 1.12) shape = "diamond";
  else if (lengthToWidth < 1.28 && jawAngular < 1.18) shape = "round";
  else if (lengthToWidth < 1.38 && jawAngular >= 1.18) shape = "square";
  else shape = "oval";
  const margin = Math.min(.92, Math.max(.55, Math.abs(lengthToWidth - 1.35) + Math.abs(foreheadToJaw - 1) + .5));
  return { shape, confidence: margin, ratios: { lengthToWidth, foreheadToJaw, cheekToJaw, eyeSpacing: eyeGap / eyeWidth, lipToNose: lips / nose } };
}

export const placementFor = (shape: FaceShape) => ({
  heart: { blush: "Blend from the outer cheek inward, staying just below the cheekbone.", contour: "Soften the temple and the lower point of the chin; keep jaw contour sheer.", highlight: "Keep highlight centered on the cheek and forehead.", eyeliner: "Balance the forehead with a softly lifted, outward wing.", brow: "Choose a gentle, low arch rather than a sharp peak." },
  round: { blush: "Place blush slightly above the apples and sweep toward the temples.", contour: "Use a light diagonal shadow beneath the cheekbones and along the outer jaw.", highlight: "Use a narrow highlight through the center of the face.", eyeliner: "Extend the outer corner to create soft horizontal length.", brow: "A defined, softly angled arch adds structure." },
  square: { blush: "Use rounded blending on the apples, then diffuse upward.", contour: "Soften the forehead corners and jaw angles without drawing hard lines.", highlight: "Round the cheek highlight and keep the chin subtle.", eyeliner: "Try a softly smoked, slightly upward wing.", brow: "A curved brow balances angular proportions." },
  oblong: { blush: "Blend blush horizontally across the cheeks rather than steeply upward.", contour: "Shade lightly at the hairline and chin; avoid lengthening vertical lines.", highlight: "Keep highlight broad on the cheekbones and minimal down the nose.", eyeliner: "A straighter outward wing adds width.", brow: "A softly straight brow helps balance face length." },
  diamond: { blush: "Keep blush centered on the cheeks and blend softly toward the ears.", contour: "Use very little cheek contour; soften only the widest outer cheek point.", highlight: "Highlight the forehead center and jaw to balance cheek width.", eyeliner: "Balance with a soft wing and bright inner corner.", brow: "A curved brow softens prominent cheekbones." },
  oval: { blush: "Follow your cheekbone upward with a softly diffused edge.", contour: "Use minimal contour beneath the cheekbone and at the temple.", highlight: "Follow the upper cheekbone and keep the center subtle.", eyeliner: "Follow your natural eye angle and lift slightly at the edge.", brow: "Keep your natural brow structure with a soft arch." },
}[shape]);
