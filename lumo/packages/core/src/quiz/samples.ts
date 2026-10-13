import type { Locale } from '../types';
import type { ConceptInput } from './concept';

export interface SampleDeck {
  title: string;
  subject: string;
  language: Locale;
  concepts: ConceptInput[];
}

const cells: SampleDeck = {
  title: 'Cells — the basics',
  subject: 'Science',
  language: 'en',
  concepts: [
    {
      topic: 'Cell structure',
      kind: 'definition',
      term: 'nucleus',
      summary: 'The control centre of the cell that holds the DNA and directs the cell’s activities.',
      keyPoints: ['The nucleus contains DNA, the genetic instructions', 'It controls which proteins the cell makes', 'It is surrounded by a nuclear membrane'],
      misconceptions: ['The nucleus makes energy for the cell', 'Bacteria cells have a nucleus'],
      examples: ['A red blood cell loses its nucleus to make room for more haemoglobin'],
      synonyms: [],
    },
    {
      topic: 'Cell structure',
      kind: 'definition',
      term: 'mitochondria',
      summary: 'Organelles where aerobic respiration releases energy from glucose for the cell.',
      keyPoints: ['Mitochondria carry out aerobic respiration', 'They release energy from glucose using oxygen', 'Very active cells, like muscle cells, have many mitochondria'],
      misconceptions: ['Mitochondria make glucose from sunlight', 'Mitochondria are only found in animal cells'],
      examples: ['Muscle cells in an athlete’s legs are packed with mitochondria'],
      synonyms: ['mitochondrion'],
      causeEffects: [{ cause: 'a cell’s mitochondria stop working', effect: 'the cell can no longer release enough energy and may die' }],
    },
    {
      topic: 'Cell structure',
      kind: 'definition',
      term: 'cell membrane',
      summary: 'A thin, flexible layer around the cell that controls what enters and leaves.',
      keyPoints: ['The cell membrane is partially permeable', 'It controls what enters and leaves the cell', 'Both plant and animal cells have one'],
      misconceptions: ['The cell membrane is rigid and gives the cell its shape', 'Only animal cells have a cell membrane'],
      examples: ['Oxygen passes through the membrane into a cell, but large proteins cannot'],
      synonyms: ['plasma membrane'],
    },
    {
      topic: 'Plant vs animal cells',
      kind: 'definition',
      term: 'chloroplast',
      summary: 'A green organelle in plant cells where photosynthesis makes glucose using light energy.',
      keyPoints: ['Chloroplasts contain chlorophyll, which absorbs light', 'Photosynthesis happens in chloroplasts', 'They are found in plant cells, not animal cells'],
      misconceptions: ['Chloroplasts release energy from glucose', 'All plant cells, even root cells, have chloroplasts'],
      examples: ['Leaf cells in direct sunlight have many chloroplasts'],
      synonyms: ['chloroplasts'],
    },
    {
      topic: 'Plant vs animal cells',
      kind: 'comparison',
      term: 'plant cell',
      summary: 'A cell with a cell wall, a large vacuole and often chloroplasts, as well as the parts animal cells have.',
      keyPoints: ['Plant cells have a cellulose cell wall', 'Plant cells have a large permanent vacuole', 'Many plant cells have chloroplasts'],
      misconceptions: ['Plant cells have no cell membrane because they have a wall', 'Plant cells have no mitochondria'],
      examples: ['An onion skin cell under the microscope shows a clear cell wall'],
      synonyms: ['plant cells'],
      comparison: {
        with: 'animal cell',
        similarities: ['Both have a nucleus, cytoplasm and cell membrane', 'Both have mitochondria for respiration'],
        differences: ['Only plant cells have a cell wall', 'Only plant cells have chloroplasts', 'Plant cells have a large permanent vacuole; animal cells do not'],
      },
      categories: [
        { name: 'Plant cells only', items: ['cell wall', 'chloroplasts', 'permanent vacuole'] },
        { name: 'Both plant and animal cells', items: ['nucleus', 'cell membrane', 'mitochondria', 'cytoplasm'] },
      ],
    },
    {
      topic: 'Movement in and out of cells',
      kind: 'cause_effect',
      term: 'diffusion',
      summary: 'The net movement of particles from an area of higher concentration to an area of lower concentration.',
      keyPoints: ['Particles move from high to low concentration', 'Diffusion is passive and needs no energy', 'A bigger concentration difference makes diffusion faster'],
      misconceptions: ['Diffusion needs energy from respiration', 'Particles only move from low to high concentration'],
      examples: ['The smell of perfume spreads across a room', 'Oxygen moves from the lungs into the blood'],
      synonyms: [],
      causeEffects: [
        { cause: 'the temperature increases', effect: 'particles move faster, so diffusion speeds up' },
        { cause: 'the concentration difference becomes larger', effect: 'diffusion happens faster' },
      ],
    },
    {
      topic: 'Movement in and out of cells',
      kind: 'cause_effect',
      term: 'osmosis',
      summary: 'The diffusion of water through a partially permeable membrane from a dilute solution to a more concentrated one.',
      keyPoints: ['Osmosis is the movement of water molecules only', 'Water moves from a dilute to a more concentrated solution', 'It happens across a partially permeable membrane'],
      misconceptions: ['In osmosis, salt moves into the cell', 'Osmosis moves water from concentrated to dilute solutions'],
      examples: ['A potato chip placed in salty water becomes floppy and shorter', 'Slugs shrivel when salt is sprinkled on them'],
      synonyms: [],
      causeEffects: [
        { cause: 'a red blood cell is placed in pure water', effect: 'water enters by osmosis and the cell swells and may burst' },
        { cause: 'a plant cell is placed in very salty water', effect: 'water leaves the cell and it becomes flaccid' },
      ],
    },
    {
      topic: 'Cell division',
      kind: 'process',
      term: 'mitosis',
      summary: 'Cell division that produces two genetically identical daughter cells for growth and repair.',
      keyPoints: ['Mitosis makes two identical cells', 'It is used for growth and repair', 'The DNA is copied before the cell divides'],
      misconceptions: ['Mitosis produces sex cells', 'The daughter cells of mitosis are genetically different'],
      examples: ['A cut on your skin heals as new skin cells are made'],
      synonyms: [],
      steps: ['The DNA is copied', 'Chromosomes line up in the middle of the cell', 'Copies of each chromosome are pulled to opposite ends', 'The nucleus divides and the cell splits into two'],
    },
    {
      topic: 'Microscopy',
      kind: 'formula',
      term: 'magnification',
      summary: 'How many times bigger the image is than the real object: magnification = image size ÷ actual size.',
      keyPoints: ['Magnification = image size ÷ actual size', 'Both sizes must be in the same units', 'Magnification has no units'],
      misconceptions: ['Magnification = actual size ÷ image size', 'Higher magnification always shows more detail'],
      examples: ['A cell 0.02 mm wide looks 8 mm wide in a drawing'],
      synonyms: [],
      formula: {
        expression: 'I / A',
        result: { symbol: 'M', name: 'the magnification' },
        variables: [
          { symbol: 'I', name: 'image size', unit: 'mm', min: 2, max: 40, step: 2 },
          { symbol: 'A', name: 'actual size', unit: 'mm', min: 0.01, max: 0.1, step: 0.01 },
        ],
      },
    },
  ],
};

