import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";


export default function TermsPage() {
  return <main className="legal-page">
    <Link className="legal-home" href="/">← Makeup Bestie</Link>
    <p className="eyebrow">Terms of Service</p>
    <h1>A creative coach, not a medical service.</h1>
    <p className="legal-updated">Effective September 1, 2026</p>
    <section><h2>Service</h2><p>Makeup Bestie turns eligible makeup tutorials into personalized educational placement guidance. Face-shape, Face Blueprint, skin-context, and product suggestions are editable estimates rather than diagnoses or guaranteed outcomes. The service is not medical, dermatological, or professional health advice; stop using a product if irritation or another safety concern occurs.</p></section>
    <section><h2>Who can use Makeup Bestie</h2><p>You must be at least 13 years old to create an account, and old enough in your country to agree to these terms. If you are under the age of majority where you live, use Makeup Bestie only with the involvement of a parent or guardian, who agrees to these terms with you. We do not knowingly create accounts for children under 13; if we learn that we have, we will delete the account and its associated data.</p></section>
    <section><h2>Your account and content</h2><p>You are responsible for your account and for supplying only tutorials, videos, and images you are allowed to use. Do not use the service to infringe rights, impersonate others, automate requests, reverse engineer the service, or upload harmful or unlawful material.</p></section>
    <section><h2>Subscriptions</h2><p>Plus is $12.99 per month and includes 12 tutorial adaptations per calendar month, each with one personalized preview. Unlimited is $49.99 per month for normal personal use and includes reasonable anti-automation and abuse protection. Plans renew until cancelled. Where you bought the plan determines how you manage it: subscriptions purchased in the iOS app are billed through your Apple ID and are managed or cancelled in your Apple ID subscription settings, while subscriptions purchased on this website are billed through Stripe and are managed in the Stripe billing portal. An Apple subscription renews automatically unless auto-renew is turned off at least 24 hours before the end of the current period, and your Apple ID is charged for renewal within 24 hours prior to the end of that period. Cancellation takes effect at the end of the paid period unless applicable law requires otherwise. Refunds for App Store purchases are handled by Apple.</p></section>
    <section><h2>Availability and AI output</h2><p>AI output may be incomplete or inaccurate, and some social platforms prevent linked-video access. We will label uncertainty and will not claim blocked content was analyzed. Service features, supported platforms, and model availability may change.</p></section>
    <section><h2>Liability</h2><p>To the fullest extent allowed by law, Makeup Bestie is provided “as is” without guarantees of a particular result. You remain responsible for product choices, allergy checks, tutorial rights, and how you apply the guidance.</p></section>
    <section><h2>Contact</h2><p>Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or see our <Link href="/support">support page</Link>.</p></section>
  </main>;
}
