<script lang="ts">
  import SiteHeader from '$lib/components/site-header.svelte';
  import SiteFooter from '$lib/components/footer.svelte';
  import Hero from '$lib/components/hero.svelte';
  import Section from '$lib/components/section.svelte';
  import ContactForm from '$lib/components/contact-form.svelte';
  import Manifesto from '$lib/components/manifesto.svelte';
  import Expertise from '$lib/components/expertise.svelte';
  import CaseStudies from '$lib/components/case-studies.svelte';
  import Approach from '$lib/components/approach.svelte';
  import Studio from '$lib/components/studio.svelte';
  import Testimonials from '$lib/components/testimonials.svelte';
  import Button from '$lib/components/button.svelte';

  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  
  let { dictionary, locale } = $derived(data);
  let { site, hero, partnerMarquee, sections, contactForm, footer, languageSwitcher } = $derived(dictionary);
  
  let headerNavigation = $derived(site.navigation);
  let socials = $derived(site.socials);
  let year = new Date().getFullYear();
  let rights = $derived(footer.rights.replace('{year}', year.toString()).replace('{name}', site.name));
</script>

<svelte:head>
  <title>{dictionary.metadata.title}</title>
  <meta name="description" content={dictionary.metadata.description} />
  <meta name="keywords" content={dictionary.metadata.keywords.join(', ')} />
  
  <meta property="og:title" content={dictionary.metadata.title} />
  <meta property="og:description" content={dictionary.metadata.description} />
  <meta property="og:site_name" content={site.name} />
  <meta property="og:type" content="website" />
  
  <meta name="twitter:title" content={dictionary.metadata.title} />
  <meta name="twitter:description" content={dictionary.metadata.description} />
</svelte:head>

<SiteHeader
  {locale}
  navigation={headerNavigation}
  collaborateLabel={site.collaborateCta}
  studioLabel={site.studioCta}
  logoAlt={site.logoAlt}
  languageLabel={languageSwitcher.label}
  homeLabel={site.name}
  menuLabel={dictionary.header.menuLabel}
/>

<main class="space-y-24 pb-24 pt-12 md:space-y-32 md:pt-20">
  <div class="container">
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

  <!-- Platform & Studio CTA -->
  <div class="container">
    <section class="retro-card relative overflow-hidden p-8 md:p-14 text-center">
      <div class="relative z-10 mx-auto max-w-3xl space-y-6">
        <span class="section-heading">
          {sections.platform.eyebrow}
        </span>
        <h2 class="font-display text-3xl text-foreground md:text-4xl lg:text-5xl font-normal tracking-tight">
          {sections.platform.title}
        </h2>
        <p class="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg leading-relaxed">
          {sections.platform.description}
        </p>

        <div class="flex flex-col items-center justify-center gap-4 sm:flex-row pt-2">
          <Button
            href="/login"
            size="lg"
            variant="solid"
          >
            {sections.platform.primaryCta}
          </Button>
          <Button
            href="#contact"
            size="lg"
            variant="ghost"
          >
            {sections.platform.secondaryCta}
          </Button>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-2.5 pt-6">
          {#each sections.platform.features as feature}
            <span class="inline-flex items-center gap-2 rounded-full border border-black/10 bg-surface/80 px-4 py-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
              {feature}
            </span>
          {/each}
        </div>
      </div>
    </section>
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

  <Section
    id="approach"
    eyebrow={sections.approach.eyebrow}
    title={sections.approach.title}
  >
    <Approach steps={sections.approach.steps} />
  </Section>

  <Section
    id="studio"
    eyebrow={sections.studio.eyebrow}
    title={sections.studio.title}
    description={sections.studio.description}
  >
    <Studio
      locations={sections.studio.studios}
      onsiteLabel={sections.studio.onsiteLabel}
    />
  </Section>

  {#if sections.testimonials.testimonials.length > 0}
    <Section
      id="testimonials"
      eyebrow={sections.testimonials.eyebrow}
      title={sections.testimonials.title}
      description={sections.testimonials.description}
    >
      <Testimonials testimonials={sections.testimonials.testimonials} />
    </Section>
  {/if}

  <Section
    id="contact"
    eyebrow={sections.contact.eyebrow}
    title={sections.contact.title}
    description={sections.contact.description}
  >
    <ContactForm {locale} copy={contactForm} />
  </Section>
</main>

<SiteFooter
  siteName={site.name}
  motto={site.motto}
  description={footer.description}
  navigation={headerNavigation}
  {socials}
  exploreLabel={footer.exploreLabel}
  socialLabel={footer.socialLabel}
  {rights}
  studiosLine={footer.studiosLine}
/>
