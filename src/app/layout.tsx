import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AbortErrorHandler } from "@/components/AbortErrorHandler";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "ClicVend",
  description: "Sistema de atendimento multi-empresas (WhatsApp)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={plusJakarta.variable}>
      <body className="font-sans antialiased">
        <AbortErrorHandler />
        {children}
      </body>
    </html>
  );
}
