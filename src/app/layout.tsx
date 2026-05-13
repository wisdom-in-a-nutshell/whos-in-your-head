import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Who's In Your Head?",
  description: "Think of a famous person. The AI has 21 questions."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
