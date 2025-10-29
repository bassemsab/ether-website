import type { Locale } from "./config";

type NavigationItem = {
  label: string;
  href: string;
};

type Highlight = {
  label: string;
  value: string;
  detail: string;
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
    rights: (year: number, name: string) => string;
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
        "Ether assemble des expériences numériques sur mesure en mêlant design, ingénierie logicielle et production musicale.",
      navigation: [
        { label: "Manifeste", href: "#manifesto" },
        { label: "Expertise", href: "#expertise" },
        { label: "Études de cas", href: "#cases" },
        { label: "Approche", href: "#approach" },
        { label: "Studios", href: "#studio" },
        { label: "Contact", href: "#contact" },
      ],
      socials: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/bassemsab/" },
        { label: "Instagram", href: "https://www.instagram.com/bassem.sab/" },
      ],
      collaborateCta: "Collaborer",
      logoAlt: "Assemblage créatif par Ether",
    },
    header: {
      menuLabel: "Menu",
    },
    metadata: {
      title: "Ether · Tout Partout",
      description:
        "Studio multidisciplinaire : logiciels sur mesure, label & production musicale, conseil en affaires.",
      keywords: [
        "Studio créatif",
        "Développement logiciel",
        "Production musicale",
        "Conseil stratégique",
        "DJ mixage",
        "Maintenance applicative",
      ],
    },
    hero: {
      eyebrow: "Tout Partout",
      heading:
        "Solutions numériques, label et conseil pour des organisations qui résonnent globalement.",
      description:
        "Nous concevons des logiciels fiables, produisons de la musique originale et accompagnons les équipes dans leurs décisions clés.",
      primaryCta: { label: "Entrer en contact", href: "#contact" },
      secondaryCta: { label: "Voir les cas", href: "#cases" },
      highlights: [
        {
          label: "Solutions logicielles livrées",
          value: "38",
          detail: "Produits internes & plateformes clients",
        },
        {
          label: "Projets musicaux accompagnés",
          value: "22",
          detail: "DJ mixage & production à Kuala Lumpur et Paris",
        },
        {
          label: "Mandats de conseil",
          value: "45",
          detail: "Stratégie, opérations et gouvernance",
        },
      ],
      imageAlt: "Assemblage créatif par Ether",
    },
    partnerMarquee: {
      partners: [
        "Artefact",
        "Canopée",
        "Éclat",
        "Fluxus",
        "Matin Bleu",
        "Nuage Studio",
        "Orphée",
        "Parallèle",
      ],
    },
    sections: {
      manifesto: {
        eyebrow: "Manifeste",
        title:
          "Designer des souvenirs digitaux pour les cultures qui se transforment.",
        description:
          "Ether accompagne les maisons, institutions et médias avec des expériences tactiles et mesurables.",
        paragraphs: [
          "Ether est un studio polymorphe. Nous voyageons pour rencontrer les équipes, capter les textures des lieux, et traduire ces vibrations en expériences numériques tactiles.",
          "L’approche Retroui reconnecte avec les codes analogiques : transitions granuleuses, typographies mémorielles, couleurs patinées. Chaque projet devient une pièce curatoriale prête à vivre sur écran, papier ou scène.",
        ],
        bullets: [
          "Expériences multilingues pour toucher des audiences globales.",
          "Méthodologie accessible par design, audité AA+ avec partenaires spécialisés.",
          "Production agile : sprints hebdomadaires, rituels dédiés aux parties prenantes.",
        ],
        offer: {
          title: "Offre signature",
          description:
            "Un programme de 10 semaines qui combine audit culturel, prototypage vivant et orchestration du lancement, calibré pour les créateurs ambitieux.",
          phases: [
            { label: "Phase Exploration", timeline: "Semaines 1-3" },
            { label: "Phase Design", timeline: "Semaines 4-7" },
            { label: "Phase Activation", timeline: "Semaines 8-10" },
          ],
        },
      },
      expertise: {
        eyebrow: "Expertise",
        title: "Nos trois piliers d’intervention.",
        description:
          "Développement logiciel, production musicale et conseil se croisent pour créer des expériences cohérentes.",
        services: [
          {
            title: "Logiciels & Outils Informatiques",
            description:
              "Conception, développement, exploitation et maintenance d’applications métier ou grand public, sécurisées et scalables.",
            deliverables: [
              "Architecture & roadmap produit",
              "Développement full stack",
              "Maintenance & support 24/7",
            ],
          },
          {
            title: "Label & Production Musicale",
            description:
              "Production, enregistrement studio, distribution et gestion des droits d’auteur, avec expérience DJ mixage live à Kuala Lumpur et Paris.",
            deliverables: [
              "Production & enregistrement",
              "Distribution & publishing",
              "Gestion catalogue & droits",
            ],
          },
          {
            title: "Conseil en Affaires & Gestion",
            description:
              "Assistance stratégique et opérationnelle pour piloter croissance, transformation et gouvernance des organisations.",
            deliverables: [
              "Audits & due diligence",
              "Structuration opérationnelle",
              "Coaching des équipes dirigeantes",
            ],
          },
        ],
      },
      cases: {
        eyebrow: "Études de cas",
        title: "Des accompagnements orchestrés avec soin.",
        description:
          "Chaque mandat est conçu comme un cycle complet : analyse, création et opérations mesurables.",
        caseStudies: [
          {
            title: "Plateforme Atlas",
            sector: "Logiciels sur mesure",
            summary:
              "Suite SaaS temps réel pour orchestrer des opérations terrain, avec SLA 99,9 % et mises à jour continues.",
            metrics: [
              "Onboarding en 8 semaines",
              "Interopérabilité multi-API",
              "Monitoring & support 24/7",
            ],
            image:
              "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1600&q=80",
          },
          {
            title: "Label Sonar Lines",
            sector: "Production musicale",
            summary:
              "EP produit entre Kuala Lumpur et Paris, avec direction artistique, mixage et distribution internationale.",
            metrics: [
              "3M streams cumulés",
              "Vinyles pressés en série limitée",
              "Gestion complète des droits",
            ],
            image:
              "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1600&q=80",
          },
          {
            title: "Programme Horizon",
            sector: "Conseil stratégique",
            summary:
              "Plan de transformation pour un collectif créatif : structuration financière, gouvernance et KPI de croissance.",
            metrics: [
              "Roadmap 18 mois",
              "Cadre de gouvernance déployé",
              "Croissance +34% YoY",
            ],
            image:
              "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80",
          },
        ],
      },
      approach: {
        eyebrow: "Approche",
        title: "Un parcours en trois temps, incarné et mesurable.",
        steps: [
          {
            title: "Cartographie sensible",
            description:
              "Immersion terrain, interviews, diagnostics techniques et analyse des usages existants.",
            phase: "01",
          },
          {
            title: "Prototypage vivant",
            description:
              "Cérémonies de co-création, prototypes interactifs, itérations hebdomadaires et tests qualitatifs ciblés.",
            phase: "02",
          },
          {
            title: "Diffusion orchestrée",
            description:
              "Lancement hybride, stratégies éditoriales, instrumentation analytics et formation des équipes.",
            phase: "03",
          },
        ],
      },
      studio: {
        eyebrow: "Studios",
        title: "Collectif international, ancré localement.",
        description:
          "Des bases multiples pour rester proches des scènes technologiques, culturelles et entrepreneuriales.",
        studios: [
          {
            city: "Toronto",
            timezone: "UTC-5",
            focus:
              "Pilotage de projets logiciels et support produit pour l’Amérique du Nord",
          },
          {
            city: "Paris",
            timezone: "UTC+1",
            focus:
              "Direction artistique du label et DJ mixage live sur les scènes parisiennes",
          },
          {
            city: "Damas",
            timezone: "UTC+3",
            focus:
              "Conseil en stratégie et structuration des organisations culturelles",
          },
          {
            city: "Kuala Lumpur",
            timezone: "UTC+8",
            focus:
              "DJ mixage et production studio pour la scène d’Asie du Sud-Est",
          },
          {
            city: "Sharjah",
            timezone: "UTC+4",
            focus:
              "Gestion des catalogues et opérations de distribution musicale au Moyen-Orient",
          },
          {
            city: "Riyad",
            timezone: "UTC+3",
            focus:
              "Accompagnement en gouvernance et intégration digitale pour les entreprises régionales",
          },
          {
            city: "Melbourne",
            timezone: "UTC+10",
            focus:
              "Support technique et maintenance 24/7 pour nos plateformes logicielles",
          },
        ],
        onsiteLabel: "Sessions immersives sur place",
      },
      testimonials: {
        eyebrow: "Témoignages",
        title: "Feedbacks d’alliés",
        description: "Contactez-nous pour en savoir plus.",
        testimonials: [],
      },
      contact: {
        eyebrow: "Contact",
        title: "Imaginons votre prochain chapitre.",
        description:
          "Présentez-nous votre projet, nous vous répondons sous 48h avec un premier plan d’action.",
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
      helper: "Réponse sous 48h · Sessions immersives possibles",
      success: "Merci ! Nous revenons vers vous sous 48h.",
      error: "Merci de vérifier les informations du formulaire.",
    },
    footer: {
      description:
        "Nous façonnons des expériences digitales sensibles pour les créateurs et institutions culturelles.",
      exploreLabel: "Explorer",
      socialLabel: "Social",
      rights: (year, name) => `© ${year} ${name}. Tous droits réservés.`,
      studiosLine:
        "Studios à Toronto · Paris · Damas · Kuala Lumpur · Sharjah · Riyad · Melbourne",
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
        "Ether crafts bespoke digital systems, music releases, and strategic guidance for forward organisations.",
      navigation: [
        { label: "Manifesto", href: "#manifesto" },
        { label: "Expertise", href: "#expertise" },
        { label: "Case Studies", href: "#cases" },
        { label: "Approach", href: "#approach" },
        { label: "Studios", href: "#studio" },
        { label: "Contact", href: "#contact" },
      ],
      socials: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/bassemsab/" },
        { label: "Instagram", href: "https://www.instagram.com/bassem.sab/" },
      ],
      collaborateCta: "Work with us",
      logoAlt: "Creative assemblage by Ether",
    },
    header: {
      menuLabel: "Menu",
    },
    metadata: {
      title: "Ether · Everything Everywhere",
      description:
        "Multidisciplinary studio delivering custom software, music production, and business advisory.",
      keywords: [
        "Creative studio",
        "Software development",
        "Music production",
        "Business consulting",
        "DJ mixing",
        "Application maintenance",
      ],
    },
    hero: {
      eyebrow: "Everything Everywhere",
      heading:
        "Digital systems, music releases, and advisory for organisations that resonate globally.",
      description:
        "We build reliable software, produce original music, and support teams through decisive moments.",
      primaryCta: { label: "Start a project", href: "#contact" },
      secondaryCta: { label: "View case studies", href: "#cases" },
      highlights: [
        {
          label: "Delivered software solutions",
          value: "38",
          detail: "Internal tools & customer platforms",
        },
        {
          label: "Music projects produced",
          value: "22",
          detail: "DJ mixing & production in Kuala Lumpur and Paris",
        },
        {
          label: "Advisory engagements",
          value: "45",
          detail: "Strategy, operations, governance",
        },
      ],
      imageAlt: "Creative assemblage by Ether",
    },
    partnerMarquee: {
      partners: [
        "Artefact",
        "Canopée",
        "Éclat",
        "Fluxus",
        "Matin Bleu",
        "Nuage Studio",
        "Orphée",
        "Parallèle",
      ],
    },
    sections: {
      manifesto: {
        eyebrow: "Manifesto",
        title: "Designing digital memories for cultures in motion.",
        description:
          "Ether partners with maisons, institutions, and media to deliver tactile and measurable experiences.",
        paragraphs: [
          "Ether is a polymorphic studio. We travel to meet teams, absorb the textures of each place, and translate those vibrations into tactile digital experiences.",
          "Our Retroui approach reconnects with analog codes—grainy transitions, mnemonic typography, patinated colours. Every project becomes a curatorial piece ready for screen, print, or stage.",
        ],
        bullets: [
          "Multilingual experiences to reach global audiences.",
          "Accessibility by design, audited to AA+ with specialised partners.",
          "Agile production: weekly sprints and rituals dedicated to stakeholders.",
        ],
        offer: {
          title: "Signature engagement",
          description:
            "A 10-week programme blending cultural audit, live prototyping, and launch orchestration calibrated for ambitious creators.",
          phases: [
            { label: "Exploration phase", timeline: "Weeks 1-3" },
            { label: "Design phase", timeline: "Weeks 4-7" },
            { label: "Activation phase", timeline: "Weeks 8-10" },
          ],
        },
      },
      expertise: {
        eyebrow: "Expertise",
        title: "Three pillars, one integrated team.",
        description:
          "Software engineering, music production, and business advisory combine to deliver coherent experiences.",
        services: [
          {
            title: "Software & Tooling",
            description:
              "Design, development, operations, and maintenance of secure, scalable business and consumer applications.",
            deliverables: [
              "Product architecture & roadmap",
              "Full-stack development",
              "24/7 maintenance & support",
            ],
          },
          {
            title: "Label & Music Production",
            description:
              "Studio recording, distribution, and rights management, with DJ mixing experience across Kuala Lumpur and Paris.",
            deliverables: [
              "Production & recording",
              "Distribution & publishing",
              "Catalogue & rights management",
            ],
          },
          {
            title: "Business Advisory",
            description:
              "Strategic and operational support to steer growth, transformation, and governance initiatives.",
            deliverables: [
              "Audits & due diligence",
              "Operational structuring",
              "Executive coaching",
            ],
          },
        ],
      },
      cases: {
        eyebrow: "Case Studies",
        title: "Thoughtfully orchestrated engagements.",
        description:
          "Each mandate unfolds as a complete cycle: insight, creation, and measurable operations.",
        caseStudies: [
          {
            title: "Atlas Platform",
            sector: "Custom software",
            summary:
              "Real-time SaaS suite coordinating field operations with 99.9% SLA and continuous releases.",
            metrics: [
              "Onboarded in 8 weeks",
              "Multi-API interoperability",
              "24/7 monitoring & support",
            ],
            image:
              "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1600&q=80",
          },
          {
            title: "Sonar Lines Label",
            sector: "Music production",
            summary:
              "EP produced between Kuala Lumpur and Paris with art direction, mixing, and global distribution.",
            metrics: [
              "3M cumulative streams",
              "Limited-edition vinyl pressing",
              "End-to-end rights management",
            ],
            image:
              "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1600&q=80",
          },
          {
            title: "Horizon Programme",
            sector: "Strategic advisory",
            summary:
              "Transformation plan for a creative collective covering finances, governance, and growth KPIs.",
            metrics: [
              "18-month roadmap",
              "Governance framework deployed",
              "+34% YoY growth",
            ],
            image:
              "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80",
          },
        ],
      },
      approach: {
        eyebrow: "Approach",
        title: "Three movements, measurable outcomes.",
        steps: [
          {
            title: "Sensitive mapping",
            description:
              "Field immersion, interviews, technical diagnostics, and usage analysis.",
            phase: "01",
          },
          {
            title: "Living prototypes",
            description:
              "Co-creation rituals, interactive prototypes, weekly iterations, and qualitative testing.",
            phase: "02",
          },
          {
            title: "Orchestrated diffusion",
            description:
              "Hybrid launch, editorial storytelling, analytics instrumentation, and team enablement.",
            phase: "03",
          },
        ],
      },
      studio: {
        eyebrow: "Studios",
        title: "Global collective, local anchors.",
        description:
          "Multiple bases keep us close to technological, cultural, and business scenes.",
        studios: [
          {
            city: "Toronto",
            timezone: "UTC-5",
            focus:
              "Software project stewardship and product support for North America",
          },
          {
            city: "Paris",
            timezone: "UTC+1",
            focus:
              "Label art direction and live DJ mixing across Parisian venues",
          },
          {
            city: "Damascus",
            timezone: "UTC+3",
            focus:
              "Strategic advisory and organisational structuring for cultural actors",
          },
          {
            city: "Kuala Lumpur",
            timezone: "UTC+8",
            focus:
              "DJ mixing and studio production for the South-East Asian scene",
          },
          {
            city: "Sharjah",
            timezone: "UTC+4",
            focus:
              "Catalogue management and music distribution operations across the Middle East",
          },
          {
            city: "Riyadh",
            timezone: "UTC+3",
            focus:
              "Governance and digital integration advisory for regional enterprises",
          },
          {
            city: "Melbourne",
            timezone: "UTC+10",
            focus:
              "Technical support and 24/7 maintenance for our software platforms",
          },
        ],
        onsiteLabel: "On-site immersive sessions",
      },
      testimonials: {
        eyebrow: "Testimonials",
        title: "Allies in resonance",
        description: "Ask us to know more.",
        testimonials: [],
      },
      contact: {
        eyebrow: "Contact",
        title: "Imagine your next chapter.",
        description:
          "Tell us about your project — we reply within 48 hours with an initial action plan.",
      },
    },
    contactForm: {
      nameLabel: "Full name",
      namePlaceholder: "Your name",
      emailLabel: "Email",
      emailPlaceholder: "contact@studio.com",
      companyLabel: "Organisation",
      companyPlaceholder: "House, studio, institution...",
      messageLabel: "Message",
      messagePlaceholder: "Tell us about your project...",
      submitIdle: "Send",
      submitPending: "Sending...",
      helper: "Response within 48h · Immersive sessions available",
      success: "Thanks! We’ll get back to you within 48 hours.",
      error: "Please double-check the form information.",
    },
    footer: {
      description:
        "We craft sensitive digital experiences for cultural innovators and ambitious organisations.",
      exploreLabel: "Explore",
      socialLabel: "Social",
      rights: (year, name) => `© ${year} ${name}. All rights reserved.`,
      studiosLine:
        "Studios in Toronto · Paris · Damascus · Kuala Lumpur · Sharjah · Riyadh · Melbourne",
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
        "إيثر يطوّر حلولاً برمجية مخصّصة، وينتج أعمالاً موسيقية، ويقدّم الاستشارات للأعمال الطموحة.",
      navigation: [
        { label: "البيان", href: "#manifesto" },
        { label: "الخبرات", href: "#expertise" },
        { label: "دراسات الحالة", href: "#cases" },
        { label: "المنهجية", href: "#approach" },
        { label: "الاستوديوهات", href: "#studio" },
        { label: "تواصل", href: "#contact" },
      ],
      socials: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/bassemsab/" },
        { label: "Instagram", href: "https://www.instagram.com/bassem.sab/" },
      ],
      collaborateCta: "فلنبدأ التعاون",
      logoAlt: "تركيب إبداعي من إيثر",
    },
    header: {
      menuLabel: "القائمة",
    },
    metadata: {
      title: "إيثر · في كل مكان",
      description:
        "استوديو متعدد التخصصات يقدّم تطوير البرمجيات، إنتاج الموسيقى، والاستشارات الإدارية.",
      keywords: [
        "استوديو إبداعي",
        "تطوير برمجيات",
        "إنتاج موسيقي",
        "استشارات أعمال",
        "دي جي",
        "صيانة التطبيقات",
      ],
    },
    hero: {
      eyebrow: "في كل مكان",
      heading:
        "أنظمة رقمية، إنتاجات موسيقية، واستشارات للأعمال التي ترغب في التأثير عالمياً.",
      description:
        "نبني برامج موثوقة، ننتج موسيقى أصلية، وندعم الفرق خلال اللحظات الحاسمة.",
      primaryCta: { label: "ابدأ مشروعك", href: "#contact" },
      secondaryCta: { label: "اطّلع على الأعمال", href: "#cases" },
      highlights: [
        {
          label: "حلول برمجية منجزة",
          value: "38",
          detail: "منصات داخلية وخدمات للعملاء",
        },
        {
          label: "مشاريع موسيقية",
          value: "22",
          detail: "خبرة دي جي في كوالالمبور وباريس",
        },
        {
          label: "مهام استشارية",
          value: "45",
          detail: "استراتيجية وتشغيل وحوكمة",
        },
      ],
      imageAlt: "تركيب إبداعي من إيثر",
    },
    partnerMarquee: {
      partners: [
        "Artefact",
        "Canopée",
        "Éclat",
        "Fluxus",
        "Matin Bleu",
        "Nuage Studio",
        "Orphée",
        "Parallèle",
      ],
    },
    sections: {
      manifesto: {
        eyebrow: "البيان",
        title: "نصمّم ذكريات رقمية لثقافات تتغيّر باستمرار.",
        description:
          "ترافق إيثر الدور الثقافية والمؤسسات والإعلام بتجارب حسّية قابلة للقياس.",
        paragraphs: [
          "إيثر استوديو متعدد الأشكال. نسافر للقاء الفرق، ونستكشف تفاصيل الأماكن، ثم نحول هذه الذبذبات إلى تجارب رقمية ملموسة.",
          "منهجية Retroui تعيد وصل العالم الرقمي بالرموز التناظرية: انتقالات حبيبية، خطوط تستدعي الذاكرة، وألوان دافئة. كل مشروع يصبح قطعة تنظيمية جاهزة للعرض على الشاشة أو الورق أو المسرح.",
        ],
        bullets: [
          "تجارب متعددة اللغات للوصول إلى جمهور عالمي.",
          "منهجية تركّز على سهولة الوصول، مع تدقيق بمعيار AA+.",
          "إنتاج مرن: سباقات أسبوعية وطقوس مخصصة لأصحاب المصلحة.",
        ],
        offer: {
          title: "عرضنا المميز",
          description:
            "برنامج يمتد لعشرة أسابيع يجمع بين التدقيق الثقافي، النمذجة الحيّة، وتنظيم الإطلاق، مصمم للمبدعين الطموحين.",
          phases: [
            { label: "مرحلة الاستكشاف", timeline: "الأسابيع 1-3" },
            { label: "مرحلة التصميم", timeline: "الأسابيع 4-7" },
            { label: "مرحلة التفعيل", timeline: "الأسابيع 8-10" },
          ],
        },
      },
      expertise: {
        eyebrow: "الخبرات",
        title: "ثلاث ركائز بتكامل واحد.",
        description:
          "الهندسة البرمجية، الإنتاج الموسيقي، والاستشارات تتكامل لتقديم تجارب متناسقة.",
        services: [
          {
            title: "البرمجيات والأدوات",
            description:
              "تصميم وتطوير وتشغيل وصيانة التطبيقات المؤسسية والاستهلاكية الآمنة والقابلة للتوسع.",
            deliverables: [
              "هندسة المنتج وخارطة الطريق",
              "تطوير متكامل",
              "دعم وصيانة على مدار الساعة",
            ],
          },
          {
            title: "العلامة والإنتاج الموسيقي",
            description:
              "إنتاج وتسجيل وتوزيع الموسيقى وإدارة حقوق المؤلف، مع خبرة دي جي في كوالالمبور وباريس.",
            deliverables: [
              "إنتاج وتسجيل",
              "توزيع ونشر",
              "إدارة الكتالوج والحقوق",
            ],
          },
          {
            title: "الاستشارات الإدارية",
            description:
              "دعم استراتيجي وعملي لقيادة النمو والتحول والحوكمة للمؤسسات.",
            deliverables: [
              "تدقيق ودراسات جدوى",
              "هيكلة العمليات",
              "تمكين القيادات",
            ],
          },
        ],
      },
      cases: {
        eyebrow: "دراسات الحالة",
        title: "مرافقة مُحكمة التنفيذ.",
        description:
          "كل مهمة تمر بدورة كاملة: تحليل، إنشاء، وتشغيل قابل للقياس.",
        caseStudies: [
          {
            title: "منصة أطلس",
            sector: "برمجيات مخصّصة",
            summary:
              "منظومة SaaS فورية لإدارة العمليات الميدانية مع توافر 99.9% وتحديثات مستمرة.",
            metrics: [
              "إطلاق خلال 8 أسابيع",
              "تكامل متعدد الواجهات",
              "مراقبة ودعم على مدار الساعة",
            ],
            image:
              "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1600&q=80",
          },
          {
            title: "علامة سونار لاينز",
            sector: "إنتاج موسيقي",
            summary:
              "ألبوم قصير أُنتج بين كوالالمبور وباريس مع إخراج فني ومكساج وتوزيع عالمي.",
            metrics: [
              "3 ملايين استماع",
              "طباعة أسطوانات محدودة",
              "إدارة كاملة للحقوق",
            ],
            image:
              "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1600&q=80",
          },
          {
            title: "برنامج هورايزن",
            sector: "استشارات استراتيجية",
            summary:
              "خطة تحول لمجموعة إبداعية تشمل الهيكلة المالية، الحوكمة، ومؤشرات النمو.",
            metrics: [
              "خارطة طريق 18 شهراً",
              "إطلاق إطار حوكمة",
              "نمو سنوي 34%",
            ],
            image:
              "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80",
          },
        ],
      },
      approach: {
        eyebrow: "المنهجية",
        title: "ثلاث مراحل ونتائج قابلة للقياس.",
        steps: [
          {
            title: "رصد الحسّ",
            description:
              "زيارات ميدانية، مقابلات، فحوصات تقنية، وتحليل للاستخدامات.",
            phase: "01",
          },
          {
            title: "نماذج حيّة",
            description:
              "جلسات مشاركة، نماذج تفاعلية، تكرارات أسبوعية واختبارات نوعية.",
            phase: "02",
          },
          {
            title: "إطلاق منظّم",
            description: "إطلاق هجين، سرد قصصي، أدوات تحليل، وتدريب الفرق.",
            phase: "03",
          },
        ],
      },
      studio: {
        eyebrow: "الاستوديوهات",
        title: "شبكة عالمية بجذور محلية.",
        description:
          "قواعد متعددة تبقينا قريبين من المشاهد التقنية والثقافية والاقتصادية.",
        studios: [
          {
            city: "تورونتو",
            timezone: "UTC-5",
            focus: "إدارة مشاريع البرمجيات ودعم المنتجات لأمريكا الشمالية",
          },
          {
            city: "باريس",
            timezone: "UTC+1",
            focus: "الإخراج الفني للعلامة وخبرة دي جي المباشرة في باريس",
          },
          {
            city: "دمشق",
            timezone: "UTC+3",
            focus: "استشارات استراتيجية وهيكلة للمنظمات الثقافية",
          },
          {
            city: "كوالالمبور",
            timezone: "UTC+8",
            focus: "دي جي وإنتاج استوديو للمشهد في جنوب شرق آسيا",
          },
          {
            city: "الشارقة",
            timezone: "UTC+4",
            focus: "إدارة الكتالوج والتوزيع الموسيقي في الشرق الأوسط",
          },
          {
            city: "الرياض",
            timezone: "UTC+3",
            focus: "حوكمة واستشارات رقمية للمؤسسات الإقليمية",
          },
          {
            city: "ملبورن",
            timezone: "UTC+10",
            focus: "دعم تقني وصيانة على مدار الساعة لمنصاتنا البرمجية",
          },
        ],
        onsiteLabel: "جلسات غامرة في الموقع",
      },
      testimonials: {
        eyebrow: "شهادات",
        title: "شركاء على الموجة ذاتها",
        description: "تواصل معنا لمعرفة المزيد.",
        testimonials: [],
      },
      contact: {
        eyebrow: "تواصل",
        title: "لنتخيّل الفصل التالي معاً.",
        description: "أخبرنا عن مشروعك، سنعود إليك خلال 48 ساعة بخطوة أولى.",
      },
    },
    contactForm: {
      nameLabel: "الاسم الكامل",
      namePlaceholder: "اسمك",
      emailLabel: "البريد الإلكتروني",
      emailPlaceholder: "contact@studio.com",
      companyLabel: "الجهة",
      companyPlaceholder: "شركة، استوديو، مؤسسة...",
      messageLabel: "الرسالة",
      messagePlaceholder: "حدثنا عن مشروعك...",
      submitIdle: "إرسال",
      submitPending: "جاري الإرسال...",
      helper: "رد خلال 48 ساعة · يمكن تنظيم جلسات غامرة",
      success: "شكراً لك! سنعاود التواصل خلال 48 ساعة.",
      error: "يرجى التحقق من بيانات النموذج.",
    },
    footer: {
      description: "نبتكر تجارب رقمية حسية للجهات الثقافية والمؤسسات الطموحة.",
      exploreLabel: "استكشاف",
      socialLabel: "منصات",
      rights: (year, name) => `© ${year} ${name}. جميع الحقوق محفوظة.`,
      studiosLine:
        "استوديوهات في تورونتو · باريس · دمشق · كوالالمبور · الشارقة · الرياض · ملبورن",
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
