// Cuentas sin cubrir: un día en que todas las personas que manejan una cuenta están ausentes
// (vacaciones, día pedido u otro sector) o de franco, y no hay reemplazo cargado que la tome.
// Si todos están solo de franco (fin de semana normal) no se avisa.
// (Copia idéntica en worker/lib/accountCoverage.js)
import { WORKING } from './shifts.js';

const ABSENT = (s) => s === 'vacation' || s === 'dayoff' || String(s).startsWith('external_');

/**
 * @param {{dates:string[], team:object[], shiftOf:(uid:string,date:string)=>{shift:string}, replacements:object[]}} p
 * @returns {{date:string, account:string, absent:{uid:string, shift:string}[]}[]}
 */
export function uncoveredAccounts({ dates, team, shiftOf, replacements = [] }) {
  const uidOf = (u) => u.uid || u.id;
  const accounts = [...new Set(team.flatMap((u) => u.assignedChannels || []))];
  const out = [];
  for (const date of dates) {
    const shifts = Object.fromEntries(team.map((u) => [uidOf(u), shiftOf(uidOf(u), date).shift]));
    for (const account of accounts) {
      const owners = team.filter((u) => (u.assignedChannels || []).includes(account));
      if (!owners.length) continue;
      if (owners.some((u) => WORKING.has(shifts[uidOf(u)]))) continue;
      const absent = owners.filter((u) => ABSENT(shifts[uidOf(u)]));
      if (!absent.length) continue;
      const covered = replacements.some(
        (r) => r.startDate <= date && r.endDate >= date && absent.some((u) => uidOf(u) === r.absentUserId) && (!(r.accounts || []).length || r.accounts.includes(account))
      );
      if (covered) continue;
      out.push({ date, account, absent: absent.map((u) => ({ uid: uidOf(u), shift: shifts[uidOf(u)] })) });
    }
  }
  return out;
}
