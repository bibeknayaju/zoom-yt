import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Zoom & YouTube Studio | Union Education",
  description: "Automated Zoom cloud recording watermarking and YouTube direct upload pipeline",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark h-full antialiased">
        <body
          className={`${geistSans.variable} ${geistMono.variable} min-h-full bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
