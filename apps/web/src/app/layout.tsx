import type { Metadata } from "next";
import { Baloo_2, Mukta } from "next/font/google";
import "./globals.css";

// Both fonts are drawn for Devanagari and Latin, as the design specifies.
const baloo = Baloo_2({
  variable: "--font-heading",
  subsets: ["latin", "devanagari"],
  weight: ["600", "700", "800"],
});

const mukta = Mukta({
  variable: "--font-body",
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "NeoBridge", template: "%s · NeoBridge" },
  description: "Newborn warmth band for families, ASHAs and doctors",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${baloo.variable} ${mukta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
