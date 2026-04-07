import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InstAIgram",
  description: "AI-powered Instagram content generation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <nav className="border-b border-border sticky top-0 z-50 bg-background backdrop-blur-xl">
          <div className="max-w-[1800px] mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-foreground hover:text-accent transition-colors duration-200"
            >
              InstAIgram
            </Link>
            <div className="flex items-center gap-6">
              <Link
                href="/admin"
                className="text-sm font-medium text-muted-light hover:text-foreground transition-colors duration-200"
              >
                Dashboard
              </Link>
              <Link
                href="/carousel"
                className="text-sm font-medium text-muted-light hover:text-foreground transition-colors duration-200"
              >
                Create Carousel
              </Link>
              <span className="text-xs font-medium text-muted tracking-wide uppercase">
                Content Studio
              </span>
            </div>
          </div>
        </nav>
        <main className="max-w-[1800px] mx-auto px-6 lg:px-8 py-8 lg:py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
