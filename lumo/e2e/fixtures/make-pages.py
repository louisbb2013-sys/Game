"""Build the two local test pages from the single-file website (apps/web/dist-local/lumo.html).

index.html: the website alone, with the strict sandbox the Claude viewer applies (no network).
multi.html: the website plus fake-claude.js, a stand-in for the Claude viewer (shared db, rooms, users,
and a fake Claude: ?sample=ok|slow|hang|deny). Serve the folder and point MULTI_URL / LOCAL_URL at it.

    python3 e2e/fixtures/make-pages.py OUT_DIR && (cd OUT_DIR && python3 -m http.server 8765)
"""
import pathlib
import sys

here = pathlib.Path(__file__).resolve().parent
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else here / 'pages')
out.mkdir(parents=True, exist_ok=True)
site = (here.parent.parent / 'apps/web/dist-local/lumo.html').read_text()
fake = (here / 'fake-claude.js').read_text()
meta = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
csp = ('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' https://cdnjs.cloudflare.com; '
       'style-src \'unsafe-inline\' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; '
       'media-src data: blob:; connect-src \'none\'; worker-src blob:">')
(out / 'index.html').write_text(f'<!doctype html><html><head>{meta}{csp}</head><body>{site}</body></html>')
(out / 'multi.html').write_text(f'<!doctype html><html><head>{meta}<script>{fake}</script></head><body>{site}</body></html>')
print('wrote', out / 'index.html', 'and', out / 'multi.html')
