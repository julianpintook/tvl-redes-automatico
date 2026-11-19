// Huecos en la grilla: días próximos sin nadie de Mañana o de Tarde, o con mucha gente de vacaciones a la vez.
// Función pura (la usa la app y el proceso automático): recibe `shiftOf(uid, date)`.
import { addDays } from './dates.js';

export const MORNING = ['morning', 'reinforcement_morning'];
// El mediodía cuenta como Turno Tarde.
export const AFTERNOON = ['afternoon', 'midday', 'reinforcement_midday'];
export const MANY_ON_VACATION = 3;

/**
 * @returns {{date, noMorning, noAfternoon, onVacation: number}[]} solo los días con algún problema.
 */
export function findGaps({ teamIds, shiftOf, from, days = 21 }) {
  const out = [];
  if (!teamIds.length) return out;
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const shifts = teamIds.map((uid) => shiftOf(uid, date).shift);
    const noMorning = !shifts.some((s) => MORNING.includes(s));
    const noAfternoon = !shifts.some((s) => AFTERNOON.includes(s));
    const onVacation = shifts.filter((s) => s === 'vacation').length;
    if (noMorning || noAfternoon || onVacation >= MANY_ON_VACATION) out.push({ date, noMorning, noAfternoon, onVacation });
  }
  return out;
}

export function gapText(g) {
  const parts = [];
  if (g.noMorning && g.noAfternoon) parts.push('no hay nadie de Mañana ni de Tarde');
  else if (g.noMorning) parts.push('no hay nadie de Mañana');
  else if (g.noAfternoon) parts.push('no hay nadie de Tarde');
  if (g.onVacation >= MANY_ON_VACATION) parts.push(`hay ${g.onVacation} personas de vacaciones`);
  return parts.join(' y ');
}
