import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Atkinson_Hyperlegible_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Shell } from "@/components/Shell";
import "./globals.css";

// Atkinson Hyperlegible was designed for low-vision readers: distinct letterforms (Il1, 0O) for an audience reading under stress.
const sans = Atkinson_Hyperlegible_Next({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-sans-face" });
const mono = Atkinson_Hyperlegible_Mono({ subsets: ["latin"], weight: "400", variable: "--font-mono-face" });

export const metadata: Metadata = {
  title: "CaseCommons",
  description: "Your story. Shared evidence. No single point of control. (Demonstration prototype with fictional data.)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${sans.variable} ${mono.variable}`}>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body>; don't treat that as a hydration error. */}
      <body suppressHydrationWarning>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
