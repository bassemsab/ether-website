export const siteConfig = {
  name: 'Ether',
  motto: 'Tout Partout',
  description:
    'Ether builds seamless digital experiences that blend art direction with measurable impact for cultural innovators.',
  url: 'https://ether.studio',
  ogImage: 'https://images.unsplash.com/photo-1526498460520-4c246339dccb?auto=format&fit=crop&w=1600&q=80',
  locale: 'fr-FR',
  navigation: [
    { label: 'Manifesto', href: '#manifesto' },
    { label: 'Expertise', href: '#expertise' },
    { label: 'Cases', href: '#cases' },
    { label: 'Approach', href: '#approach' },
    { label: 'Studio', href: '#studio' },
    { label: 'Contact', href: '#contact' }
  ],
  socials: [
    { label: 'Behance', href: 'https://www.behance.net/ether' },
    { label: 'Dribbble', href: 'https://dribbble.com/ether' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/ether' },
    { label: 'Instagram', href: 'https://www.instagram.com/ether' }
  ]
};

export type SiteConfig = typeof siteConfig;
