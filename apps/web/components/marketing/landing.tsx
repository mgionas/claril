import { AlphaBanner } from "./alpha-banner";
import { FeatureGrid } from "./feature-grid";
import { FinalCta } from "./final-cta";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { MarketingNav } from "./marketing-nav";
import { OpenSourceBand } from "./open-source-band";
import { TrustStrip } from "./trust-strip";

/**
 * Marketing landing page rendered at `/` for logged-out visitors.
 * Server component — purely presentational, no client interactivity.
 */
export function Landing() {
  return (
    // Marketing is dark-only for now — force the dark token scope regardless of
    // the user's app theme.
    <div className="dark min-h-screen bg-canvas text-fg">
      <AlphaBanner />
      <MarketingNav />
      <main>
        <Hero />
        <TrustStrip />
        <FeatureGrid />
        <HowItWorks />
        <OpenSourceBand />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
