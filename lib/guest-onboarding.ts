export const GUEST_PROFILE_KEY = "makeup-bestie-guest-profile-v1";

export type GuestProfileDraft = {
  name?: string;
  skin?: string;
  tone?: string;
  level?: string;
  goal?: string;
  products?: string[];
  startingProfileSeen?: boolean;
};

export const guestQuestions = [
  { key:"skin", label:"First, your canvas", title:"How does your skin usually feel?", options:["Dry or tight","Oily or shiny","A little of both","Balanced","Sensitive"] },
  { key:"tone", label:"Your complexion", title:"Which range feels closest to you?", options:["Fair","Light","Medium","Tan","Deep","Rich"] },
  { key:"level", label:"Your experience", title:"Where are you in your makeup journey?", options:["Just starting","I know the basics","Confident","Basically an artist"] },
  { key:"goal", label:"Your moment", title:"What do you want to learn first?", options:["Everyday natural","Soft glam","Full glam","Editorial color","Copy a saved look"] },
] as const;

export const guestProductOptions = ["Primer","Foundation","Concealer","Powder","Bronzer","Contour","Blush","Highlighter","Brow product","Eyeshadow","Eyeliner","Mascara","Lip liner","Lip color","Setting spray"];

export function readGuestProfileDraft(): GuestProfileDraft {
  if(typeof window==="undefined")return {};
  try{return JSON.parse(window.localStorage.getItem(GUEST_PROFILE_KEY)||"{}") as GuestProfileDraft;}
  catch{return {};}
}

export function writeGuestProfileDraft(update:Partial<GuestProfileDraft>):GuestProfileDraft {
  const next={...readGuestProfileDraft(),...update};
  if(typeof window!=="undefined")window.localStorage.setItem(GUEST_PROFILE_KEY,JSON.stringify(next));
  return next;
}

export function clearGuestProfileDraft(){
  if(typeof window!=="undefined")window.localStorage.removeItem(GUEST_PROFILE_KEY);
}

export function guestProfileIsComplete(draft:GuestProfileDraft){
  return Boolean(draft.skin&&draft.tone&&draft.level&&draft.goal);
}

export function startingProfileLines(draft:GuestProfileDraft):string[] {
  const finish = draft.skin==="Dry or tight"
    ? "Your base steps will focus on comfortable, buildable layers with a softer finish."
    : draft.skin==="Oily or shiny"
      ? "Your base steps will stay light and controlled, with finish adjustments where you want them."
      : draft.skin==="A little of both"
        ? "Your base steps will stay light and buildable for combination skin preferences."
        : draft.skin==="Sensitive"
          ? "Your lessons will keep base steps simple and let you use products you already trust."
          : draft.skin==="Balanced"
            ? "Your base steps will stay flexible, with the finish adapted to each tutorial."
            : "Your base steps will stay flexible until you choose a skin preference.";
  const pacing = draft.level==="Just starting"
    ? "Each application will be broken down further while you’re getting started."
    : draft.level==="I know the basics"
      ? "Instructions will keep the useful detail without slowing down the steps you know."
      : draft.level==="Confident"||draft.level==="Basically an artist"
        ? "Instructions will stay concise and focus on adapting placement to your features."
        : "You can adjust the amount of guidance as you learn.";
  return [finish,pacing];
}
