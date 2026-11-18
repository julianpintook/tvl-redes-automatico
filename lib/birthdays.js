// Cumpleaños de conductores, periodistas, etc.: próxima fecha, días que faltan y etapa de alerta.
import { diffDays, todayISO } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Fecha del cumpleaños en un año dado (29/2 cae el 28/2 en años no bisiestos). */
export function birthdayIn(year, day, month) {
  const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return `${year}-${pad(month)}-${pad(d)}`;
}

/** Próximo cumpleaños desde `today` (hoy incluido). */
export function nextBirthday(day, month, today = todayISO()) {
  const y = Number(today.slice(0, 4));
  const thisYear = birthdayIn(y, day, month);
  return thisYear >= today ? thisYear : birthdayIn(y + 1, day, month);
}

/** Días que faltan para el próximo cumpleaños (0 = hoy). */
export const daysUntil = (day, month, today = todayISO()) => diffDays(today, nextBirthday(day, month, today));

/**
 * Etapa de alerta: 'day' (hoy), 'week' (faltan 1 a 7 días), 'month' (faltan 8 a 31 días) o null.
 */
export function alertStage(days) {
  if (days === 0) return 'day';
  if (days >= 1 && days <= 7) return 'week';
  if (days >= 8 && days <= 31) return 'month';
  return null;
}

export const STAGE_LABEL = { month: 'Este mes', week: 'Esta semana', day: '¡Hoy!' };

/** Edad que cumple (si se conoce el año). */
export const turningAge = (year, nextISO) => (year ? Number(nextISO.slice(0, 4)) - Number(year) : null);

/** "en 5 días" / "mañana" / "hoy". */
export function whenText(days) {
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} días`;
}
