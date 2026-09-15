"use client"

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LOCALE_LABEL: Record<string, string> = { en: "English", es: "Español", pt: "Português" };

export function LanguageSwitcher() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
          <label className="flex items-center gap-1.5 text-sm">
          <span className="sr-only">{t("common.language")}</span>
          <select
          value={locale}
          onChange={(event) => router.replace(pathname, { locale: event.target.value })}
          className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
          {routing.locales.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}
          </select>
          </label>
          );
}
