/* Types for the plain-JavaScript creature engine (creatures.js). */
import type * as THREE_NS from 'three';
/* eslint-disable @typescript-eslint/no-explicit-any */
export const THREE: typeof THREE_NS;
export const PALETTE: Record<string, Record<string, string>>;
export function webgl2Dispo(): boolean;
export function lumieres(): Record<string, { value: any }>;
export function solide(color: string, L: Record<string, { value: any }>, o?: Record<string, any>): THREE_NS.ShaderMaterial;
export function ellipsoide(sx: number, sy: number, sz: number, seg?: number): THREE_NS.BufferGeometry;
export function ombre(): THREE_NS.Mesh;
/** Point-sprite material; `px` / `echelle` may be shared uniform objects (updated once per view). */
export function matierePoints(o?: { temps?: { value: number }; forme?: number; flotte?: number; eclat?: number; px?: { value: number }; echelle?: { value: number } }): THREE_NS.ShaderMaterial;
export function nuageDePoints(
  liste: { pos: number[]; couleur: string; taille: number; alpha?: number; seed?: number[]; rot?: number }[],
  mat: THREE_NS.ShaderMaterial,
): THREE_NS.Points;
export class Etincelles {
  constructor(n: number, temps: { value: number }, o?: Record<string, any>);
  points: THREE_NS.Points;
  mat: THREE_NS.ShaderMaterial;
  actives: number;
  /** With `dir`, a jet in that direction (fire breath, water spout) instead of a burst. */
  emettre(origine: THREE_NS.Vector3, couleurs: string | string[], nombre?: number, vitesse?: number, taille?: number, dir?: THREE_NS.Vector3 | null, cone?: number): void;
  maj(dt: number): void;
}
export class Creature {
  constructor(id: string, L: Record<string, { value: any }>, o?: Record<string, any>);
  groupe: THREE_NS.Group;
  yaw: number;
  y: number;
  cibleYaw: number;
  ciblePitch: number;
  cibleGlow: number;
  /** True while no finger or mouse is on it: it then looks around and does its own little tricks. */
  regardLibre: boolean;
  /** Set by the stage: how the creature's own effects (embers, bubbles, spout…) reach the view's sparks. */
  emettre: ((origine: THREE_NS.Vector3, couleurs: string | string[], nombre?: number, vitesse?: number, taille?: number, dir?: THREE_NS.Vector3 | null) => void) | null;
  sauter(force?: number): void;
  maj(t: number, dt: number): void;
  centre(v: THREE_NS.Vector3): THREE_NS.Vector3;
}
