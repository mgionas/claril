import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Crawl the public marketing + docs surface; keep the authed app (diagrams,
 * projects, settings, workspaces, catalog, API) out of the index — those routes
 * redirect to sign-in for anonymous visitors and hold no crawlable content.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/d/", "/projects", "/workspaces", "/w/", "/settings", "/catalog", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
