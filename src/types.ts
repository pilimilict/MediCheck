// Shared domain types for MediCheck.
// Variable/function names in English; UI strings in Spanish.

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Medication {
  id: string;
  name: string;
  dose: string;
  times: string[]; // "HH:mm"
  days: Weekday[]; // empty => every day
  photo?: string; // base64 data URL (compressed)
  createdAt: number;
}

export interface DoseLog {
  id: string;
  medicationId: string;
  date: string; // YYYY-MM-DD
  time: string; // scheduled "HH:mm"
  takenAt: number | null; // epoch ms or null
}

export type View = 'home' | 'admin' | 'history' | 'settings';