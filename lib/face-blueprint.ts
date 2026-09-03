import type { FaceProfile, Point } from "./face-analysis";

export const eyeOpennessOptions = ["narrow visible lid", "balanced visible lid", "open visible lid"] as const;
export const eyeDirectionOptions = ["softly lifted", "level", "softly downturned"] as const;
export const eyeSpacingOptions = ["close-set", "balanced", "wide-set"] as const;
export const browArchOptions = ["straighter", "soft arch", "defined arch"] as const;
export const noseWidthOptions = ["narrow", "balanced", "wide"] as const;
export const noseLengthOptions = ["short", "balanced", "long"] as const;
export const lipBalanceOptions = ["fuller upper lip", "balanced", "fuller lower lip"] as const;
export const cheekPlacementOptions = ["not sure", "higher", "centered", "lower"] as const;
export const skinConcernOptions = ["Dry patches", "Oiliness", "Visible texture", "Blemishes", "Uneven tone", "Under-eye darkness"] as const;

export type SkinConcern = typeof skinConcernOptions[number];
export type FaceBlueprint = {
  version: 1;
  eyes: {
    openness: typeof eyeOpennessOptions[number];
    direction: typeof eyeDirectionOptions[number];
    spacing: typeof eyeSpacingOptions[number];
  };
  brows: { arch: typeof browArchOptions[number] };
  nose: { width: typeof noseWidthOptions[number]; length: typeof noseLengthOptions[number] };
  lips: { balance: typeof lipBalanceOptions[number] };
  cheeks: { placement: typeof cheekPlacementOptions[number] };
  skinConcerns: SkinConcern[];
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const choose = <T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] =>
  typeof value === "string" && options.includes(value) ? value as T[number] : fallback;

/**
 * Converts on-device landmark geometry into conservative, editable categories.
 * It deliberately does not infer skin condition, brow density, or medical traits.
 */
export function estimateFaceBlueprint(points: Point[], profile: FaceProfile): FaceBlueprint {
  const faceWidth = Math.max(distance(points[234], points[454]), 0.001);
  const faceLength = Math.max(distance(points[10], points[152]), 0.001);
  const eyeWidthL = distance(points[33], points[133]);
  const eyeWidthR = distance(points[362], points[263]);
  const eyeWidth = Math.max((eyeWidthL + eyeWidthR) / 2, 0.001);
  const eyeOpening = (distance(points[159], points[145]) + distance(points[386], points[374])) / 2 / eyeWidth;
  const eyeLift = (((points[33].y - points[133].y) / Math.max(eyeWidthL, 0.001)) + ((points[263].y - points[362].y) / Math.max(eyeWidthR, 0.001))) / 2;
  const browWidth = (distance(points[70], points[107]) + distance(points[300], points[336])) / 2;
  const browHeight = (Math.abs(points[105].y - (points[70].y + points[107].y) / 2) + Math.abs(points[334].y - (points[300].y + points[336].y) / 2)) / 2;
  const browArch = browHeight / Math.max(browWidth, 0.001);
  const noseWidth = distance(points[98], points[327]) / faceWidth;
  const noseLength = distance(points[168], points[2]) / faceLength;
  const mouthCenterY = (points[61].y + points[291].y) / 2;
  const upperLip = Math.max(0.001, mouthCenterY - points[0].y);
  const lowerLip = Math.max(0.001, points[17].y - mouthCenterY);
  const lipRatio = upperLip / lowerLip;

  return {
    version: 1,
    eyes: {
      openness: eyeOpening < 0.2 ? "narrow visible lid" : eyeOpening > 0.34 ? "open visible lid" : "balanced visible lid",
      direction: eyeLift < -0.035 ? "softly lifted" : eyeLift > 0.035 ? "softly downturned" : "level",
      spacing: profile.ratios.eyeSpacing < 0.9 ? "close-set" : profile.ratios.eyeSpacing > 1.15 ? "wide-set" : "balanced",
    },
    brows: { arch: browArch < 0.11 ? "straighter" : browArch > 0.22 ? "defined arch" : "soft arch" },
    nose: {
      width: noseWidth < 0.17 ? "narrow" : noseWidth > 0.23 ? "wide" : "balanced",
      length: noseLength < 0.25 ? "short" : noseLength > 0.34 ? "long" : "balanced",
    },
    lips: { balance: lipRatio > 1.18 ? "fuller upper lip" : lipRatio < 0.82 ? "fuller lower lip" : "balanced" },
    // A front-facing landmark mesh cannot reliably see cheekbone prominence.
    // The user confirms this one; placements still anchor to their real cheeks.
    cheeks: { placement: "not sure" },
    skinConcerns: [],
  };
}

