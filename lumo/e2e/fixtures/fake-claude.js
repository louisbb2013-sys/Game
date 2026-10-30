// Test stand-in for the Claude page viewer: user, db and room shared between tabs of one browser.
(function () {
  const uid = new URLSearchParams(location.search).get('uid') || 'u_a';
  // ?viewonly=1: a friend on another Claude account opening a shared link (holds `view`: every write is refused).
  const viewOnly = new URLSearchParams(location.search).get('viewonly') === '1';
  const refuse = () => Promise.reject({ code: 'invalid_argument', message: 'write not allowed at this level' });
  // Each tab is its own Lumo learner: namespace the app's own storage by uid.
  const gi = Storage.prototype.getItem, si = Storage.prototype.setItem, ri = Storage.prototype.removeItem;
  const k = (key) => (key.startsWith('fake:') ? key : uid + ':' + key);
  Storage.prototype.getItem = function (key) { return gi.call(this, k(key)); };
  Storage.prototype.setItem = function (key, v) { return si.call(this, k(key), v); };
  Storage.prototype.removeItem = function (key) { return ri.call(this, k(key)); };

  const bc = new BroadcastChannel('fake-db');
  let mem = null;
  const load = () => mem ?? (mem = JSON.parse(gi.call(localStorage, 'fake:db') || '{}'));
  const store = (d) => { mem = d; si.call(localStorage, 'fake:db', JSON.stringify(d)); };
  const listeners = new Set();
  const notify = () => { for (const l of listeners) l(); };
  bc.onmessage = (e) => { mem = e.data; notify(); };
  const visible = (path) => !path.startsWith('data/users/') || path.startsWith('data/users/' + uid + '/');
  // Like the real viewer, hand out data that can't be structured-cloned (deep read-only proxies).
  const deep = (v) => (v && typeof v === 'object' ? new Proxy(v, { get: (t, k) => deep(t[k]), set: () => false }) : v);
  const snapDoc = (path) => { const d = load()[path]; return { id: path.split('/').pop(), exists: !!d && visible(path), data: () => (d === undefined ? undefined : deep(JSON.parse(JSON.stringify(d)))), metadata: {} }; };
  const write = (path, data) => { const db = load(); if (data === null) delete db[path]; else db[path] = JSON.parse(JSON.stringify(data)); store(db); bc.postMessage(db); setTimeout(notify); };
  const doc = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => snapDoc(path),
    set: async (data) => (viewOnly ? refuse() : write(path, data)),
    update: async (data) => (viewOnly ? refuse() : write(path, { ...load()[path], ...data })),
    delete: async () => (viewOnly ? refuse() : write(path, null)),
    onSnapshot: (next) => { let last; const run = () => { const s = JSON.stringify(load()[path] ?? null); if (s !== last) { last = s; next(snapDoc(path)); } }; listeners.add(run); setTimeout(run); return () => listeners.delete(run); },
    collection: (p) => collection(path + '/' + p),
  });
  const collection = (col, filters = [], lim = 1000) => {
    const q = {
      path: col,
      where: (f, op, v) => collection(col, [...filters, [f, op, v]], lim),
      limit: (n) => collection(col, filters, n),
      orderBy: () => q,
      doc: (id) => doc(col + '/' + (id || Math.random().toString(36).slice(2))),
      run: () => Object.keys(load()).filter((p) => p.startsWith(col + '/') && p.split('/').length === col.split('/').length + 1 && visible(p))
        .map(snapDoc).filter((s) => filters.every(([f, op, v]) => op === '==' ? s.data()[f] === v : true)).slice(0, lim),
      get: async () => { const docs = q.run(); return { docs, size: docs.length, empty: !docs.length }; },
      onSnapshot: (next) => { let last; const run = () => { const docs = q.run(); const s = JSON.stringify(docs.map((d) => [d.id, d.data()])); if (s !== last) { last = s; next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [] }); } }; listeners.add(run); setTimeout(run); return () => listeners.delete(run); },
    };
    return q;
  };
  const db = { doc, collection };

  const user = {
    id: async () => uid, name: async () => ({ u_a: 'Alice Martin', u_b: 'Bruno', u_c: 'Carla' })[uid] || '', can: async () => (viewOnly ? null : true), canEdit: async () => !viewOnly, isOwner: async () => uid === 'u_a',
    profiles: async (ids) => Object.fromEntries([].concat(ids).map((id) => [id, { id, name: id === 'u_a' ? 'Alice' : id === 'u_b' ? 'Bruno' : 'Carla', avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', color: '#888', isMe: id === uid }])),
  };

  const peer = uid + '-' + Math.random().toString(36).slice(2, 6);
  const room = {
    join: async (name) => {
      const ch = new BroadcastChannel('fake-room-' + name);
      const peers = new Map();
      const handlers = new Set();
      let mine = {};
      const emitPeers = () => { const list = [...peers.values()]; for (const h of handlers) h({ peers: list, joined: [], left: [], updated: [] }); };
      const announce = () => ch.postMessage({ t: 'p', peer, by: uid, presence: mine });
      ch.onmessage = (e) => {
        const m = e.data;
        if (m.t === 'hello') announce();
        if (m.t === 'p') { peers.set(m.peer, { peer: m.peer, by: m.by, presence: m.presence, isMe: false, sameTab: false, kind: 'viewer', guest: false, updatedAt: Date.now() }); emitPeers(); }
        if (m.t === 'bye') { peers.delete(m.peer); emitPeers(); }
      };
      peers.set(peer, { peer, by: uid, presence: mine, isMe: true, sameTab: true, kind: 'viewer', guest: false, updatedAt: Date.now() });
      ch.postMessage({ t: 'hello' });
      window.addEventListener('beforeunload', () => ch.postMessage({ t: 'bye', peer }));
      return {
        name,
        presence: async (patch) => { mine = { ...mine, ...patch }; peers.set(peer, { ...peers.get(peer), presence: mine }); announce(); emitPeers(); },
        onPeers: (h) => { handlers.add(h); setTimeout(emitPeers); return () => handlers.delete(h); },
        peers: () => [...peers.values()],
        leave: async () => { ch.postMessage({ t: 'bye', peer }); ch.close(); },
        connected: () => true,
      };
    },
  };
  // The lobby: presence and peers for everyone with the page open.
  let lobby = null;
  const lobbyReady = room.join('lobby').then((r) => (lobby = r));
  const pending = [];
  room.presence = async (patch) => { await lobbyReady; return lobby.presence(patch); };
  room.onPeers = (h) => { let un = () => {}; let dead = false; lobbyReady.then((r) => { if (!dead) un = r.onPeers(h); }); return () => { dead = true; un(); }; };
  room.peers = () => (lobby ? lobby.peers() : []);
  const sMode = new URLSearchParams(location.search).get('sample');
  const conceptLines = (p) => (String(p).match(/^\d+\. .+$/gm) || []).map((line) => line.replace(/^\d+\. /, '').split(' — ')[0]);
  // Claude writing test questions: one JSON object per line, streamed in a few chunks like the real thing.
  const bankLines = (p) => conceptLines(p).flatMap((term, i) => [
    { c: i + 1, f: 1, type: 'mcq', level: 'apply', context: 'Bank scenario ' + (i + 1) + ': in a lab, a student notices something new.', q: 'Which idea best explains what the student noticed?', options: [term, 'A common mix-up', 'Something unrelated', 'The opposite idea'], answer: 0, why: 'Because of ' + term + '.', wrong: ['', 'This is the classic misconception.', 'This has nothing to do with it.', 'This is backwards.'] },
    { c: i + 1, f: 1, type: 'tf', level: 'understand', q: 'Bank statement ' + (i + 1) + ': ' + term + ' describes something real.', answer: true, why: 'It is a real idea from the course.' },
    { c: i + 1, f: 1, type: 'written', level: 'analyze', q: 'Bank question ' + (i + 1) + ': explain why ' + term + ' matters in a new situation.', points: ['names the idea', 'gives a reason'], model: 'A model answer.', why: 'A full answer names the idea and gives a reason.' },
  ].map((o) => JSON.stringify(o)));
  // Every prompt sent to Claude, so tests can check what Lumo told it (e.g. the learner's memory).
  window.__prompts = [];
  // Reading notes, photos or a topic: one line for the deck, then one line per sub-aspect with its facts.
  const RECIT = [
    ['Récit psychologique', 'Récit qui explore les pensées et les émotions d’un personnage.'],
    ['Narrateur', 'Celui qui raconte l’histoire.'],
    ['Monologue intérieur', 'Pensées du personnage rapportées comme il les vit.'],
    ['Focalisation interne', 'On voit l’histoire par les yeux d’un personnage.'],
    ['Schéma narratif', 'Les cinq étapes d’une histoire.'],
    ['Élément déclencheur', 'Ce qui vient briser la situation initiale.'],
    ['Dénouement', 'Ce qui met fin aux péripéties.'],
  ];
  const deckLines = (p) => {
    const lines = [{ title: 'Le récit psychologique', subject: 'Français', summary: 'Un récit centré sur la vie intérieure.' }];
    // Adding notes to a deck: only what's new (a new fact about an idea it has, and a new idea).
    if (String(p).includes('The deck ALREADY has these sub-aspects')) {
      lines.push({ topic: 'Récit', kind: 'definition', term: 'Narrateur', summary: 'Celui qui raconte l’histoire.', facts: ['Le narrateur peut être un personnage de l’histoire.'] });
      lines.push({ topic: 'Récit', kind: 'definition', term: 'Chute', summary: 'Fin surprenante d’une nouvelle.', facts: ['La chute surprend le lecteur à la toute fin.'] });
    } else for (const [term, summary] of RECIT) lines.push({ topic: 'Récit', kind: 'definition', term, summary, facts: [summary] });
    return lines.map((o) => JSON.stringify(o)).join('\n') + '\n';
  };
  const writeBank = async (p, o = {}) => {
    window.__prompts.push(String(p));
    if (sMode === 'hang') return new Promise(() => {});
    if (sMode === 'deny') throw { code: 'not_granted', message: 'declined' };
    if (String(p).includes('Explain it again')) return { text: 'Think of it like a crowded hallway: people spread out to where there is more room.', truncated: false };
    if (String(p).includes('You are Lumo, a friendly firefly')) {
      const text = 'Here is your chess lesson game!\n```html\n<!doctype html><html><head><title>Chess</title></head><body><h1 id="t">Knight moves</h1><button onclick="document.getElementById(\'t\').textContent=\'Right!\'">L-shape</button></body></html>\n```';
      o.onText && o.onText({ text: text.slice(0, 40), delta: text.slice(0, 40) });
      await new Promise((r) => setTimeout(r, 150));
      return { text, truncated: false };
    }
    if (String(p).includes('Break it into the precise sub-aspects')) {
      await new Promise((r) => setTimeout(r, sMode === 'slow' ? 1500 : 300));
      return { text: deckLines(p), truncated: false };
    }
    const text = bankLines(p).join('\n') + '\n';
    const cut = Math.max(1, Math.floor(text.length / 3));
    for (const end of [cut, cut * 2, text.length]) {
      await new Promise((r) => setTimeout(r, sMode === 'slow' ? 1500 : 120));
      if (o.signal && o.signal.aborted) throw { code: 'cancelled', message: 'stopped' };
      o.onText && o.onText({ text: text.slice(0, end), delta: text.slice(end - cut, end) });
    }
    return { text, truncated: false };
  };
  const sample = sMode ? Object.assign(writeBank, {
    limits: async () => ({ images: { maxCount: 5, maxBytes: 5000000 } }),
    json: (p, o) => (window.__prompts.push(String(p)), sMode === 'hang') ? new Promise(() => {}) : sMode === 'deny' ? Promise.reject({ code: 'not_granted', message: 'declined' }) : new Promise((r) => setTimeout(() => r(
      String(p).includes('You are checking a school quiz')
        ? [] // no second opinion this time: every question is kept
        : String(p).includes('You grade a student')
        ? { matched: [0], feedback: 'Good start: add the reason.' }
        : String(p).includes('typed what they want to study') || String(p).includes("Below are a student's notes")
        ? { title: 'Le récit psychologique', subject: 'Français', summary: 'Un récit centré sur la vie intérieure.', concepts: [
            ['Récit psychologique', 'Récit qui explore les pensées et les émotions d’un personnage.'],
            ['Narrateur', 'Celui qui raconte l’histoire.'],
            ['Monologue intérieur', 'Pensées du personnage rapportées comme il les vit.'],
            ['Focalisation interne', 'On voit l’histoire par les yeux d’un personnage.'],
            ['Schéma narratif', 'Les cinq étapes d’une histoire.'],
            ['Élément déclencheur', 'Ce qui vient briser la situation initiale.'],
            ['Dénouement', 'Ce qui met fin aux péripéties.'],
          ].map(([term, summary]) => ({ topic: 'Récit', kind: 'definition', term, summary, keyPoints: [summary], examples: [], misconceptions: [], synonyms: [] })) }
        : {}), 300)),
  }) : null;
  // Like the real viewer: permission is asked on the first call (here: already allowed with sample=ok).
  const permissions = { state: async (n) => (n === 'sample' && sMode === 'ok' ? 'granted' : n === 'sample' && sMode ? 'prompt' : 'granted'), request: async () => ({}), manage: async () => {} };
  window.claude = { use: async (name) => ({ db, user, room, sample, permissions }[name] ?? null) };
})();
