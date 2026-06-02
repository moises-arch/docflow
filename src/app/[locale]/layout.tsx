import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Toaster } from "sonner";
import { ProgressBar } from "@/components/app/progress-bar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DocFlow — AI Document Processing",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <ProgressBar />
      {children}
      <Toaster
        position="bottom-right"
        duration={4000}
        toastOptions={{
          classNames: {
            toast:
              "!bg-[var(--color-fg)] !text-white border-none rounded-[var(--radius-md)] py-2.5 px-3 text-sm shadow-md",
            title: "!text-white",
            description: "!text-white/85",
            actionButton: "!bg-white !text-black",
            cancelButton: "!bg-white/15 !text-white",
            success: "!bg-[var(--color-fg)] [&_[data-icon]]:!text-emerald-400",
            error: "!bg-[var(--color-fg)] [&_[data-icon]]:!text-red-400",
          },
        }}
      />
    </NextIntlClientProvider>
  );
}
