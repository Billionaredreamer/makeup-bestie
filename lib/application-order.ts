export type ApplicationStep = {
  title: string;
  instruction: string;
  product: string;
  region: string;
  areas: string[];
  technique: string;
  referenceCue: string;
  adaptation: string;
  checkpoint: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  uncertain: boolean;
  addedByBestie?: boolean;
};

type ApplicationLesson = { steps: ApplicationStep[]; products?: string[] };

const complexionTechniques = new Set(["base","conceal","contour","blush","highlight"]);
const openingArtistryTechniques = new Set(["brow","eyes","eyeliner"]);

const isFacePrep = (step:ApplicationStep) => {
  const areas=Array.isArray(step.areas)?step.areas:[step.region];
  const faceArea=areas.some(area=>["all-face","complexion","forehead","both-cheeks","nose","jaw"].includes(String(area)));
  return (String(step.technique)==="prep"||/\b(?:face\s+)?primer|skin prep/i.test(String(step.product)))&&faceArea;
};

export function organizeApplicationQueue<T extends ApplicationLesson>(lesson:T,availableProducts:string[]) {
  const steps=Array.isArray(lesson.steps)?lesson.steps.filter(step=>step&&typeof step==="object"):[];
  if(!steps.length||!steps.some(step=>complexionTechniques.has(String(step.technique))))return lesson;
  const existingPrepIndex=steps.findIndex(isFacePrep);
  const ownsPrimer=availableProducts.some(product=>/\bprimer\b/i.test(product));
  const firstComplexion=steps.find(step=>complexionTechniques.has(String(step.technique)));
  const firstComplexionStart=Math.max(0,Number(firstComplexion?.startTimeSeconds||0));
  const prep:ApplicationStep=existingPrepIndex>=0?steps[existingPrepIndex]:{
    title:"Prepare your skin",
    instruction:ownsPrimer?"Apply a thin layer of your primer and let it settle before complexion products.":"Use your usual skin preparation and let it settle before complexion products.",
    product:ownsPrimer?"Primer":"Your usual skin prep",
    region:"all-face",
    areas:["all-face"],
    technique:"prep",
    referenceCue:"This preparation dependency was added by Makeup Bestie because it was not visible in the sampled tutorial.",
    adaptation:"Keep the layer light and adjust it to how your skin feels today.",
    checkpoint:"Skin feels comfortable and the preparation layer is no longer wet or slippery.",
    startTimeSeconds:Math.max(0,firstComplexionStart-3),
    endTimeSeconds:Math.max(2,firstComplexionStart),
    uncertain:true,
    addedByBestie:true,
  };
  const remaining=existingPrepIndex>=0?steps.filter((_,index)=>index!==existingPrepIndex):steps;
  const insertAt=remaining.length&&openingArtistryTechniques.has(String(remaining[0].technique))?1:0;
  lesson.steps=[...remaining.slice(0,insertAt),prep,...remaining.slice(insertAt)];
  if(!Array.isArray(lesson.products))lesson.products=[];
  if(!lesson.products.some(product=>String(product).toLowerCase()===String(prep.product).toLowerCase()))lesson.products.unshift(prep.product);
  return lesson;
}
