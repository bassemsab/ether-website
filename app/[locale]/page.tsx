import { Hero } from '@/components/hero';
import { PartnerMarquee } from '@/components/partner-marquee';
import { Section } from '@/components/section';
import { Manifesto } from '@/components/manifesto';
import { Expertise } from '@/components/expertise';
import { CaseStudies } from '@/components/case-studies';
import { Approach } from '@/components/approach';
import { Testimonials } from '@/components/testimonials';
import { Studio } from '@/components/studio';
import { ContactForm } from '@/components/contact-form';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/footer';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { defaultLocale, isLocale, locales, type Locale } from '@/lib/i18n/config';

type ParamsInput = { locale: string } | Promise<{ locale: string }>;

const resolveParams = async (params: ParamsInput): Promise<{ locale: string }> => {
  if (typeof (params as Promise<{ locale: string }>).then === 'function') {
    return params as Promise<{ locale: string }>;
  }
  return params as { locale: string };
};

type HomePageProps = {
  params: ParamsInput;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale: rawLocale } = await resolveParams(params);
  const locale: Locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const dictionary = getDictionary(locale);

  const { site, hero, partnerMarquee, sections, contactForm, footer, languageSwitcher } = dictionary;

  const headerNavigation = site.navigation;
  const socials = site.socials;
  const year = new Date().getFullYear();
  const rights = footer.rights(year, site.name);

  return (
    <>
      <SiteHeader
        locale={locale}
        navigation={headerNavigation}
        collaborateLabel={site.collaborateCta}
        logoAlt={site.logoAlt}
        languageLabel={languageSwitcher.label}
        homeLabel={site.name}
        menuLabel={dictionary.header.menuLabel}
      />
      <main className="space-y-24 pb-24 pt-12 md:space-y-32 md:pt-20">
        <div className="container">
          <Hero
            eyebrow={hero.eyebrow}
            heading={hero.heading}
            description={hero.description}
            primaryCta={hero.primaryCta}
            secondaryCta={hero.secondaryCta}
            highlights={hero.highlights}
            imageAlt={hero.imageAlt}
          />
        </div>
        <div className="container">
          <PartnerMarquee partners={partnerMarquee.partners} />
        </div>
        <Section
          id="manifesto"
          eyebrow={sections.manifesto.eyebrow}
          title={sections.manifesto.title}
          description={sections.manifesto.description}
        >
          <Manifesto
            paragraphs={sections.manifesto.paragraphs}
            bullets={sections.manifesto.bullets}
            offer={sections.manifesto.offer}
          />
        </Section>
        <Section
          id="expertise"
          eyebrow={sections.expertise.eyebrow}
          title={sections.expertise.title}
          description={sections.expertise.description}
        >
          <Expertise services={sections.expertise.services} />
        </Section>
        <Section
          id="cases"
          eyebrow={sections.cases.eyebrow}
          title={sections.cases.title}
          description={sections.cases.description}
        >
          <CaseStudies studies={sections.cases.caseStudies} />
        </Section>
        <Section id="approach" eyebrow={sections.approach.eyebrow} title={sections.approach.title}>
          <Approach steps={sections.approach.steps} />
        </Section>
        <Section
          id="studio"
          eyebrow={sections.studio.eyebrow}
          title={sections.studio.title}
          description={sections.studio.description}
        >
          <Studio locations={sections.studio.studios} onsiteLabel={sections.studio.onsiteLabel} />
        </Section>
        <Section
          id="testimonials"
          eyebrow={sections.testimonials.eyebrow}
          title={sections.testimonials.title}
          description={sections.testimonials.description}
        >
          <Testimonials testimonials={sections.testimonials.testimonials} />
        </Section>
        <Section
          id="contact"
          eyebrow={sections.contact.eyebrow}
          title={sections.contact.title}
          description={sections.contact.description}
        >
          <ContactForm locale={locale} copy={contactForm} />
        </Section>
      </main>
      <SiteFooter
        siteName={site.name}
        motto={site.motto}
        description={footer.description}
        navigation={headerNavigation}
        socials={socials}
        exploreLabel={footer.exploreLabel}
        socialLabel={footer.socialLabel}
        rights={rights}
        studiosLine={footer.studiosLine}
      />
    </>
  );
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
