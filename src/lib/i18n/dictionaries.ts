import type { Locale } from "./config";

type NavigationItem = {
  label: string;
  href: string;
};

type Highlight = {
  label: string;
  value: string;
  detail: string;
  id?: string;
};

type Service = {
  title: string;
  description: string;
  deliverables: string[];
};

type CaseStudy = {
  title: string;
  sector: string;
  summary: string;
  metrics: string[];
  image: string;
  url?: string;
};

type ApproachStep = {
  title: string;
  description: string;
  phase: string;
};

type Testimonial = {
  quote: string;
  author: string;
  role: string;
};

/**
 * Toggle this flag to true once customer photos and approvals are received to display testimonials on the homepage
 */
export const SHOW_CLIENT_TESTIMONIALS = false;

type StudioLocation = {
  city: string;
  timezone: string;
  focus: string;
};

type ContactFormCopy = {
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  companyLabel: string;
  companyPlaceholder: string;
  messageLabel: string;
  messagePlaceholder: string;
  submitIdle: string;
  submitPending: string;
  helper: string;
  success: string;
  error: string;
};

type HomeDictionary = {
  locale: Locale;
  langLabel: string;
  site: {
    name: string;
    motto: string;
    description: string;
    navigation: NavigationItem[];
    socials: NavigationItem[];
    collaborateCta: string;
    studioCta: string;
    logoAlt: string;
  };
  header: {
    menuLabel: string;
  };
  metadata: {
    title: string;
    description: string;
    keywords: string[];
  };
  hero: {
    eyebrow: string;
    heading: string;
    description: string;
    primaryCta: { label: string; href: string };
    secondaryCta: { label: string; href: string };
    highlights: Highlight[];
    imageAlt: string;
  };
  partnerMarquee: {
    partners: string[];
  };
  sections: {
    platform: {
      eyebrow: string;
      title: string;
      description: string;
      primaryCta: string;
      secondaryCta: string;
      features: string[];
    };
    manifesto: {
      eyebrow: string;
      title: string;
      description: string;
      paragraphs: string[];
      bullets: string[];
      offer: {
        title: string;
        description: string;
        phases: { label: string; timeline: string }[];
      };
    };
    expertise: {
      eyebrow: string;
      title: string;
      description: string;
      services: Service[];
    };
    cases: {
      eyebrow: string;
      title: string;
      description: string;
      caseStudies: CaseStudy[];
    };
    approach: {
      eyebrow: string;
      title: string;
      steps: ApproachStep[];
    };
    studio: {
      eyebrow: string;
      title: string;
      description: string;
      studios: StudioLocation[];
      onsiteLabel: string;
    };
    testimonials: {
      eyebrow: string;
      title: string;
      description: string;
      testimonials: Testimonial[];
    };
    contact: {
      eyebrow: string;
      title: string;
      description: string;
    };
  };
  contactForm: ContactFormCopy;
  footer: {
    description: string;
    exploreLabel: string;
    socialLabel: string;
    rights: string;
    studiosLine: string;
  };
  languageSwitcher: {
    label: string;
  };
};

