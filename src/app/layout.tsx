import type { Metadata } from "next";
import "./globals.css";

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
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
