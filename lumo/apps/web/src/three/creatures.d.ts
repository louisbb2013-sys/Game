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
export class Etincelles {
  constructor(n: number, temps: { value: number }, o?: Record<string, any>);
  points: THREE_NS.Points;
  mat: THREE_NS.ShaderMaterial;
  actives: number;
  emettre(origine: THREE_NS.Vector3, couleurs: string | string[], nombre?: number, vitesse?: number, taille?: number): void;
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
  eclats: THREE_NS.Points | null;
  sauter(force?: number): void;
  maj(t: number, dt: number): void;
  centre(v: THREE_NS.Vector3): THREE_NS.Vector3;
}
