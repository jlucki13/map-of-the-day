import type { Metadata, Viewport } from "next";
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
  title: "Map of the Day",
  description:
    "Guess the place from a map with its title and legend hidden. A new map every day.",
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
      </body>
    </html>
  );
}
