export const prepLines = [
  "A good routine starts on skin that's ready.",
  "Clean skin first. Everything sits better on it.",
  "Give the moisturiser a minute to sink in.",
  "Prep is the step people skip, then blame the foundation for.",
  "Good light beats good product. Find a window.",
  "No rush. The good ones take their time.",
  "You don't have to get it right the first time.",
  "Practice is the whole point. That's what this is for.",
  "Whatever you managed today is enough to start.",
  "Take the ten minutes. They're yours.",
  "Hair back. You'll thank yourself at the blending stage.",
  "We're not doing this over yesterday's mascara.",
  "Wash your brushes. I'm not going to keep asking.",
  "Both hands for this one. Phone down after you tap.",
  "Soft light, clean face, no audience.",
] as const;

export function prepLineForDate(date: Date): string {
  // Calendar arithmetic in UTC avoids daylight-saving changes in local day lengths.
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86_400_000);
  return prepLines[dayOfYear % prepLines.length];
}