const dictionaries: Record<Locale, HomeDictionary> = {
  fr: {
    locale: "fr",
    langLabel: "Français",
    site: {
      name: "Ether",
      motto: "Tout Partout",
      description:
        "Ether conçoit et déploie des expériences numériques singulières, mêlant ingénierie logicielle, design tactile et systèmes intelligents.",
      navigation: [
        { label: "Manifeste", href: "#manifesto" },
        { label: "Expertise", href: "#expertise" },
        { label: "Projets", href: "#cases" },
        { label: "Approche", href: "#approach" },
        { label: "Studio", href: "#studio" },
        { label: "Contact", href: "#contact" },
      ],
      socials: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/bassemsab/" },
        { label: "Instagram", href: "https://www.instagram.com/bassem.sab/" },
      ],
      collaborateCta: "Collaborer",
      studioCta: "Studio",
      logoAlt: "Ether · Studio Numérique",
    },
    header: {
      menuLabel: "Menu",
    },
    metadata: {
      title: "Ether · Tout Partout",
      description:
        "Studio d'ingénierie et de design numérique : applications web & mobiles, expériences interactives et systèmes d'intelligence artificielle.",
      keywords: [
        "Studio créatif",
        "Développement logiciel",
        "SvelteKit",
        "Applications web",
        "Design d'interface",
        "Intelligence artificielle",
        "Expériences interactives",
        "Ingénierie full stack",
      ],
    },
    hero: {
      eyebrow: "Tout Partout",
      heading:
        "Ingénierie logicielle, design d'interfaces et expériences numériques sur-mesure.",
      description:
        "De la conception d'interfaces singulières au déploiement d'architectures temps réel et d'agents IA, Ether développe des produits numériques exigeants et soignés.",
      primaryCta: { label: "Entrer en contact", href: "#contact" },
      secondaryCta: { label: "Explorer les projets", href: "#cases" },
      highlights: [
        {
          label: "Projets en production",
          value: "3",
          detail: "Applications IA, e-commerce & art interactif",
        },
        {
          label: "Ingénierie sur-mesure",
          value: "100%",
          detail: "SvelteKit, Bun, TypeScript & stack moderne",
        },
        {
          label: "Ancrage",
          value: "Paris",
          detail: "Studio indépendant, collaboration globale",
        },
      ],
      imageAlt: "Ether · Assemblage créatif et technologique",
    },
    partnerMarquee: {
      partners: [
        "SvelteKit",
        "Bun & SQLite",
        "TypeScript",
        "Tailwind CSS",
        "Architectures IA",
        "Expériences Vectorielles",
        "Audio Temps Réel",
        "PWA & Mobile",
      ],
    },
    sections: {
      platform: {
        eyebrow: "Plateforme & Déploiement",
        title: "Votre présence en ligne, instantanément déployée.",
        description:
          "Générez vos sites web avec SvelteKit & Bun, obtenez un nom de domaine ou sous-domaine ether.paris, et pilotez votre code en toute autonomie.",
        primaryCta: "Créer un site",
        secondaryCta: "En savoir plus",
        features: [
          "Nom de domaine",
          "Infrastructure Bun & SQLite",
          "Dépôt Git dédié",
          "Studio IA Ether",
        ],
      },
      manifesto: {
        eyebrow: "Manifeste",
        title: "Concevoir des outils et des mémoires digitales singulières.",
        description:
          "Ether allie rigueur technique et sensibilité artistique pour bâtir des interfaces vivantes, tactiles et performantes.",
        paragraphs: [
          "Nous rejetons les modèles préfabriqués et les coquilles vides. Chaque création naît d'une intention claire, d'un dialogue direct et d'un soin maniaque apporté aux moindres détails d'interaction.",
          "L’approche Retroui infuse les technologies web modernes de textures mémorielles : matières organiques, typographies expressives et micro-animations fluides. Des outils pensés pour durer, navigables avec plaisir.",
        ],
        bullets: [
          "Développement sans superflu : code lisible, ultra-rapide et respectueux des standards ouverts.",
          "Architecture moderne : runtime Bun, composants réactifs Svelte 5, zéro dette inutile.",
          "Créativité technique : interactions sur-mesure au service de l'identité de chaque projet.",
        ],
        offer: {
          title: "Cycle de réalisation",
          description:
            "Un processus direct et sans intermédiaire, de l'esquisse conceptuelle jusqu'à la mise en production.",
          phases: [
            { label: "Cadrage & Intentions", timeline: "Semaine 1" },
            { label: "Design & Prototype", timeline: "Semaines 2-3" },
            { label: "Développement & Lancement", timeline: "Semaines 4-6" },
          ],
        },
      },
      expertise: {
        eyebrow: "Expertise",
        title: "Nos trois domaines d’intervention.",
        description:
          "Une synergie entre ingénierie logicielle, recherche esthétique et technologies d'intelligence artificielle.",
        services: [
          {
            title: "Applications Web & Mobile",
            description:
              "Conception et développement d’applications complètes, rapides et réactives. Du prototype au produit déployé à l'échelle.",
            deliverables: [
              "Architecture produit & API",
              "Frontend SvelteKit & Runes",
              "PWA & optimisation mobile",
            ],
          },
          {
            title: "Expériences Interactives & Design",
            description:
              "Création d'univers visuels mémorables, d'animations vectorielles sur-mesure et d'interfaces tactiles qui se démarquent des standards génériques.",
            deliverables: [
              "Direction artistique digitale",
              "Animations SVG & shaders",
              "Micro-interactions fluides",
            ],
          },
          {
            title: "Systèmes Intelligents & Audio Temps Réel",
            description:
              "Intégration d'agents conversationnels, de tuteurs intelligents et de pipelines audio à faible latence propulsés par l'IA.",
            deliverables: [
              "Agents vocaux & LLM",
              "Synthèse & streaming audio",
              "Bases de données légères (SQLite)",
            ],
          },
        ],
      },
      cases: {
        eyebrow: "Projets",
        title: "Réalisations en production.",
        description:
          "Trois projets concrets conçus et développés par le studio, illustrant la diversité de nos savoir-faire.",
        caseStudies: [
          {
            title: "ami",
            sector: "Application IA & Tuteur Vocal",
            summary:
              "Tuteur vocal intelligent pour l'apprentissage du français parlé. Une application mobile-first (PWA) fluide et réactive couvrant plus de 440 domaines grammaticaux du niveau A0 à C1 avec synthèse vocale temps réel.",
            metrics: [
              "Synthèse & streaming vocal temps réel",
              "PWA mobile-first & offline ready",
              "440+ domaines grammaticaux (A0 à C1)",
            ],
            image: "https://img.ether.paris/ami/assets/logo.png?width=1000",
            url: "https://ami.ether.paris",
          },
          {
            title: "Rosée Minérale",
            sector: "E-commerce & Marque Artisanale",
            summary:
              "Boutique en ligne et univers de marque pour une maison de bijoux artisanaux en pierres naturelles. Interface poétique intégrant une navigation organique illustrée par des branches et feuilles en SVG interactif.",
            metrics: [
              "Navigation organique en SVG interactif",
              "Direction artistique & textures naturelles",
              "Expérience d'achat fluide et légère",
            ],
            image: "https://rosee-minerale.fr/logo.png",
            url: "https://rosee-minerale.fr",
          },
          {
            title: "Artist's Inner Realm",
            sector: "Art Numérique & Portfolio Interactif",
            summary:
              "Artefact numérique immersif conçu pour dévoiler l'univers ésotérique d'un artiste. Un mécanisme circulaire rotatif interactif où la manipulation des anneaux et sigils déverrouille les chambres d'œuvres, dessins et sculptures.",
            metrics: [
              "Mécanique rotative & physique interactive",
              "Filtres procéduraux & textures parchemin",
              "Exploration non-linéaire d'œuvres d'art",
            ],
            image: "/artists-inner-realm-jewellery.svg",
            url: "https://lechatperdu.ether.paris",
          },
        ],
      },
      approach: {
        eyebrow: "Approche",
        title: "Un accompagnement direct et rigoureux.",
        steps: [
          {
            title: "Compréhension & Vision",
            description:
              "Échange direct pour cerner l'essence du projet, ses contraintes et ses ambitions techniques.",
            phase: "01",
          },
          {
            title: "Prototypage & Conception",
            description:
              "Création rapide de maquettes interactives pour tester les flux, l'esthétique et les interactions avant le code final.",
            phase: "02",
          },
          {
            title: "Ingénierie & Déploiement",
            description:
              "Développement full-stack avec une stack ultra-rapide (Bun, SvelteKit), tests de robustesse et mise en production immédiate.",
            phase: "03",
          },
        ],
      },
      studio: {
        eyebrow: "Studio",
        title: "Ancrage parisien, rayonnement global.",
        description:
          "Un studio indépendant à taille humaine, réactif et flexible pour concevoir et déployer vos projets.",
        studios: [
          {
            city: "Paris",
            timezone: "UTC+1",
            focus:
              "Base du studio — Architecture logicielle, design d'interfaces et rencontres en présentiel.",
          },
          {
            city: "Global / Distanciel",
            timezone: "Any timezone",
            focus:
              "Collaboration asynchrone fluide, déploiement continu et disponibilité internationale.",
          },
        ],
        onsiteLabel: "Présentiel & Distanciel",
      },
      testimonials: {
        eyebrow: "Témoignages",
        title: "Retours d'expérience",
        description: "Ce que disent nos créateurs et partenaires accompagnés.",
        testimonials: SHOW_CLIENT_TESTIMONIALS
          ? [
              {
                quote:
                  "Ether nous a permis d'avoir une boutique en ligne d'une élégance rare et ultra-rapide, tout en nous laissant une autonomie totale sur nos collections, nos stocks et nos expéditions.",
                author: "Corine Barrett",
                role: "Fondatrice & Créatrice · Rosée Minérale",
              },
              {
                quote:
                  "L'univers ésotérique et immersif que nous voulions créer a pris vie avec une fluidité exceptionnelle. Ether Studio nous permet d'enrichir nos chambres d'œuvres et d'évoluer en toute liberté.",
                author: "Simon Nicole",
                role: "Artiste & Créateur · Le Chat Perdu",
              },
            ]
          : [],
      },
      contact: {
        eyebrow: "Contact",
        title: "Parlons de votre projet.",
        description:
          "Présentez-nous votre idée ou vos besoins. Réponse rapide sous 48h avec une première estimation.",
      },
    },
    contactForm: {
      nameLabel: "Nom complet",
      namePlaceholder: "Votre nom",
      emailLabel: "Email",
      emailPlaceholder: "contact@studio.com",
      companyLabel: "Organisation",
      companyPlaceholder: "Maison, studio, institution...",
      messageLabel: "Message",
      messagePlaceholder: "Parlez-nous de votre projet...",
      submitIdle: "Envoyer",
      submitPending: "Envoi en cours...",
      helper: "Réponse sous 48h · Sessions d'échange direct",
      success: "Merci ! Nous revenons vers vous sous 48h.",
      error: "Merci de vérifier les informations du formulaire.",
    },
    footer: {
      description:
        "Ether conçoit et développe des applications web sur-mesure, des expériences interactives et des systèmes intelligents.",
      exploreLabel: "Explorer",
      socialLabel: "Social",
      rights: "© {year} {name}. Tous droits réservés.",
      studiosLine:
        "Ether · Basé à Paris — Projets déployés dans le monde entier.",
    },
    languageSwitcher: {
      label: "Langue",
    },
  },
  en: {
    locale: "en",
    langLabel: "English",
    site: {
      name: "Ether",
      motto: "Everything Everywhere",
      description:
        "Ether designs and delivers bespoke digital experiences, combining software engineering, tactile design, and intelligent systems.",
      navigation: [
        { label: "Manifesto", href: "#manifesto" },
        { label: "Expertise", href: "#expertise" },
        { label: "Projects", href: "#cases" },
        { label: "Approach", href: "#approach" },
        { label: "Studio", href: "#studio" },
        { label: "Contact", href: "#contact" },
      ],
      socials: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/bassemsab/" },
        { label: "Instagram", href: "https://www.instagram.com/bassem.sab/" },
      ],
      collaborateCta: "Work with us",
      studioCta: "Studio",
      logoAlt: "Ether · Digital Studio",
    },
    header: {
      menuLabel: "Menu",
    },
    metadata: {
      title: "Ether · Everything Everywhere",
      description:
        "Software engineering and digital craft studio: web & mobile applications, interactive experiences, and AI systems.",
      keywords: [
        "Creative studio",
        "Software development",
        "SvelteKit",
        "Web applications",
        "UI design",
        "Artificial intelligence",
        "Interactive experiences",
        "Full-stack engineering",
      ],
    },
    hero: {
      eyebrow: "Everything Everywhere",
      heading:
        "Software engineering, UI craftsmanship, and bespoke digital experiences.",
      description:
        "From distinct UI design to real-time architectures and AI agents, Ether designs and ships refined, high-performance digital products.",
      primaryCta: { label: "Get in touch", href: "#contact" },
      secondaryCta: { label: "Explore projects", href: "#cases" },
      highlights: [
        {
          label: "Live production projects",
          value: "3",
          detail: "AI applications, e-commerce & interactive art",
        },
        {
          label: "Bespoke engineering",
          value: "100%",
          detail: "SvelteKit, Bun, TypeScript & modern stack",
        },
        {
          label: "Based in",
          value: "Paris",
          detail: "Independent studio, global collaboration",
        },
      ],
      imageAlt: "Ether · Creative and technological assemblage",
    },
    partnerMarquee: {
      partners: [
        "SvelteKit",
        "Bun & SQLite",
        "TypeScript",
        "Tailwind CSS",
        "AI Architectures",
        "Interactive Vector Graphics",
        "Real-Time Audio",
        "Mobile-First PWA",
      ],
    },
    sections: {
      platform: {
        eyebrow: "Platform & Deployment",
        title: "Your online presence, deployed in seconds.",
        description:
          "Spin up websites powered by SvelteKit & Bun, secure custom domains or ether.paris subdomains, and manage code with complete autonomy.",
        primaryCta: "Launch a site",
        secondaryCta: "Learn more",
        features: [
          "Custom Domain",
          "Bun & SQLite Infrastructure",
          "Dedicated Git Repository",
          "Ether AI Studio",
        ],
      },
      manifesto: {
        eyebrow: "Manifesto",
        title: "Crafting distinctive digital tools and living memories.",
        description:
          "Ether combines technical rigor and artistic sensitivity to build tactile, high-performance digital interfaces.",
        paragraphs: [
          "We reject generic templates and empty shells. Every project stems from clear intent, direct collaboration, and obsessive attention to interaction details.",
          "The Retroui philosophy infuses modern web technologies with mnemonic textures: organic materials, expressive typography, and fluid micro-animations. Built to endure and navigate with delight.",
        ],
        bullets: [
          "Focused engineering: clean, fast, open-standards compliant code.",
          "Modern architecture: Bun runtime, Svelte 5 reactive runes, zero unnecessary debt.",
          "Technical creativity: bespoke interactions serving each project's unique identity.",
        ],
        offer: {
          title: "Production Cycle",
          description:
            "A direct, focused process without intermediaries, from initial concept to live deployment.",
          phases: [
            { label: "Vision & Scope", timeline: "Week 1" },
            { label: "Design & Prototyping", timeline: "Weeks 2-3" },
            { label: "Engineering & Launch", timeline: "Weeks 4-6" },
          ],
        },
      },
      expertise: {
        eyebrow: "Expertise",
        title: "Three areas of mastery.",
        description:
          "A synergy between software engineering, visual aesthetics, and artificial intelligence technologies.",
        services: [
          {
            title: "Web & Mobile Applications",
            description:
              "Design and development of complete, fast, reactive applications. From prototype to production-grade deployment.",
            deliverables: [
              "Product architecture & APIs",
              "SvelteKit & Runes frontend",
              "PWA & mobile optimization",
            ],
          },
          {
            title: "Interactive Experiences & Design",
            description:
              "Memorable visual identities, custom vector animations, and tactile interfaces that stand out from generic conventions.",
            deliverables: [
              "Digital art direction",
              "SVG animations & shaders",
              "Fluid micro-interactions",
            ],
          },
          {
            title: "Intelligent Systems & Real-Time Audio",
            description:
              "Conversational agents, intelligent voice tutors, and low-latency audio pipelines powered by modern AI.",
            deliverables: [
              "Voice agents & LLMs",
              "Audio streaming & synthesis",
              "Lightweight data layers (SQLite)",
            ],
          },
        ],
      },
      cases: {
        eyebrow: "Projects",
        title: "Work in production.",
        description:
          "Three live projects conceived and developed by the studio, illustrating our range of craft.",
        caseStudies: [
          {
            title: "ami",
            sector: "AI Platform & Voice Tutor",
            summary:
              "Intelligent voice tutor for learning spoken French. A fluid, mobile-first PWA covering 440+ grammar domains from A0 to C1 with real-time voice synthesis.",
            metrics: [
              "Real-time voice streaming & synthesis",
              "Mobile-first PWA & offline ready",
              "440+ grammar domains (A0 to C1)",
            ],
            image: "https://img.ether.paris/ami/assets/logo.png?width=1000",
            url: "https://ami.ether.paris",
          },
          {
            title: "Rosée Minérale",
            sector: "E-Commerce & Artisanal Brand",
            summary:
              "Online boutique and brand world for a handcrafted gemstone jewelry maison. Poetic interface featuring organic interactive SVG branch & leaf navigation.",
            metrics: [
              "Organic interactive SVG branch navigation",
              "Artisanal aesthetic & natural textures",
              "Lightweight, responsive shopping experience",
            ],
            image: "https://rosee-minerale.fr/logo.png",
            url: "https://rosee-minerale.fr",
          },
          {
            title: "Artist's Inner Realm",
            sector: "Digital Art & Interactive Portfolio",
            summary:
              "Immersive digital artifact revealing an artist's esoteric universe. An interactive mechanical circular device where rotating rings and sigils unlock chambers of drawings and sculptures.",
            metrics: [
              "Rotational ring mechanics & physics",
              "Procedural filters & parchment textures",
              "Non-linear artistic chamber exploration",
            ],
            image: "/artists-inner-realm-jewellery.svg",
            url: "https://lechatperdu.ether.paris",
          },
        ],
      },
      approach: {
        eyebrow: "Approach",
        title: "A direct and disciplined journey.",
        steps: [
          {
            title: "Vision & Alignment",
            description:
              "Direct exchange to pinpoint project essence, technical requirements, and core ambitions.",
            phase: "01",
          },
          {
            title: "Prototyping & Design",
            description:
              "Rapid interactive prototypes to validate user flows, aesthetics, and feel before final code.",
            phase: "02",
          },
          {
            title: "Engineering & Launch",
            description:
              "Full-stack development with a high-performance stack (Bun, SvelteKit), testing, and immediate live deployment.",
            phase: "03",
          },
        ],
      },
      studio: {
        eyebrow: "Studio",
        title: "Rooted in Paris, collaborating globally.",
        description:
          "An independent, human-scale studio that is agile, responsive, and dedicated to your digital products.",
        studios: [
          {
            city: "Paris",
            timezone: "UTC+1",
            focus:
              "Studio headquarters — Software architecture, interface design, and in-person collaboration.",
          },
          {
            city: "Global / Remote",
            timezone: "Any timezone",
            focus:
              "Smooth asynchronous workflow, continuous deployment, and international availability.",
          },
        ],
        onsiteLabel: "On-site & Remote",
      },
      testimonials: {
        eyebrow: "Testimonials",
        title: "Client reflections",
        description: "Voices of creators and businesses powered by Ether.",
        testimonials: SHOW_CLIENT_TESTIMONIALS
          ? [
              {
                quote:
                  "Ether gave us an online boutique of rare elegance and blazing speed, while granting us full autonomy over our jewelry collections, inventory, and shipping logistics.",
                author: "Corine Barrett",
                role: "Founder & Artisan · Rosée Minérale",
              },
              {
                quote:
                  "The esoteric and interactive realm we envisioned came to life with exceptional fluidity. Ether Studio lets us continuously expand our artwork chambers with total creative freedom.",
                author: "Simon Nicole",
                role: "Artist & Creator · Le Chat Perdu",
              },
            ]
          : [],
      },
      contact: {
        eyebrow: "Contact",
        title: "Let's build your next product.",
        description:
          "Share your idea or requirements. We reply within 48 hours with an initial evaluation.",
      },
    },
    contactForm: {
      nameLabel: "Full name",
      namePlaceholder: "Your name",
      emailLabel: "Email",
      emailPlaceholder: "contact@studio.com",
      companyLabel: "Organisation",
      companyPlaceholder: "Company, studio, project...",
      messageLabel: "Message",
      messagePlaceholder: "Tell us about your project...",
      submitIdle: "Send",
      submitPending: "Sending...",
      helper: "Response within 48h · Direct collaboration",
      success: "Thank you! We'll get back to you within 48 hours.",
      error: "Please double-check the form information.",
    },
    footer: {
      description:
        "Ether designs and develops bespoke web applications, interactive experiences, and intelligent systems.",
      exploreLabel: "Explore",
      socialLabel: "Social",
      rights: "© {year} {name}. All rights reserved.",
      studiosLine: "Ether · Based in Paris — Deployed worldwide.",
    },
    languageSwitcher: {
      label: "Language",
    },
  },
  ar: {
    locale: "ar",
    langLabel: "العربية",
    site: {
      name: "إيثر",
      motto: "في كل مكان",
      description:
        "إيثر يصمم ويطور تجارب رقمية مخصصة، تجمع بين هندسة البرمجيات، التصميم التفاعلي، والأنظمة الذكية.",
      navigation: [
        { label: "البيان", href: "#manifesto" },
        { label: "الخبرات", href: "#expertise" },
        { label: "المشاريع", href: "#cases" },
        { label: "المنهجية", href: "#approach" },
        { label: "الاستوديو", href: "#studio" },
        { label: "تواصل", href: "#contact" },
      ],
      socials: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/bassemsab/" },
        { label: "Instagram", href: "https://www.instagram.com/bassem.sab/" },
      ],
      collaborateCta: "فلنبدأ التعاون",
      studioCta: "الاستوديو",
      logoAlt: "إيثر · استوديو رقمي",
    },
    header: {
      menuLabel: "القائمة",
    },
    metadata: {
      title: "إيثر · في كل مكان",
      description:
        "استوديو هندسة وتصميم رقمي: تطبيقات ويب وجوال، تجارب تفاعلية، وأنظمة ذكاء اصطناعي.",
      keywords: [
        "استوديو إبداعي",
        "تطوير برمجيات",
        "SvelteKit",
        "تطبيقات ويب",
        "تصميم واجهات",
        "ذكاء اصطناعي",
        "تجارب تفاعلية",
      ],
    },
    hero: {
      eyebrow: "في كل مكان",
      heading: "هندسة برمجية متقنة، تصميم واجهات، وتجارب رقمية مخصصة.",
      description:
        "من تصميم الواجهات الفريدة إلى نشر البنى التحتية الفورية وعملاء الذكاء الاصطناعي، يطوّر إيثر منتجات رقمية عالية الأداء والدقة.",
      primaryCta: { label: "ابدأ مشروعك", href: "#contact" },
      secondaryCta: { label: "استعرض المشاريع", href: "#cases" },
      highlights: [
        {
          label: "مشاريع قيد التشغيل",
          value: "3",
          detail: "تطبيقات ذكاء اصطناعي، تجارة وتجارب تفاعلية",
        },
        {
          label: "هندسة مخصصة",
          value: "100%",
          detail: "SvelteKit وBun وTypeScript وبنية حديثة",
        },
        {
          label: "المقر",
          value: "باريس",
          detail: "استوديو مستقل يتعاون عالمياً",
        },
      ],
      imageAlt: "إيثر · تركيب إبداعي وتقني",
    },
    partnerMarquee: {
      partners: [
        "SvelteKit",
        "Bun & SQLite",
        "TypeScript",
        "Tailwind CSS",
        "بنى الذكاء الاصطناعي",
        "رسوم متجهة تفاعلية",
        "صوتيات فورية",
        "تطبيقات الويب التقدمية",
      ],
    },
    sections: {
      platform: {
        eyebrow: "المنصة والنشر",
        title: "حضورك الرقمي، يُطلق في ثوانٍ معدودة.",
        description:
          "أنشئ مواقع الويب بتقنيات SvelteKit وBun، مع دومين مخصص أو نطاق فرعي من ether.paris واستوديو ذكاء اصطناعي مدمج.",
        primaryCta: "ابدأ موقعك",
        secondaryCta: "اعرف المزيد",
        features: [
          "نطاق مخصص",
          "بنية سحابية بـ Bun وSQLite",
          "مستودع Git مستقل",
          "استوديو الذكاء الاصطناعي Ether",
        ],
      },
      manifesto: {
        eyebrow: "البيان",
        title: "صناعة أدوات وذكريات رقمية متفردة.",
        description:
          "يجمع إيثر بين الانضباط التقني والحس الفني لبناء واجهات حية، ملموسة، وفائقة السرعة.",
        paragraphs: [
          "نبتعد تماماً عن القوالب الجاهزة والحلول المكررة. كل مشروع ينطلق من هدف واضح وحوار مباشر وعناية فائقة بأدق تفاصيل التفاعل.",
          "تدمج منهجية Retroui أحدث تقنيات الويب بملمس بصري دافئ: عناصر عضوية، خطوط معبرة، وحركات تفاعلية سلسة. أدوات مصممة لتدوم وتُستخدم بكل سلاسة.",
        ],
        bullets: [
          "تطوير نقي: كود نظيف وسريع وفق المعايير المفتوحة.",
          "بنية حديثة: بيئة تشغيل Bun ومكونات Svelte 5 تفاعلية بدون تعقيد زائد.",
          "إبداع تقني: تفاعلات مصممة خصيصاً لهوية كل مشروع.",
        ],
        offer: {
          title: "دورة العمل",
          description:
            "مسار عمل مباشر وبدون وسطاء، من الفكرة والتخطيط حتى الإطلاق الفعلي.",
          phases: [
            { label: "الرؤية والنطاق", timeline: "الأسبوع 1" },
            { label: "التصميم والنمذجة", timeline: "الأسابيع 2-3" },
            { label: "الهندسة والإطلاق", timeline: "الأسابيع 4-6" },
          ],
        },
      },
      expertise: {
        eyebrow: "الخبرات",
        title: "ثلاثة مجالات رئيسية.",
        description:
          "تكامل وثيق بين هندسة البرمجيات، الابتكار البصري، وتقنيات الذكاء الاصطناعي.",
        services: [
          {
            title: "تطبيقات الويب والجوال",
            description:
              "تصميم وتطوير تطبيقات متكاملة، سريعة ومستجيبة من النماذج الأولية إلى المنتجات الإنتاجية.",
            deliverables: [
              "معمارية المنتجات والـ APIs",
              "واجهات SvelteKit وRunes",
              "تطبيقات الويب التقدمية (PWA)",
            ],
          },
          {
            title: "التجارب التفاعلية والتصميم",
            description:
              "ابتكار هويات بصرية مميزة ورسوم متجهة تفاعلية وواجهات فريدة تبتعد عن التصاميم التقليدية.",
            deliverables: [
              "إخراج فني رقمي",
              "رسوم SVG متحركة",
              "تفاعلات دقيقة وانسيابية",
            ],
          },
          {
            title: "الأنظمة الذكية والصوت الفوري",
            description:
              "دمج وكلاء الذكاء الاصطناعي والمساعدين الصوتيين ومعالجة الصوت الفوري بزمن استجابة منخفض.",
            deliverables: [
              "عملاء صوتيون ونماذج لغوية",
              "توليد وبث صوتي فوري",
              "قواعد بيانات مدمجة وخفيفة (SQLite)",
            ],
          },
        ],
      },
      cases: {
        eyebrow: "المشاريع",
        title: "أعمال حية في الإنتاج.",
        description:
          "ثلاثة مشاريع حقيقية صممها وطورها الاستوديو تعكس تنوع خبراتنا ودقتها.",
        caseStudies: [
          {
            title: "ami",
            sector: "منصة ذكاء اصطناعي ومعلم صوتي",
            summary:
              "معلّم صوتي ذكي لإتقان المحادثة بالفرنسية. تطبيق ويب وجوال فوري وسلس يغطي أكثر من 440 قاعدة ومستوى لغوي مع تفاعل صوتي حي فائق السرعة.",
            metrics: [
              "توليد وبث صوتي تفاعلي فوري",
              "تطبيق ويب تقدمي (PWA) يعمل بدون اتصال",
              "أكثر من 440 محوراً لغوياً (A0 إلى C1)",
            ],
            image: "https://img.ether.paris/ami/assets/logo.png?width=1000",
            url: "https://ami.ether.paris",
          },
          {
            title: "Rosée Minérale",
            sector: "متجر إلكتروني وعلامة مجوهرات",
            summary:
              "متجر إلكتروني وعالم بصري متكامل لدار مجوهرات من الأحجار الطبيعية، يتميز بواجهة نباتية ناعمة وتنقل تفاعلي مستوحى من فروع النباتات بتقنيات SVG.",
            metrics: [
              "تنقل تفاعلي عضوي بأوراق وفروع SVG",
              "هوية فنية بملمس وألوان طبيعية",
              "تجربة تسوق خفيفة وسريعة التجاوب",
            ],
            image: "https://rosee-minerale.fr/logo.png",
            url: "https://rosee-minerale.fr",
          },
          {
            title: "Artist's Inner Realm",
            sector: "فن رقمي ومعرض تفاعلي",
            summary:
              "تحفة رقمية تفاعلية تستعرض العالم الفني المبتكر لفنان تشكيلي. جهاز دائري ميكانيكي يدور ليكشف عن غرف اللوحات والمنحوتات والمجوهرات.",
            metrics: [
              "ميكانيكا دوران وفيزياء تفاعلية",
              "مرشحات رقمية بملمس الورق القديم",
              "استكشاف فني غير خطي للمعارض",
            ],
            image: "/artists-inner-realm-jewellery.svg",
            url: "https://lechatperdu.ether.paris",
          },
        ],
      },
      approach: {
        eyebrow: "المنهجية",
        title: "مسار عمل مباشر ومنضبط.",
        steps: [
          {
            title: "الرؤية والاتفاق",
            description:
              "حوار مباشر لتحديد جوهر المشروع والمتطلبات التقنية والأهداف المنشودة.",
            phase: "01",
          },
          {
            title: "النمذجة والتصميم",
            description:
              "بناء نماذج أولية تفاعلية سريعة لاختبار تجربة الاستخدام والشكل قبل الكود النهائي.",
            phase: "02",
          },
          {
            title: "الهندسة والإطلاق",
            description:
              "تطوير شامل بأحدث التقنيات السريعة (Bun وSvelteKit) واختبارات الجودة والإطلاق المباشر.",
            phase: "03",
          },
        ],
      },
      studio: {
        eyebrow: "الاستوديو",
        title: "انطلاق من باريس، وحضور عالمي.",
        description:
          "استوديو مستقل يتسم بالمرونة والسرعة لتنفيذ وتطوير مشاريعك الرقمية.",
        studios: [
          {
            city: "باريس",
            timezone: "UTC+1",
            focus:
              "مقر الاستوديو — معمارية البرمجيات، تصميم الواجهات والاجتماعات المباشرة.",
          },
          {
            city: "عالمي / عن بُعد",
            timezone: "أي منطقة زمنية",
            focus: "تعاون سلس عن بعد، نشر مستمر وجاهزية للعمل مع مختلف الدول.",
          },
        ],
        onsiteLabel: "حضوري وعن بُعد",
      },
      testimonials: {
        eyebrow: "شهادات",
        title: "آراء العملاء",
        description: "تجارب المبدعين والشركات المدعومة من Ether.",
        testimonials: SHOW_CLIENT_TESTIMONIALS
          ? [
              {
                quote:
                  "مكّنتنا Ether من إطلاق متجر إلكتروني فائق السرعة والأناقة، مع منحنا استقلالية كاملة في إدارة مجموعاتنا ومخزوننا وعمليات الشحن.",
                author: "Corine Barrett",
                role: "مؤسسة ومصممة · Rosée Minérale",
              },
              {
                quote:
                  "العالم الفني التفاعلي الذي أردنا ابتكاره تجسّد بسلاسة استثنائية. تتيح لنا Ether Studio توسيع معارضنا الرقمية وتطوير موقعنا بكل حرية.",
                author: "Simon Nicole",
                role: "فنان ومبدع · Le Chat Perdu",
              },
            ]
          : [],
      },
      contact: {
        eyebrow: "تواصل",
        title: "فلنبدأ بناء مشروعك القادم.",
        description:
          "شاركنا فكرتك أو متطلباتك، وسنوافيك بالرد خلال 48 ساعة مع تقييم أولي.",
      },
    },
    contactForm: {
      nameLabel: "الاسم الكامل",
      namePlaceholder: "اسمك",
      emailLabel: "البريد الإلكتروني",
      emailPlaceholder: "contact@studio.com",
      companyLabel: "الجهة أو المؤسسة",
      companyPlaceholder: "شركة، استوديو، مشروع...",
      messageLabel: "الرسالة",
      messagePlaceholder: "حدثنا عن مشروعك...",
      submitIdle: "إرسال",
      submitPending: "جاري الإرسال...",
      helper: "رد خلال 48 ساعة · تواصل مباشر",
      success: "شكراً لك! سنعاود التواصل خلال 48 ساعة.",
      error: "يرجى التحقق من صحة بيانات النموذج.",
    },
    footer: {
      description:
        "إيثر يصمم ويطور تطبيقات ويب مخصصة، تجارب تفاعلية، وأنظمة ذكاء اصطناعي.",
      exploreLabel: "استكشاف",
      socialLabel: "منصات",
      rights: "© {year} {name}. جميع الحقوق محفوظة.",
      studiosLine: "إيثر · مقرنا باريس — مشاريع منشورة حول العالم.",
    },
    languageSwitcher: {
      label: "اللغة",
    },
  },
};

export type {
  HomeDictionary,
  NavigationItem,
  Highlight,
  Service,
  CaseStudy,
  ApproachStep,
  Testimonial,
  StudioLocation,
  ContactFormCopy,
};

export const getDictionary = (locale: Locale): HomeDictionary =>
  dictionaries[locale] ?? dictionaries.fr;
