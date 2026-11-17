// Optional sample data for quick testing.

import type { Medication } from '../types';

export const SEED_MEDICATIONS: Medication[] = [
  {
    id: 'seed-1',
    name: 'Losartán',
    dose: '1 pastilla',
    times: ['08:00', '20:00'],
    days: [],
    createdAt: Date.now(),
  },
  {
    id: 'seed-2',
    name: 'Metformina',
    dose: '1 pastilla',
    times: ['09:00', '21:00'],
    days: [],
    createdAt: Date.now(),
  },
  {
    id: 'seed-3',
    name: 'Vitamina D',
    dose: '2 gotas',
    times: ['10:00'],
    days: [1, 3, 5],
    createdAt: Date.now(),
  },
];