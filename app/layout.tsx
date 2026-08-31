import type { Metadata } from "next";
import "./globals.css";
import "./tutorial-source.css";

export const metadata: Metadata = {
  title: "Makeup Bestie — Your artist, your hype woman",
  description: "Personalized makeup guidance built around your face, your products, and your pace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: "#fffaf4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
