// Horas extras "a mes vencido": el período de un mes M va del 16 del mes anterior al 15 de M,
// y se presenta en el mes siguiente. Ej.: período noviembre 2026 = 16/10/2026 al 15/11/2026, se presenta en diciembre.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM' desplazado n meses. */
export function shiftPeriod(period, n) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Período al que pertenece una fecha 'YYYY-MM-DD': del 16 en adelante cuenta para el mes siguiente. */
export function periodOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  const base = `${y}-${pad(m)}`;
  return d >= 16 ? shiftPeriod(base, 1) : base;
}

/** Rango de fechas del período: { start: 16 del mes anterior, end: 15 del mes }. */
export function periodRange(period) {
  const prev = shiftPeriod(period, -1);
  return { start: `${prev}-16`, end: `${period}-15` };
}

/** Nombre del mes de un período: '2026-11' → 'noviembre 2026'. */
export function periodLabel(period) {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Mes en que se presenta: el siguiente al período. */
export function presentedIn(period) {
  return periodLabel(shiftPeriod(period, 1));
}

/** Horas entre 'HH:MM' y 'HH:MM' (si la salida es menor, cruza la medianoche). Redondeo a 2 decimales. */
export function hoursBetween(start, end) {
  if (!start || !end) return 0;
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  let mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

/** 2.5 → '2,5' */
export const formatHours = (h) => (Number(h) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
