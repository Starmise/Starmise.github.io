import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/**
 * Meta etiquetas del sitio (descripción, Open Graph para las vistas previas de enlaces y
 * datos estructurados de schema.org) generadas desde `profile.site` en src/data/profile.json,
 * para que el texto tenga una sola fuente. Se inyectan en index.html en dev y en el build.
 */
function siteMeta() {
  return {
    name: 'starmise-site-meta',
    transformIndexHtml(html) {
      const profile = JSON.parse(readFileSync(new URL('./src/data/profile.json', import.meta.url), 'utf8'));
      const site = profile.site;
      if (!site) return html;
      const image = new URL(site.image, site.url).href;
      const meta = (attrs) => ({ tag: 'meta', attrs, injectTo: 'head' });
      const person = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: profile.name,
        alternateName: profile.alias,
        jobTitle: profile.title,
        url: site.url,
        image,
        worksFor: profile.studio?.name ? { '@type': 'Organization', name: profile.studio.name } : undefined,
        sameAs: profile.contact.map((c) => c.url).filter((u) => /^https?:/.test(u)).map((u) => u.split('?')[0]),
      };
      return {
        html: html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(site.title)}</title>`),
        tags: [
          meta({ name: 'description', content: site.description }),
          meta({ name: 'author', content: profile.name }),
          { tag: 'link', attrs: { rel: 'canonical', href: site.url }, injectTo: 'head' },
          meta({ property: 'og:type', content: 'website' }),
          meta({ property: 'og:site_name', content: profile.alias }),
          meta({ property: 'og:locale', content: 'es_MX' }),
          meta({ property: 'og:locale:alternate', content: 'en_US' }),
          meta({ property: 'og:title', content: site.title }),
          meta({ property: 'og:description', content: site.description }),
          meta({ property: 'og:url', content: site.url }),
          meta({ property: 'og:image', content: image }),
          meta({ property: 'og:image:width', content: '1200' }),
          meta({ property: 'og:image:height', content: '630' }),
          meta({ property: 'og:image:alt', content: site.imageAlt ?? site.title }),
          meta({ name: 'twitter:card', content: 'summary_large_image' }),
          {
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: JSON.stringify(person).replace(/</g, '\\u003c'),
            injectTo: 'head',
          },
        ],
      };
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export default defineConfig({
  // Rutas relativas: el sitio funciona igual en https://starmise.github.io/ (repo
  // Starmise.github.io) que en una subcarpeta.
  base: './',
  plugins: [siteMeta()],
  build: {
    outDir: 'dist',
    // Los modelos y texturas ya son pequeños; no incrustarlos como base64 en el JS.
    assetsInlineLimit: 0,
    // Three.js por sí solo ronda los 600 kB minificado.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    open: true,
  },
});