const photosynthese: SampleDeck = {
  title: 'La photosynthèse',
  subject: 'Sciences',
  language: 'fr',
  concepts: [
    {
      topic: 'Le processus',
      kind: 'process',
      term: 'photosynthèse',
      summary: 'Processus par lequel les plantes fabriquent du glucose à partir d’eau et de dioxyde de carbone grâce à l’énergie lumineuse.',
      keyPoints: ['La plante utilise l’énergie de la lumière', 'Elle transforme l’eau et le CO2 en glucose', 'Elle rejette de l’oxygène'],
      misconceptions: ['Les plantes tirent leur nourriture du sol', 'La photosynthèse produit du dioxyde de carbone'],
      examples: ['Une plante placée dans le noir pendant une semaine jaunit et s’affaiblit'],
      synonyms: [],
      steps: ['La chlorophylle capte la lumière', 'L’eau est absorbée par les racines et monte jusqu’aux feuilles', 'Le CO2 entre par les stomates', 'Le glucose est fabriqué et l’oxygène est rejeté'],
      causeEffects: [{ cause: 'on augmente l’intensité lumineuse', effect: 'la photosynthèse s’accélère, jusqu’à une certaine limite' }],
    },
    {
      topic: 'Les structures',
      kind: 'definition',
      term: 'chloroplaste',
      summary: 'Organite vert des cellules végétales où se déroule la photosynthèse.',
      keyPoints: ['Le chloroplaste contient la chlorophylle', 'La photosynthèse a lieu dans le chloroplaste', 'On le trouve surtout dans les cellules des feuilles'],
      misconceptions: ['Les chloroplastes sont présents dans les cellules animales', 'Le chloroplaste sert à respirer'],
      examples: ['Au microscope, les cellules d’une feuille d’élodée montrent de petits grains verts'],
      synonyms: ['chloroplastes'],
    },
    {
      topic: 'Les structures',
      kind: 'definition',
      term: 'stomate',
      summary: 'Petite ouverture sous la feuille qui laisse entrer le CO2 et sortir l’oxygène et la vapeur d’eau.',
      keyPoints: ['Les stomates permettent les échanges de gaz', 'Le CO2 entre par les stomates', 'Ils se ferment pour limiter la perte d’eau'],
      misconceptions: ['Les stomates absorbent l’eau du sol', 'Les stomates sont toujours ouverts'],
      examples: ['Par temps très sec, la plante ferme ses stomates'],
      synonyms: ['stomates'],
      causeEffects: [{ cause: 'les stomates se ferment par temps sec', effect: 'moins de CO2 entre et la photosynthèse ralentit' }],
    },
    {
      topic: 'Le processus',
      kind: 'comparison',
      term: 'respiration cellulaire',
      summary: 'Processus qui libère l’énergie du glucose en utilisant de l’oxygène et qui rejette du CO2 et de l’eau.',
      keyPoints: ['La respiration libère l’énergie du glucose', 'Elle utilise de l’oxygène', 'Elle a lieu jour et nuit dans toutes les cellules vivantes'],
      misconceptions: ['Les plantes ne respirent pas', 'La respiration a lieu seulement la nuit chez les plantes'],
      examples: ['Une graine qui germe dans le noir libère du CO2'],
      synonyms: ['respiration'],
      comparison: {
        with: 'la photosynthèse',
        similarities: ['Les deux concernent le glucose, le CO2, l’eau et l’oxygène', 'Les deux ont lieu chez les plantes'],
        differences: ['La photosynthèse stocke de l’énergie, la respiration en libère', 'La photosynthèse a besoin de lumière, pas la respiration', 'La photosynthèse rejette de l’oxygène, la respiration en consomme'],
      },
      categories: [
        { name: 'Entrées de la photosynthèse', items: ['eau', 'dioxyde de carbone', 'lumière'] },
        { name: 'Sorties de la photosynthèse', items: ['glucose', 'oxygène'] },
      ],
    },
    {
      topic: 'Les facteurs',
      kind: 'cause_effect',
      term: 'facteur limitant',
      summary: 'Facteur qui, s’il manque, empêche la photosynthèse d’aller plus vite, comme la lumière, le CO2 ou la température.',
      keyPoints: ['La lumière, le CO2 et la température peuvent être limitants', 'Augmenter un facteur non limitant ne change rien', 'Le facteur le plus faible fixe la vitesse'],
      misconceptions: ['Plus de lumière accélère toujours la photosynthèse', 'La température n’a aucun effet'],
      examples: ['En serre, on ajoute du CO2 pour faire pousser les tomates plus vite'],
      synonyms: ['facteurs limitants'],
      causeEffects: [
        { cause: 'la température devient trop élevée', effect: 'les enzymes sont abîmées et la photosynthèse s’arrête' },
        { cause: 'on ajoute du CO2 dans une serre bien éclairée', effect: 'la photosynthèse s’accélère' },
      ],
    },
    {
      topic: 'Les facteurs',
      kind: 'formula',
      term: 'vitesse de photosynthèse',
      summary: 'On peut mesurer la vitesse de photosynthèse en comptant les bulles d’oxygène par minute : vitesse = bulles ÷ temps.',
      keyPoints: ['Vitesse = nombre de bulles ÷ temps', 'Plus de bulles par minute signifie une photosynthèse plus rapide'],
      misconceptions: ['Les bulles sont du dioxyde de carbone'],
      examples: ['Une élodée sous une lampe produit des bulles d’oxygène'],
      synonyms: [],
      formula: {
        expression: 'n / t',
        result: { symbol: 'v', name: 'la vitesse (bulles par minute)', unit: 'bulles/min' },
        variables: [
          { symbol: 'n', name: 'nombre de bulles', min: 12, max: 90, step: 6 },
          { symbol: 't', name: 'temps', unit: 'min', min: 2, max: 6 },
        ],
      },
    },
  ],
};

export const SAMPLE_DECKS: Record<Locale, SampleDeck> = { en: cells, fr: photosynthese };
