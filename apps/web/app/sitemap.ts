import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Public, indexable URLs — the landing page and the docs section. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const paths: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/docs", priority: 0.8, changeFrequency: "weekly" },
    { path: "/docs/getting-started", priority: 0.7, changeFrequency: "monthly" },
    { path: "/docs/self-hosting", priority: 0.7, changeFrequency: "monthly" },
    { path: "/docs/cli", priority: 0.6, changeFrequency: "monthly" },
    { path: "/docs/ai-providers", priority: 0.6, changeFrequency: "monthly" },
  ];
  return paths.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
