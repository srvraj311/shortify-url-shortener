import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shortify — URL Shortener",
  description:
    "A production-oriented URL shortener demonstrating system-design concepts: caching, rate limiting, async analytics, fault tolerance and observability.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
