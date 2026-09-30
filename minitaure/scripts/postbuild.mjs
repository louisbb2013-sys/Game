// Static-hosting helpers for the SPA:
//  - 404.html = index.html (GitHub Pages serves it for unknown routes)
//  - _redirects (Netlify / Cloudflare Pages): every route → index.html
import fs from 'node:fs/promises';
const dist = new URL('../dist/', import.meta.url);
await fs.copyFile(new URL('index.html', dist), new URL('404.html', dist));
await fs.writeFile(new URL('_redirects', dist), '/*    /index.html   200\n');
console.log('postbuild: 404.html and _redirects written');
