import type { Metadata } from "next";
import "./globals.css";
import { Toast } from "@/components/Toast";
import { AbortErrorSuppressor } from "@/components/AbortErrorSuppressor";

export const metadata: Metadata = {
  title: "Node Banana - AI Image Workflow",
  description: "Node-based image annotation and generation workflow using Nano Banana Pro",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toast />
        <AbortErrorSuppressor />
      </body>
    </html>
  );
}
