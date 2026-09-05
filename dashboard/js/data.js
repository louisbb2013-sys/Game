// Sample data only — see README.md. Nothing here is a real account or message.
const SAMPLE_DATA = {
  mail: {
    icloud: [
      { from: "Apple", subject: "Your iCloud storage is almost full", time: "9:41 AM", unread: true },
      { from: "Delta Air Lines", subject: "Check-in now open for your flight", time: "8:15 AM", unread: true },
      { from: "Sarah Chen", subject: "Re: Saturday plans", time: "Yesterday", unread: false },
      { from: "Bank Alerts", subject: "Statement ready to view", time: "Yesterday", unread: false },
    ],
    gmail: [
      { from: "GitHub", subject: "[game] New commit on claude/ai-os-dashboard", time: "10:02 AM", unread: true },
      { from: "Notion", subject: "Weekly digest: 4 pages updated", time: "7:30 AM", unread: false },
      { from: "Figma", subject: "You were mentioned in a comment", time: "Mon", unread: false },
    ],
    outlook: [
      { from: "Microsoft 365", subject: "Security recommendations for your tenant", time: "Fri", unread: false },
      { from: "Teams", subject: "Meeting recap: Weekly sync", time: "Fri", unread: false },
    ],
  },
  events: [
    { title: "Weekly sync", when: "Today · 2:00 PM", where: "Teams" },
    { title: "Dentist", when: "Tomorrow · 9:30 AM", where: "Main St Clinic" },
    { title: "Domain renewal reminder", when: "Thu · all day", where: "GoDaddy" },
    { title: "Coffee with Sarah", when: "Sat · 11:00 AM", where: "Blue Bottle" },
  ],
  files: [
    { name: "Q3-summary.xlsx", changed: "2h ago" },
    { name: "House lease.pdf", changed: "Yesterday" },
    { name: "Chess Royale notes.md", changed: "3d ago" },
  ],
  domains: [
    { name: "bakyos.ca", expires: "Renews in 214 days", status: "ok" },
    { name: "louisbaron.dev", expires: "Renews in 41 days", status: "warn" },
  ],
  messages: [
    { from: "Ops channel", preview: "Deploy finished ✅", time: "11:20 AM" },
    { from: "Sarah Chen", preview: "Sent you the invoice", time: "9:05 AM" },
  ],
};

// Every tool a future real integration could cover. `connected` is purely a
// local UI toggle (see app.js) — flipping it never performs a sign-in.
const CONNECTIONS = [
  { id: "icloud", name: "iCloud Mail", detail: "App-Specific Password · IMAP", connected: false },
  { id: "gmail", name: "Gmail", detail: "OAuth 2.0 · Google", connected: false },
  { id: "outlook", name: "Outlook / Microsoft 365", detail: "OAuth 2.0 · Microsoft Graph", connected: false },
  { id: "gcal", name: "Google Calendar", detail: "OAuth 2.0 · Google", connected: false },
  { id: "gdrive", name: "Google Drive", detail: "OAuth 2.0 · Google", connected: false },
  { id: "square", name: "Square", detail: "OAuth 2.0 · Square", connected: false },
  { id: "godaddy", name: "GoDaddy Domains", detail: "API key + secret", connected: false },
  { id: "teams", name: "Microsoft Teams", detail: "OAuth 2.0 · Microsoft Graph", connected: false },
];
