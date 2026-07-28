import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NWG Coaches Hub",
  description: "Coaching intranet for Nile Wilson Gymnastics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
