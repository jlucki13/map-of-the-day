import type { Metadata, Viewport } from "next";
import "./globals.css";

// Matches --canvas, so mobile browser chrome continues the ocean.
export const viewport: Viewport = {
  themeColor: "#f7f1e3",
};

export const metadata: Metadata = {
  title: "Map of the Day",
  description:
    "Guess the place from a map with its title and legend hidden. A new map every day.",
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
