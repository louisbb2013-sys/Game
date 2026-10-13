import { describe, expect, it } from 'vitest';
import { extractFromText, FORMATS, generateLocal, seededRng, supportsFormat } from '../src';

const NOTES = `# The Water Cycle

Evaporation is when water turns into vapour because of the sun's heat.
Condensation is the process where water vapour cools and turns into droplets, forming clouds.
Precipitation: water falling from clouds as rain, snow or hail.
For example, morning dew on grass is condensation.
If the temperature drops, more water vapour condenses.

Stages of the water cycle:
1. Water evaporates from oceans
2. Vapour rises and cools
3. Clouds form by condensation
4. Rain falls back to the ground

Vocabulary
transpiration\tWater released by plants through their leaves
runoff - Water that flows over the ground into rivers`;

describe('offline extractor', () => {
  it('finds definitions, processes, examples, causes and tab exports', () => {
    const r = extractFromText(NOTES, 'en');
    const terms = r.concepts.map((c) => c.term.toLowerCase());
    expect(terms).toEqual(expect.arrayContaining(['evaporation', 'condensation', 'precipitation', 'transpiration', 'runoff', 'stages of the water cycle']));
    const cond = r.concepts.find((c) => c.term === 'Condensation')!;
    expect(cond.examples[0]).toMatch(/dew/);
    expect(r.concepts.find((c) => c.kind === 'process')!.steps).toHaveLength(4);
    expect(r.concepts.some((c) => c.causeEffects?.length)).toBe(true);
    expect(r.title).toBe('The Water Cycle');
  });

  it('reads French notes', () => {
    const r = extractFromText('La photosynthèse est la fabrication de glucose grâce à la lumière.\nUn stomate désigne une petite ouverture de la feuille.', 'fr');
    expect(r.concepts.map((c) => c.term)).toEqual(['photosynthèse', 'stomate']);
  });

  it('produces concepts the quiz engine can use', () => {
    const r = extractFromText(NOTES, 'en');
    const deck = r.concepts.map((c, i) => ({ ...c, id: `x${i}` }));
    let made = 0;
    for (const c of deck) for (const f of FORMATS) if (supportsFormat(c, f, deck) && generateLocal(c, f, 'understand', { deck, language: 'en', rng: seededRng(1) })) made++;
    expect(made).toBeGreaterThan(20);
  });
});
