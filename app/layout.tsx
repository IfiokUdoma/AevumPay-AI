import type { Metadata } from "next";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "AevumPay AI · Payment desk",
  description:
    "Supplier obligations, evidence and buyer-approved settlement on QDay Aevum.",
  icons: { icon: "/favicon.svg" },
  referrer: "no-referrer",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
