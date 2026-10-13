import { type Rng } from './rng';

const ADJECTIVES = [
  'Amber', 'Brave', 'Bright', 'Calm', 'Clever', 'Cosmic', 'Curious', 'Gentle', 'Glowing', 'Happy',
  'Jolly', 'Lucky', 'Mighty', 'Nimble', 'Quiet', 'Rapid', 'Sunny', 'Swift', 'Witty', 'Zesty',
];
const NOUNS = [
  'Otter', 'Comet', 'Falcon', 'Panda', 'Koala', 'Lynx', 'Maple', 'Nova', 'Owl', 'Pebble',
  'Quasar', 'Robin', 'Sparrow', 'Tiger', 'Willow', 'Yeti', 'Firefly', 'Dolphin', 'Cedar', 'Badger',
];

/** Safe default usernames: never derived from the learner's real name or email. */
export function generateUsername(rng: Rng = Math.random): string {
  const a = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)]!;
  const n = NOUNS[Math.floor(rng() * NOUNS.length)]!;
  return `${a}${n}${10 + Math.floor(rng() * 90)}`;
}

// Short, deliberately conservative blocklist; matched after leetspeak normalization.
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'sex', 'porn', 'nazi', 'hitler', 'rape', 'nigg', 'fag', 'slut', 'whore', 'merde', 'pute', 'salope', 'connard', 'encule', 'admin', 'moderator', 'lumo'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

export type UsernameProblem = 'length' | 'characters' | 'blocked' | 'personal_info';

export function validateUsername(name: string): UsernameProblem | null {
  if (name.length < 3 || name.length > 20) return 'length';
  if (!/^[A-Za-z0-9_]+$/.test(name)) return 'characters';
  const normalized = name.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] ?? c).replace(/_/g, '');
  if (BLOCKED.some((w) => normalized.includes(w))) return 'blocked';
  // Long digit runs look like phone numbers / birth years — keep minors' info private.
  if (/\d{5,}/.test(name) || /(19|20)\d{2}/.test(name)) return 'personal_info';
  return null;
}
