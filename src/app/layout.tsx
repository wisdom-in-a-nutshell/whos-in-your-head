import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://mindreader.adithyan.io"),
  title: "Who's In Your Head?",
  description: "Think of someone famous. I get 21 questions and one guess.",
  icons: {
    icon: "/favicon.ico"
  },
  openGraph: {
    title: "Who's In Your Head?",
    description: "Think of someone famous. I get 21 questions and one guess.",
    url: "https://mindreader.adithyan.io",
    siteName: "Who's In Your Head?",
    images: [
      {
        url: "https://mindreader.adithyan.io/opengraph-image",
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
        url: "https://mindreader.adithyan.io/opengraph-image",
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
