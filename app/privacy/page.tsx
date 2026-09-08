import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";


export default function PrivacyPage() {
  return <main className="legal-page">
    <Link className="legal-home" href="/">← Makeup Bestie</Link>
    <p className="eyebrow">Privacy Policy</p>
    <h1>Your face stays yours.</h1>
    <p className="legal-updated">Effective September 1, 2026</p>
    <section><h2>What we collect</h2><p>We collect your account email, display name, beauty-profile answers, product list, user-confirmed Face Blueprint categories, subscription status, AI usage counts, and looks you deliberately choose to save. Payment details are handled by the store you bought through: Stripe for website purchases, and Apple for purchases made in the iOS app. Makeup Bestie never receives or stores your full card number. For iOS purchases we use RevenueCat to confirm whether a subscription is active; it receives a Makeup Bestie account identifier and the purchase status reported by Apple, not your payment details.</p></section>
    <section><h2>Photos and camera</h2><p>Facial landmarks and Glam Room tracking run on your device. Camera footage is not recorded or uploaded. Bare-face scan photos and raw landmark coordinates are not saved by default. If you confirm a Face Blueprint, only its editable feature categories and optional skin concerns sync to your account. When you explicitly request an AI preview, the selected photo, tutorial reference, and confirmed beauty-profile context may be sent to OpenAI for that request. A generated preview is stored only when you choose “Save look.”</p></section>
    <section><h2>Optional live coach</h2><p>The live coach is off by default and requests microphone access only when you start it. It receives the current lesson step and beauty-profile context through an encrypted audio session, but it does not receive your live camera video. The browser receives only a short-lived OpenAI session credential; the permanent API key remains on the server. Ending the coach or leaving the Glam Room stops the microphone track.</p></section>
    <section><h2>Tutorial analysis</h2><p>Permitted uploaded videos and accessible public tutorials are sampled into still frames for lesson creation. Makeup Bestie sends those selected frames and your beauty-profile context to OpenAI, but does not permanently store the source video. Inaccessible links are rejected rather than treated as analyzed.</p></section>
    <section><h2>How data is used and shared</h2><p>We use account data to personalize lessons, provide subscriptions, prevent abuse, and operate the service. Production infrastructure may process data through Vercel, Supabase, Stripe, Apple, RevenueCat, and OpenAI. We do not sell facial images or camera footage, and we do not use your data for advertising or tracking across other companies&rsquo; apps and websites.</p></section>
    <section><h2>Your choices</h2><p>You can stop the camera immediately, avoid generating or saving a preview, delete individual saved looks, cancel billing (in your Apple ID subscription settings for App Store purchases, or the Stripe billing portal for website purchases), or delete your account and associated Makeup Bestie data from Profile. Legal or payment records may be retained where required.</p></section>
    <section><h2>Children</h2><p>Makeup Bestie is not directed at children under 13, and we do not knowingly collect personal information from them. Creating an account requires you to be at least 13. If you believe a child under 13 has an account, contact us and we will delete the account and its associated data.</p></section>
    <section><h2>Contact</h2><p>Privacy questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or see our <Link href="/support">support page</Link>.</p></section>
  </main>;
}
