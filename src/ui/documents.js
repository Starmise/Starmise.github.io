import { youtubeThumb } from '../core/assets.js';
import { t } from '../core/i18n.js';

/**
 * Convierte los datos (projects.json, profile.json) en "documentos" que muestra FileView.
 * Ningún texto del portafolio se escribe aquí: solo etiquetas de la interfaz (traducidas con t()).
 *
 * Documento: { kicker, title, tagline?, image?, imageAlt?, video?: { youtubeId, embedUrl?, poster },
 *              sections: [{ heading, paragraphs?, items? }], gallery?: string[], tags?,
 *              links?: [{ label, href }] }
 */
export function projectDocument(project, index) {
  return {
    kicker: t('doc.fileNo', { n: String(index + 1).padStart(3, '0') }),
    title: project.title,
    tagline: project.tagline,
    image: project.cover,
    imageAlt: t('doc.coverAlt', { title: project.title }),
    sections: [
      { heading: t('doc.description'), paragraphs: [project.description] },
      { heading: t('doc.process'), paragraphs: [project.process] },
      { heading: t('doc.role'), paragraphs: [project.role] },
    ].filter((s) => s.paragraphs.every(Boolean)),
    gallery: project.gallery ?? [],
    tags: project.tags ?? [],
    links: project.externalLink ? [{ label: project.externalLabel || t('doc.viewProject'), href: project.externalLink }] : [],
  };
}

/** Tarjetas "Qué hago" de profile.json. */
export function whatIDoDocument(item) {
  return {
    kicker: t('doc.whatIDo'),
    title: item.title,
    image: item.image,
    imageAlt: '',
    sections: [{ heading: t('doc.notes'), paragraphs: [item.text] }],
    whatIDo: true,
  };
}

/** Documentos del perfil que pueden colocarse en una sala con INT_<id>. */
export const PROFILE_DOCUMENTS = {
  about: (p) => ({
    kicker: t('doc.diary'),
    title: `${p.name} — ${p.alias}`,
    tagline: p.title,
    image: p.logo,
    imageAlt: t('doc.logoAlt', { alias: p.alias }),
    sections: [
      { heading: t('doc.whoAmI'), paragraphs: p.about },
      p.studio && { heading: t('doc.studio'), paragraphs: [p.studio.name] },
    ].filter(Boolean),
    links: [
      p.demoReel && { label: t('doc.watchReel'), href: `https://www.youtube.com/watch?v=${p.demoReel.youtubeId}` },
    ].filter(Boolean),
    promptLabel: t('doc.diary'),
  }),
  contact: (p) => ({
    kicker: t('doc.typewriter'),
    title: t('doc.contact'),
    tagline: `${p.name} · ${p.title}`,
    sections: [],
    links: p.contact.map((c) => ({ label: c.label, href: c.url })),
    linkLayout: 'list',
    promptLabel: t('doc.typewriter'),
  }),
  demoreel: (p) => ({
    kicker: t('doc.videotape'),
    title: p.demoReel.title,
    tagline: `${p.name} · ${p.title}`,
    video: { ...p.demoReel, poster: p.demoReel.thumbnail ?? youtubeThumb(p.demoReel.youtubeId) },
    sections: [],
    links: [{ label: t('doc.watchYoutube'), href: `https://www.youtube.com/watch?v=${p.demoReel.youtubeId}` }],
    promptLabel: 'DemoReel',
    verb: t('doc.watch'),
  }),
  trivia: (p) => ({
    kicker: t('doc.notebook'),
    title: t('doc.trivia'),
    image: p.trivia?.image,
    imageAlt: '',
    sections: [{ heading: t('doc.notes'), items: p.trivia?.items ?? [] }],
    promptLabel: t('doc.notebook'),
  }),
};

/**
 * Resuelve el id de un INT_ a { kind, label, verb?, project?, video?, document() }, o null si no existe.
 * `video` (solo documentos con video): { thumbnail, label } para la pantalla de TV de la sala.
 */
export function resolveInteractable(id, { projects, profile }) {
  const index = projects.findIndex((p) => p.id === id);
  if (index >= 0) {
    const project = projects[index];
    return { kind: 'project', label: project.title, project, document: () => projectDocument(project, index) };
  }
  const make = PROFILE_DOCUMENTS[id];
  if (make) {
    const doc = make(profile);
    return {
      kind: 'profile',
      label: doc.promptLabel ?? doc.title,
      verb: doc.verb,
      video: doc.video && { thumbnail: doc.video.poster, label: 'DEMO REEL' },
      document: () => doc,
    };
  }
  return null;
}
