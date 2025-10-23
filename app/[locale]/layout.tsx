import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locales, defaultLocale, isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { siteConfig } from "@/lib/utils/site-config";

type LocaleParams = { locale: string };

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<LocaleParams>;
};

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const resolvedParams = await params;
  const locale = isLocale(resolvedParams.locale) ? resolvedParams.locale : defaultLocale;
  const dictionary = getDictionary(locale);

  const languageAlternates = Object.fromEntries(
    locales.map((loc) => [loc, `/${loc}`])
  );

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: dictionary.metadata.title,
      template: `%s · ${dictionary.site.name}`,
    },
    description: dictionary.metadata.description,
    keywords: dictionary.metadata.keywords,
    alternates: {
      canonical: `/${locale}`,
      languages: languageAlternates,
    },
    openGraph: {
      title: dictionary.metadata.title,
      description: dictionary.metadata.description,
      url: `${siteConfig.url}/${locale}`,
      siteName: dictionary.site.name,
      images: [
        {
          url: siteConfig.ogImage,
          width: 1600,
          height: 900,
          alt: dictionary.hero.imageAlt,
        },
      ],
      locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: dictionary.metadata.title,
      description: dictionary.metadata.description,
      images: [siteConfig.ogImage],
    },
  };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return <>{children}</>;
}
