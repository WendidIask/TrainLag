import type React from "react";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"

export const metadata: Metadata = {
    title: "Train Lag - The Game",
    description: "A game about praying your bus derails",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} text-1g`}>
            <body className="font-sans antialiased">
                {children}
                <SpeedInsights />
                <Analytics />
            </body>
        </html>
    );
}
