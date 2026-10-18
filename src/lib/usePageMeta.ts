import { useEffect } from 'react';

/**
 * Lightweight SEO meta updater for SPA routes.
 * Since this is a Vite SPA (not SSR), we update document.title and meta
 * tags dynamically. For crawlability, the main index.html has sensible
 * defaults, and this adds per-route overrides.
 */
export function usePageMeta(opts: {
  title: string;
  description: string;
  canonical?: string;
  noindex?: boolean;
}) {
  useEffect(() => {
    // Title
    document.title = opts.title;

    // Meta description
    setMeta('description', opts.description);

    // OG tags
    setMetaProperty('og:title', opts.title);
    setMetaProperty('og:description', opts.description);
    if (opts.canonical) {
      setMetaProperty('og:url', opts.canonical);
    }

    // Twitter
    setMeta('twitter:title', opts.title);
    setMeta('twitter:description', opts.description);

    // Canonical
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (opts.canonical) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = opts.canonical;
    }

    // Robots
    if (opts.noindex) {
      setMeta('robots', 'noindex, nofollow');
    } else {
      setMeta('robots', 'index, follow');
    }
  }, [opts.title, opts.description, opts.canonical, opts.noindex]);
}

function setMeta(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function setMetaProperty(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.content = content;
}
