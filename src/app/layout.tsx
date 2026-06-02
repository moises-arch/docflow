import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { cookies } from "next/headers";
import { THEME_COOKIE_NAME } from "@/lib/theme";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "DocFlow — AI Document Processing",
  description: "Procesamiento de órdenes de compra con IA",
  authors: [{ name: "DocFlow" }],
  creator: "DocFlow",
  icons: {
    icon: [
      { url: "/docflow-icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/docflow-icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/docflow-icon.svg",
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const themePref = cookieStore.get(THEME_COOKIE_NAME)?.value ?? "system";
  // We can't know system preference on the server, so default to light.
  // Client shell will correct it on mount if needed.
  const dataTheme = themePref === "dark" ? "dark" : "light";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={dataTheme}
      data-theme-preference={themePref}
      className={cn("h-full", GeistMono.variable, "font-sans", geist.variable)}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
