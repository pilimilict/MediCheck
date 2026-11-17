// Generate an iCalendar (.ics) file with daily recurrence and a sound alarm.

import type { Medication } from '../types';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toIcsDate(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

export function buildIcs(med: Medication, time: string): string {
  const [hh, mm] = time.split(':').map(Number);
  const now = new Date();
  const start = new Date();
  start.setHours(hh, mm, 0, 0);
  // If time already passed today, start tomorrow
  if (start.getTime() < now.getTime()) {
    start.setDate(start.getDate() + 1);
  }
  const end = new Date(start.getTime() + 5 * 60 * 1000);
  const uid = `${med.id}-${time}@medicheck`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MediCheck//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:Tomar ${med.name} (${med.dose})`,
    `DESCRIPTION:Recordatorio de MediCheck: ${med.name}, ${med.dose}.`,
    'RRULE:FREQ=DAILY',
    'BEGIN:VALARM',
    'TRIGGER:-PT5M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Hora de tomar ${med.name}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export function downloadIcs(med: Medication, time: string): void {
  const content = buildIcs(med, time);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `medicheck-${med.name}-${time}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}