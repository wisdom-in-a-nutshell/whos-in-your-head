import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "Who's In Your Head?",
  description: "Think of someone famous. I get 21 questions and one guess.",
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: "/favicon.ico"
  },
  openGraph: {
    title: "Who's In Your Head?",
    description: "Think of someone famous. I get 21 questions and one guess.",
    url: "/",
    siteName: "Who's In Your Head?",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Who's In Your Head? Think of someone famous. I'll guess in 21 questions."
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Who's In Your Head?",
    description: "Think of someone famous. I get 21 questions and one guess.",
    images: [
      {
        url: "/twitter-image",
        alt: "Who's In Your Head? Think of someone famous. I'll guess in 21 questions."
      }
    ]
  }
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
