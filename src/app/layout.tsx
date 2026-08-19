import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { config } from "@/lib/config";
import "./globals.css";

// Matches --canvas, so mobile browser chrome continues the ocean.
export const viewport: Viewport = {
  themeColor: "#f7f1e3",
};

// Kept short and punchy for openGraph/twitter — those render as a card in a
// feed, not as running copy — and matched to how the game actually explains
// itself in InstructionsModal (guess what the map is measuring, not "the
// place"), since that's what a reader lands on right after the click.
const socialDescription =
  "Title and legend hidden — guess what it's measuring. Five tries, once a day.";

export const metadata: Metadata = {
  // Absolute base for the OG/Twitter image URLs Next emits from
  // opengraph-image.tsx/twitter-image.tsx — without this, Next falls back to
  // localhost outside Vercel's own VERCEL_URL, which 404s for an external
  // crawler. See config.siteUrl for the fallback order.
  metadataBase: config.siteUrl ? new URL(config.siteUrl) : undefined,
  title: "Map of the Day",
  // Matches socialDescription: the previous copy ("guess the place") predates
  // the game's pivot to topic-guessing and was actively wrong.
  description: socialDescription,
  openGraph: {
    title: "Map of the Day",
    description: socialDescription,
    siteName: "Map of the Day",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Map of the Day",
    description: socialDescription,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        {children}
        {/* No-ops locally / anywhere outside a real Vercel deployment — it
            only actually sends data once the project's Analytics tab is
            turned on in the dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}
