import type { FastifyInstance } from 'fastify';

/**
 * Public pages the App Store listing links to: privacy policy and support.
 * Plain HTML in the Dialed palette, no scripts, no tracking.
 */
const SUPPORT_URL = 'https://github.com/Xnvoy2/Dialed/issues';
const UPDATED = '31 October 2026';

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Dialed</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0A081E; color: #FFFFFF; font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 48px 16px 72px; }
  h1 { font-size: 34px; line-height: 1.15; margin: 0 0 6px; }
  h2 { font-size: 20px; margin: 36px 0 8px; }
  p, li { color: #C9CCE6; }
  .muted { color: #8A8FB8; font-size: 15px; }
  a { color: #3D7BFF; }
  ul { padding-left: 20px; }
  nav { margin-bottom: 32px; font-weight: 600; letter-spacing: 0.02em; }
</style></head>
<body><main><nav>Dialed</nav>${body}</main></body></html>`;
}

const PRIVACY = page(
  'Privacy Policy',
  `<h1>Privacy Policy</h1>
<p class="muted">Last updated ${UPDATED}</p>
<p>Dialed is a focus and habits app. It is built so that what you do in it stays on your iPhone. This policy explains the small amount that leaves it, and why.</p>

<h2>Stored only on your iPhone</h2>
<p>Your tasks, notes, habits, check-ins, focus sessions and settings live in a local database on your device. They are never sent to us. You can export all of it as a file, or delete all of it, from Settings › Privacy &amp; data.</p>

<h2>What our server receives</h2>
<p>When you sign in with Apple, our server stores:</p>
<ul>
  <li><strong>Your Sign in with Apple identifier</strong>, a random ID Apple gives us, and the name you choose to share. We do not request or store your email address.</li>
  <li><strong>A wallet address</strong>, if you add one to receive USDC payouts.</li>
  <li><strong>Reward records</strong>: which reward offers you accepted, and for each eligible focus session only the numbers needed to check the rule, such as its length and whether it was paused. Never task names, habit names or notes.</li>
  <li><strong>Payout records</strong>: amounts, the address paid and the blockchain transaction ID. Payouts are public on the Solana blockchain by design.</li>
  <li><strong>An App Attest key</strong>, which proves to us that requests come from the genuine app on a real iPhone. It contains nothing about you.</li>
</ul>

<h2>Screen Time</h2>
<p>If you turn on app blocking, Apple's picker gives Dialed anonymous tokens for the apps you choose. Dialed cannot see app names, your browsing or your usage, and the tokens never leave your device.</p>

<h2>What we don't do</h2>
<p>No advertising, no analytics, no tracking across apps or websites, and no selling or sharing of data. We use no third-party SDKs that collect data.</p>

<h2>Service providers</h2>
<p>Our server runs on Vercel, and its database is hosted by Neon. They process data only to run the service for us.</p>

<h2>Deleting your account</h2>
<p>Settings › Delete account removes your account and reward records from our server. Records of payouts already sent stay on the blockchain, which nobody can change. Deleting the app removes everything stored on your phone.</p>

<h2>Children</h2>
<p>Dialed is not directed at children under 13.</p>

<h2>Changes and contact</h2>
<p>If this policy changes, we'll update the date above. Questions or requests: <a href="${SUPPORT_URL}">${SUPPORT_URL.replace('https://', '')}</a>.</p>`,
);

const SUPPORT = page(
  'Support',
  `<h1>Support</h1>
<p>Need help with Dialed, found a bug or have an idea? <a href="${SUPPORT_URL}">Open an issue</a> and we'll get back to you.</p>

<h2>Common questions</h2>
<p><strong>Where is my data?</strong> On your iPhone. Export or delete it from Settings › Privacy &amp; data.</p>
<p><strong>Why didn't a session earn a reward?</strong> Each offer has a published rule (for example, a minimum focus length and a daily cap). The Rewards tab shows the rule and why a session did or didn't qualify.</p>
<p><strong>How do I delete my account?</strong> Settings › Delete account.</p>
<p><strong>App blocking isn't available.</strong> Blocking uses Apple's Screen Time and is turned on in an upcoming version.</p>

<p class="muted"><a href="/privacy">Privacy Policy</a></p>`,
);

export function registerLegalPages(app: FastifyInstance) {
  const send = (html: string) => async (_req: unknown, reply: { type: (t: string) => { send: (b: string) => unknown } }) =>
    reply.type('text/html; charset=utf-8').send(html);
  app.get('/privacy', send(PRIVACY));
  app.get('/support', send(SUPPORT));
  app.get('/', send(SUPPORT));
}
