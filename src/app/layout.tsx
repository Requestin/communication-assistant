import type { Metadata } from "next";
import { Golos_Text, Onest } from "next/font/google";
import "./globals.css";

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["cyrillic", "latin"],
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["cyrillic", "latin"],
});

export const metadata: Metadata = {
  title: "AI Помощник",
  description: "Пилот сервиса для менеджеров командировок",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <body className={`${golos.variable} ${onest.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
