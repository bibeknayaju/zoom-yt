import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

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
          className="min-h-full bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white font-sans">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
