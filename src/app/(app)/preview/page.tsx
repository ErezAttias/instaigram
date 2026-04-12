'use client';

import InstagramPreview from '@/components/InstagramPreview';
import '@/components/instagram-preview.css';

/**
 * Preview page for reviewing carousels as they would appear on Instagram.
 * Pass carousel slides + post copy to the InstagramPreview component.
 */
export default function PreviewPage() {
  // ── Demo data (replace with real carousel data) ──────────
  // Generate colored placeholder slides via inline SVG data URIs
  const makePlaceholder = (text: string, bg: string) =>
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 480 600">
        <rect width="480" height="600" fill="${bg}"/>
        <text x="240" y="300" text-anchor="middle" dominant-baseline="middle"
              font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="white">${text}</text>
      </svg>`
    )}`;

  const demoSlides = [
    makePlaceholder('Slide 1 — Hook', '#1a1a2e'),
    makePlaceholder('Slide 2 — Data', '#16213e'),
    makePlaceholder('Slide 3 — Insight', '#0f3460'),
    makePlaceholder('Slide 4 — Compare', '#1a1a2e'),
    makePlaceholder('Slide 5 — CTA', '#e94560'),
  ];

  const demoCaption = `Swipe \u27A1\uFE0F to see how Apple officially flipped Samsung to grab the number one spot in global smartphone shipments and financial dominance in the latest fiscal year report \uD83D\uDCCA\uD83D\uDCF1

The new data shows the iPhone giant shipped 243 million units to beat Samsung\u2019s 240 million and secured nineteen percent of the market. This volume victory complements a massive revenue lead of 416 billion dollars compared to just 233 billion for the galaxy maker.

Their valuation hit 3.8 trillion dollars while net profits tripled the competition at 102 billion dollars. Apple also leads heavily in future investment with higher R&D spending and a massive installed base of over 2.5 billion active devices globally.

Which brand do you think offers better value for money today?

Sources: Apple & Samsung FY2025 Reports, IDC Worldwide Tracker (Jan 2026)`;

  const demoHashtags = '#apple #samsung #technology #finance #business';

  const demoComments = [
    {
      username: 'shane_onyouu',
      text: 'Howwww bro... Nearly the same units, samsung makes the displays and a bunch of other stuff for apple! And how\'s R&D of this high and still Siri is complete crap! Had to beg google finally after putting that much into R&D! Samsung\'s AI is way ahead of apple! (Typing this on an iphone, not an android geek)',
      likes: 3,
      timeAgo: '7w',
      replies: 1,
    },
    {
      username: 'iamsuperboy2024',
      text: 'Tough competition \uD83D\uDD25\uD83D\uDE80',
      likes: 2,
      timeAgo: '6w',
    },
  ];

  return (
    <div className="py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Carousel Preview</h1>
        <p className="text-muted-light text-sm">
          Review your carousel exactly as it will appear on Instagram.
        </p>
      </div>

      <div className="flex justify-center">
        <InstagramPreview
          username="technology"
          verified
          slides={demoSlides}
          caption={demoCaption}
          hashtags={demoHashtags}
          likesCount="50K"
          timestamp="January 30"
          comments={demoComments}
        />
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-muted">
          Use arrow keys or swipe to navigate between slides
        </p>
      </div>
    </div>
  );
}
