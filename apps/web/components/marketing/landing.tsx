import { SITE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { AlphaBanner } from "./alpha-banner";
import { FeatureGrid } from "./feature-grid";
import { FinalCta } from "./final-cta";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { MarketingNav } from "./marketing-nav";
import { OpenSourceBand } from "./open-source-band";
import { TrustStrip } from "./trust-strip";

/** Schema.org SoftwareApplication markup for rich search results. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web, self-hostable (Docker)",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  license: "https://www.gnu.org/licenses/agpl-3.0.html",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  codeRepository: SITE.githubUrl,
};

/**
 * Marketing landing page rendered at `/` for logged-out visitors.
 * Server component — purely presentational, no client interactivity.
 */
export function Landing() {
  return (
    // Marketing is dark-only for now — force the dark token scope regardless of
    // the user's app theme.
    <div className="dark min-h-screen bg-canvas text-fg">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- static, trusted JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
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
