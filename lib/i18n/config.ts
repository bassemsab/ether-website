export const locales = ["fr", "en", "ar"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fr";

export const isLocale = (value: string): value is Locale =>
  locales.includes(value as Locale);

export const localeNames: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

export const localeDirections: Record<Locale, "ltr" | "rtl"> = {
  fr: "ltr",
  en: "ltr",
  ar: "rtl",
};

export const localeAbbreviations: Record<Locale, string> = {
  fr: "FR",
  en: "EN",
  ar: "AR",
};
