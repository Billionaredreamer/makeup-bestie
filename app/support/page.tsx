import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";
import type { Metadata } from "next";


export const metadata: Metadata = {
  title: "Support — Makeup Bestie",
  description:
    "Help with your Makeup Bestie account, subscription, lessons, camera permissions and privacy.",
};

export default function SupportPage() {
  return <main className="legal-page">
    <Link className="legal-home" href="/">← Makeup Bestie</Link>
    <p className="eyebrow">Support</p>
    <h1>We&rsquo;re here to help.</h1>
    <p className="legal-updated">Updated September 4, 2026</p>

    <section>
      <h2>Contact us</h2>
      <p>Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we&rsquo;ll reply within two business days. Include the email address on your account and, if it helps, a screenshot of what you&rsquo;re seeing.</p>
    </section>

    <section>
      <h2>Getting started</h2>
      <p>After you sign in, Makeup Bestie asks a few questions about your skin type, complexion, experience level and the products you already own. Those answers shape every lesson, so it&rsquo;s worth a minute. You can change them any time from Profile.</p>
      <p>From Home, paste a link to a makeup tutorial or upload a short video. Makeup Bestie breaks the tutorial into ordered steps and rewrites each one for your face. Some social platforms block automated access to their videos; when that happens we tell you the link couldn&rsquo;t be read rather than guessing at the content.</p>
    </section>

    <section>
      <h2>Camera, photos and the voice coach</h2>
      <p>Face mapping runs on your device and camera video is never recorded or uploaded. A still photo is sent for analysis only when you explicitly ask for a personalized preview, and a look is stored only when you tap Save look.</p>
      <p>The voice coach is off by default and asks for microphone access only when you start it. It receives the current lesson step and your beauty profile, never your camera video. Leaving the Glam Room stops the microphone.</p>
      <p>If the camera or microphone doesn&rsquo;t start, check Settings &rarr; Makeup Bestie on your device and make sure access is allowed, then reopen the app.</p>
    </section>

    <section>
      <h2>Subscriptions and billing</h2>
      <p><b>In the iOS app.</b> Subscriptions bought in the app are billed through your Apple ID. To view, change or cancel a plan, open Settings &rarr; your name &rarr; Subscriptions on your iPhone, or tap <i>Manage in App Store</i> in your Makeup Bestie profile. Cancelling stops the next renewal; your plan stays active until the end of the period you already paid for.</p>
      <p>If you subscribed on another device with the same Apple ID, tap <i>Restore purchases</i> on the subscription screen.</p>
      <p><b>On the website.</b> Subscriptions bought at makeupbestie.app are billed through Stripe. Manage or cancel them from <i>Manage subscription</i> in your profile on the web.</p>
      <p>Refunds for purchases made through the App Store are handled by Apple at <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>. For website purchases, email us and we&rsquo;ll take a look.</p>
    </section>

    <section>
      <h2>Your account and your data</h2>
      <p>You can delete individual saved looks, or delete your account and its associated Makeup Bestie data, from Profile. Deleting your account does not automatically cancel an App Store subscription &mdash; cancel that in your Apple ID subscription settings as well.</p>
      <p>Full details are in our <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>.</p>
    </section>
  </main>;
}
