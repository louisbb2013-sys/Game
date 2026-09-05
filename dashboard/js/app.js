(function () {
  "use strict";

  const STORAGE_KEY = "ai-os.connections.v1";

  function loadConnectionState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (err) {
      return {};
    }
  }

  function saveConnectionState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* private browsing / storage blocked — state just won't persist */
    }
  }

  const overrides = loadConnectionState();
  const connections = CONNECTIONS.map((c) => ({
    ...c,
    connected: overrides[c.id] ?? c.connected,
  }));

  const CARD_TO_CONNECTION = {
    calendar: "gcal",
    files: "gdrive",
    payments: "square",
    domains: "godaddy",
    messages: "teams",
  };

  function connectionFor(id) {
    return connections.find((c) => c.id === id);
  }

  function setPill(cardName, connected) {
    const pill = document.querySelector(`[data-status-pill="${cardName}"]`);
    if (!pill) return;
    pill.textContent = connected ? "Connected" : "Not connected";
    pill.classList.toggle("pill-ok", connected);
    pill.classList.toggle("pill-warn", !connected);
  }

  function refreshAllPills() {
    setPill("mail", connectionFor(activeMailTab).connected);
    Object.entries(CARD_TO_CONNECTION).forEach(([card, connId]) => {
      setPill(card, connectionFor(connId).connected);
    });
  }

  // ---- Mail tabs ----
  let activeMailTab = "icloud";

  function renderMail() {
    const list = document.getElementById("mail-list");
    const meta = document.getElementById("mail-meta");
    const items = SAMPLE_DATA.mail[activeMailTab] || [];
    list.innerHTML = items
      .map(
        (m) => `
        <li class="mail-row ${m.unread ? "unread" : ""}">
          <span class="mail-from">${escapeHtml(m.from)}</span>
          <span class="mail-subject">${escapeHtml(m.subject)}</span>
          <span class="mail-time mono">${escapeHtml(m.time)}</span>
        </li>`
      )
      .join("");

    const metaText = {
      icloud: "iCloud Mail · App-Specific Password · IMAP :993 / SMTP :587",
      gmail: "Gmail · OAuth 2.0 · scope: gmail.readonly",
      outlook: "Outlook · OAuth 2.0 · Microsoft Graph · scope: Mail.Read",
    };
    meta.textContent = metaText[activeMailTab];
    setPill("mail", connectionFor(activeMailTab).connected);
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeMailTab = tab.dataset.tab;
      renderMail();
    });
  });

  // ---- Simple list renders ----
  function renderEvents() {
    document.getElementById("event-list").innerHTML = SAMPLE_DATA.events
      .map(
        (e) => `
        <li class="event-row">
          <span class="event-title">${escapeHtml(e.title)}</span>
          <span class="event-when mono">${escapeHtml(e.when)}</span>
          <span class="event-where">${escapeHtml(e.where)}</span>
        </li>`
      )
      .join("");
  }

  function renderFiles() {
    document.getElementById("file-list").innerHTML = SAMPLE_DATA.files
      .map(
        (f) => `
        <li class="file-row">
          <span class="file-name">${escapeHtml(f.name)}</span>
          <span class="file-changed mono">${escapeHtml(f.changed)}</span>
        </li>`
      )
      .join("");
  }

  function renderDomains() {
    document.getElementById("domain-list").innerHTML = SAMPLE_DATA.domains
      .map(
        (d) => `
        <li class="domain-row">
          <span class="domain-name mono">${escapeHtml(d.name)}</span>
          <span class="domain-expiry ${d.status === "warn" ? "warn" : ""}">${escapeHtml(d.expires)}</span>
        </li>`
      )
      .join("");
  }

  function renderMessages() {
    document.getElementById("messages-list").innerHTML = SAMPLE_DATA.messages
      .map(
        (m) => `
        <li class="mini-row">
          <span class="mini-from">${escapeHtml(m.from)}</span>
          <span class="mini-preview">${escapeHtml(m.preview)}</span>
          <span class="mini-time mono">${escapeHtml(m.time)}</span>
        </li>`
      )
      .join("");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Clock ----
  function tickClock() {
    const el = document.getElementById("clock");
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ---- Connections panel ----
  const panel = document.getElementById("connections-panel");
  const list = document.getElementById("connections-list");

  function renderConnectionsList() {
    list.innerHTML = connections
      .map(
        (c) => `
        <li class="connection-row">
          <div>
            <span class="connection-name">${escapeHtml(c.name)}</span>
            <span class="connection-detail mono">${escapeHtml(c.detail)}</span>
          </div>
          <button class="toggle ${c.connected ? "on" : ""}" data-toggle="${c.id}" role="switch" aria-checked="${c.connected}">
            <span class="toggle-knob"></span>
          </button>
        </li>`
      )
      .join("");

    list.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.toggle;
        const conn = connectionFor(id);
        conn.connected = !conn.connected;
        overrides[id] = conn.connected;
        saveConnectionState(overrides);
        renderConnectionsList();
        refreshAllPills();
      });
    });
  }

  document.getElementById("open-connections").addEventListener("click", () => {
    panel.classList.remove("hidden");
  });
  document.getElementById("close-connections").addEventListener("click", () => {
    panel.classList.add("hidden");
  });
  panel.addEventListener("click", (e) => {
    if (e.target === panel) panel.classList.add("hidden");
  });

  // ---- Command bar ----
  document.getElementById("command-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("command-input");
    if (!input.value.trim()) return;
    input.placeholder = "This bar is a mockup — real commands need a wired-up backend. Try Claude Code instead.";
    input.value = "";
  });

  // ---- Init ----
  renderMail();
  renderEvents();
  renderFiles();
  renderDomains();
  renderMessages();
  renderConnectionsList();
  refreshAllPills();
  tickClock();
  setInterval(tickClock, 15000);
})();
