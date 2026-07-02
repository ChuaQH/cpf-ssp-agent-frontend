import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/use-auth";
import { AuthGate } from "@/components/AuthGate";

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
      <body>
        {/* AuthProvider fetches the session once; AuthGate blocks the app until
            a gateway identity is present (or shows a return-to-portal message). */}
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
