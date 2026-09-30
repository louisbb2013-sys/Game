import { useEffect } from 'react';
import { site } from '../content/site';

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/** Per-page title, description, canonical and Open Graph tags. */
export function usePageMeta(title: string, description: string, path: string) {
  useEffect(() => {
    const full = title === site.name ? `${site.name} — ${site.tagline}` : `${title} · ${site.name}`;
    document.title = full;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', site.url + path);
    setMeta('name', 'twitter:title', full);
    setMeta('name', 'twitter:description', description);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = site.url + path;
  }, [title, description, path]);
}
