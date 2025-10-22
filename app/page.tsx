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

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="space-y-24 pb-24 pt-12 md:space-y-32 md:pt-20">
        <div className="container">
          <Hero />
        </div>
        <div className="container">
          <PartnerMarquee />
        </div>
        <Section
          id="manifesto"
          eyebrow="Manifeste"
          title="Designer des souvenirs digitaux pour les cultures qui se transforment."
          description="Ether accompagne les maisons, institutions et médias qui cultivent le temps long avec des expériences à la fois tactiles et mesurables."
        >
          <Manifesto />
        </Section>
        <Section
          id="expertise"
          eyebrow="Expertise"
          title="Compétences orchestrées autour de Retroui."
          description="Une esthétique rétro-futuriste soutenue par une exécution moderne et une gouvernance projet exigeante."
        >
          <Expertise />
        </Section>
        <Section
          id="cases"
          eyebrow="Études de cas"
          title="Des lancements orchestrés avec soin."
          description="Chaque mandat est conçu comme une résidence, du terrain jusqu’aux activations live."
        >
          <CaseStudies />
        </Section>
        <Section
          id="approach"
          eyebrow="Approche"
          title="Un parcours en trois temps, incarné et mesurable."
        >
          <Approach />
        </Section>
        <Section
          id="studio"
          eyebrow="Studio"
          title="Collectif international, ancré localement."
          description="Des bases créatives connectées sur trois continents pour rester proches des scènes culturelles que nous accompagnons."
        >
          <Studio />
        </Section>
        <Section
          id="testimonials"
          eyebrow="Témoignages"
          title="Feedbacks d’alliés"
          description="Des partenariats durables avec maisons, radios, musées et studios indépendants."
        >
          <Testimonials />
        </Section>
        <Section
          id="contact"
          eyebrow="Contact"
          title="Imaginons votre prochain chapitre."
          description="Présentez-nous votre projet, nous vous répondons sous 48h avec un premier plan d’action."
        >
          <ContactForm />
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
