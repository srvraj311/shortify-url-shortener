import type { MetadataRoute } from "next";

/** Don't index short links or the API; the marketing page is fine. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dashboard", "/settings"] }],
  };
}
