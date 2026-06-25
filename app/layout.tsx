import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CPF SSP Agent — IM8 Compliance Assessment",
  description:
    "Run an automated IM8 compliance assessment against a code repository and download the gap report, remediation plan, and filled SSP.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
