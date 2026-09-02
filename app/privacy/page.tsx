import Link from "next/link";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export default function PrivacyPage() {
  return <main className="legal-page">
    <Link className="legal-home" href="/">← Makeup Bestie</Link>
    <p className="eyebrow">Privacy Policy</p>
    <h1>Your face stays yours.</h1>
    <p className="legal-updated">Effective September 1, 2026</p>
    <section><h2>What we collect</h2><p>We collect your account email, display name, beauty-profile answers, product list, subscription status, AI usage counts, and looks you deliberately choose to save. Stripe processes payment details; Makeup Bestie does not receive or store your full card number.</p></section>
    <section><h2>Photos and camera</h2><p>Facial landmarks and Glam Room tracking run on your device. Camera footage is not recorded or uploaded. Bare-face scan photos are not saved by default. When you explicitly request an AI preview, the selected photo and tutorial reference may be sent to OpenAI for that request. A generated preview is stored only when you choose “Save look.”</p></section>
    <section><h2>Tutorial analysis</h2><p>Permitted uploaded videos and accessible public tutorials are sampled into still frames for lesson creation. Makeup Bestie sends those selected frames and your beauty-profile context to OpenAI, but does not permanently store the source video. Inaccessible links are rejected rather than treated as analyzed.</p></section>
    <section><h2>How data is used and shared</h2><p>We use account data to personalize lessons, provide subscriptions, prevent abuse, and operate the service. Production infrastructure may process data through Vercel, Supabase, Stripe, and OpenAI. We do not sell facial images or camera footage.</p></section>
    <section><h2>Your choices</h2><p>You can stop the camera immediately, avoid generating or saving a preview, delete individual saved looks, cancel billing through Stripe, or delete your account and associated Makeup Bestie data from Profile. Legal or payment records may be retained where required.</p></section>
    <section><h2>Contact</h2><p>{supportEmail ? <>Privacy questions: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</> : <>A public support address will be added before launch.</>}</p></section>
  </main>;
}
