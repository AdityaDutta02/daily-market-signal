import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Market Signal",
  description: "AI-powered morning market brief delivered to your inbox",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
