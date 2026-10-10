import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ViewportGuard } from "@/components/ViewportGuard";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Render every page per request. A prerendered page shares one in-flight render per
// Worker isolate (Next's ResponseCache batcher); on Cloudflare, if that render's request
// dies mid-flight the shared promise never settles, and every later request for the page
// on that isolate hangs until the isolate is evicted. /login hung on ~half of PDX requests
// for hours this way (Oct 2026); redeploys only cleared it until the next wedge.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GolfPack",
  description: "Golf tee time scheduling for your group",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GolfPack",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`} style={{ color: "#fff" }}>
        <ViewportGuard />
        {children}
      </body>
    </html>
  );
}
