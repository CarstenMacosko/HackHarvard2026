import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Visual Follow-Up",
  description: "Clinician-verified visual follow-up for longitudinal studies",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
