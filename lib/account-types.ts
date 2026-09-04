import type { FaceBlueprint } from "./face-blueprint";

export type SubscriptionPlan = "plus" | "unlimited";

export type BeautyProfileRecord = {
  display_name: string;
  skin_type: string;
  skin_tone: string;
  experience: string;
  makeup_goal: string;
  products: string[];
  face_shape: string | null;
  face_blueprint: FaceBlueprint | null;
};

export type SubscriptionRecord = {
  plan: SubscriptionPlan | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  source?: "stripe" | "apple";
};

export type AccountSnapshot = {
  user: { id: string; email: string };
  profile: BeautyProfileRecord | null;
  subscription: SubscriptionRecord | null;
  usage: { tutorialAnalyses: number; previewGenerations: number };
};

export type SavedLookRecord = {
  id: string;
  title: string;
  tutorial_source: string | null;
  brief: Record<string, unknown>;
  preview_url: string | null;
  created_at: string;
};