export function normalizeFaceBlueprint(value: unknown): FaceBlueprint | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const eyes = source.eyes && typeof source.eyes === "object" ? source.eyes as Record<string, unknown> : {};
  const brows = source.brows && typeof source.brows === "object" ? source.brows as Record<string, unknown> : {};
  const nose = source.nose && typeof source.nose === "object" ? source.nose as Record<string, unknown> : {};
  const lips = source.lips && typeof source.lips === "object" ? source.lips as Record<string, unknown> : {};
  const cheeks = source.cheeks && typeof source.cheeks === "object" ? source.cheeks as Record<string, unknown> : {};
  const concerns = Array.isArray(source.skinConcerns)
    ? [...new Set(source.skinConcerns.filter((item): item is SkinConcern => typeof item === "string" && skinConcernOptions.includes(item as SkinConcern)))].slice(0, skinConcernOptions.length)
    : [];
  return {
    version: 1,
    eyes: {
      openness: choose(eyes.openness, eyeOpennessOptions, "balanced visible lid"),
      direction: choose(eyes.direction, eyeDirectionOptions, "level"),
      spacing: choose(eyes.spacing, eyeSpacingOptions, "balanced"),
    },
    brows: { arch: choose(brows.arch, browArchOptions, "soft arch") },
    nose: {
      width: choose(nose.width, noseWidthOptions, "balanced"),
      length: choose(nose.length, noseLengthOptions, "balanced"),
    },
    lips: { balance: choose(lips.balance, lipBalanceOptions, "balanced") },
    cheeks: { placement: choose(cheeks.placement, cheekPlacementOptions, "not sure") },
    skinConcerns: concerns,
  };
}

export function faceBlueprintSummary(blueprint: FaceBlueprint | null): string {
  if (!blueprint) return "Feature Blueprint not confirmed";
  return `${blueprint.eyes.openness}, ${blueprint.eyes.direction} eyes; ${blueprint.eyes.spacing} spacing; ${blueprint.brows.arch} brows; ${blueprint.nose.width}, ${blueprint.nose.length} nose; ${blueprint.lips.balance}; ${blueprint.cheeks.placement} cheek placement${blueprint.skinConcerns.length ? `; today: ${blueprint.skinConcerns.join(", ").toLowerCase()}` : ""}`;
}

export function blueprintTechniqueNote(blueprint: FaceBlueprint | null, technique: string): string {
  if (!blueprint) return "";
  const concerns = new Set(blueprint.skinConcerns);
  if (technique === "eyes" || technique === "eyeliner") {
    const lid = blueprint.eyes.openness === "narrow visible lid" ? "Keep the working color slightly above the visible fold and liner thin." : blueprint.eyes.openness === "open visible lid" ? "Use the visible lid space in light, controlled layers." : "Follow the visible crease in light layers.";
    const direction = blueprint.eyes.direction === "softly downturned" ? "Direct the outer edge softly upward." : blueprint.eyes.direction === "softly lifted" ? "Follow the natural lift without extending it too steeply." : "Extend the outer edge mostly outward with a slight lift.";
    return `${lid} ${direction}`;
  }
  if (technique === "brow") return blueprint.brows.arch === "straighter" ? "Keep strokes mostly horizontal and preserve the natural, straighter line." : blueprint.brows.arch === "defined arch" ? "Use light strokes through the arch so it stays defined without becoming blocky." : "Follow the soft arch with short hair-like strokes.";
  if (technique === "contour") {
    const nose = blueprint.nose.width === "wide" ? "Keep nose contour close to the real bridge and blend inward softly." : blueprint.nose.width === "narrow" ? "Use minimal nose contour so the bridge does not look pinched." : "Follow the real bridge edges with a sheer nose contour.";
    const cheeks = blueprint.cheeks.placement === "higher" ? "Keep cheek sculpting high and blend upward." : blueprint.cheeks.placement === "lower" ? "Start beneath the mapped cheek and lift the blend rather than dragging it down." : "Follow the mapped cheek hollow and blend upward.";
    return `${nose} ${cheeks}`;
  }
  if (technique === "blush") return blueprint.cheeks.placement === "higher" ? "Place color high on the mapped cheek and diffuse toward the temple." : blueprint.cheeks.placement === "lower" ? "Begin near the apple and blend upward to create lift." : "Begin on the mapped apple and follow the on-screen arrow.";
  if (technique === "lips") return blueprint.lips.balance === "fuller upper lip" ? "Trace the natural border and keep extra definition focused through the lower lip." : blueprint.lips.balance === "fuller lower lip" ? "Trace the natural border and balance definition through the cupid’s bow." : "Trace the natural border evenly before blending inward.";
  if (["prep", "base", "conceal", "finish", "highlight"].includes(technique)) {
    const notes = [];
    if (concerns.has("Dry patches")) notes.push("Press on thin layers and avoid building powder over dry areas.");
    if (concerns.has("Oiliness")) notes.push("Keep layers light and set only the areas that become oily.");
    if (concerns.has("Visible texture")) notes.push("Use thin layers and press rather than sweep across visible texture.");
    if (concerns.has("Blemishes")) notes.push("Spot-conceal only where wanted instead of adding coverage everywhere.");
    if (concerns.has("Uneven tone")) notes.push("Build coverage gradually only where tone looks uneven.");
    if (concerns.has("Under-eye darkness")) notes.push("Use a small amount under the eyes and stop before product gathers at the lash line.");
    return notes.join(" ");
  }
  return "";
}
