// The building: every project is a floor you ride the elevator to. Shared by the server (which
// assigns each floor its look) and the client (which paints it).

import type { CloneProgress } from './protocol.js';

/** The most floors a building has. */
export const MAX_FLOORS = 16;

/** How a floor looks: its walls, their trim, and its planks. */
export interface FloorPalette {
  name: string;
  wall: string;
  trim: string;
  floor: string;
  floorAlt: string;
  /** The gaps between planks. */
  seam: string;
}

// Every floor in the cool steel/blue/teal family of an IT park: light glassy walls, a metal accent
// trim, and a cool grey floor. The names stay (they aren't shown); only the colours turned corporate.
export const FLOOR_PALETTES: FloorPalette[] = [
  { name: 'Maple', wall: '#eef2f6', trim: '#5b7a99', floor: '#c6ced6', floorAlt: '#b7c0ca', seam: '#9aa6b2' },
  { name: 'Mint', wall: '#e8f4f1', trim: '#2fa38c', floor: '#c4d6d2', floorAlt: '#b4c9c4', seam: '#97b1ab' },
  { name: 'Sky', wall: '#e7f0fb', trim: '#3f7fd0', floor: '#c9d4e2', floorAlt: '#b8c6d8', seam: '#9aabc1' },
  { name: 'Lavender', wall: '#edecf7', trim: '#6a6fd0', floor: '#cdcfe0', floorAlt: '#bdc0d5', seam: '#a2a6c2' },
  { name: 'Peach', wall: '#e9f1f4', trim: '#2f94a8', floor: '#c3d2d8', floorAlt: '#b3c4cb', seam: '#96abb3' },
  { name: 'Lemon', wall: '#eef1f6', trim: '#4c6fa0', floor: '#c6ccd6', floorAlt: '#b6bdc9', seam: '#99a2b1' },
  { name: 'Walnut', wall: '#eceef1', trim: '#4a5568', floor: '#b7bcc4', floorAlt: '#a8adb7', seam: '#8b909c' },
  { name: 'Slate', wall: '#edf1f5', trim: '#35557a', floor: '#b9c3cd', floorAlt: '#aab5c0', seam: '#8d99a6' },
  { name: 'Rose', wall: '#efecf2', trim: '#8a5e9c', floor: '#ccc7d4', floorAlt: '#bcb6c7', seam: '#a099ad' },
  { name: 'Teal', wall: '#e1f2f2', trim: '#178f9a', floor: '#bfd6d6', floorAlt: '#afcbcb', seam: '#92b6b6' },
];

export function floorPalette(i: number): FloorPalette {
  return FLOOR_PALETTES[((i % FLOOR_PALETTES.length) + FLOOR_PALETTES.length) % FLOOR_PALETTES.length];
}

/**
 * `owner/repo` from what someone typed or pasted: owner/repo, a github.com URL (https, ssh or
 * git@), with or without .git. Undefined for anything else, so it can never become a CLI option,
 * a path or another host.
 */
export function normalizeRepo(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let s = value.trim();
  if (s.length > 200) return undefined;
  s = s.replace(/^(?:https?:\/\/|ssh:\/\/)?(?:[\w.-]+@)?github\.com[/:]/i, '');
  s = s.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  const parts = s.split('/');
  // A URL may go on past the repository (…/owner/repo/issues/12).
  if (parts.length < 2) return undefined;
  const [owner, repo] = parts;
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner)) return undefined;
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) || repo === '.' || repo === '..') return undefined;
  return `${owner}/${repo}`;
}

export function sameRepo(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** What a floor's clone is doing: "Downloading 64%". */
export function cloneStep(p: CloneProgress | undefined): string {
  return `${p?.step ?? 'Cloning'}${p?.percent !== undefined ? ` ${p.percent}%` : '…'}`;
}

/** A floor's clone in a few words, for the floor lists: "⏳ Downloading 64%". */
export function cloneLabel(p: CloneProgress | undefined): string {
  return `⏳ ${cloneStep(p)}`;
}
