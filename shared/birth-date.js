// Calendar dates are compared in the municipality's timezone, never as elapsed years.
export function validateBirthDate(value, now = new Date()) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { error: 'Informe a data de nascimento.' };
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { error: 'Informe uma data de nascimento válida no formato DD/MM/AAAA.' };
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(`${iso}T12:00:00Z`);
  if (year < 1 || !Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return { error: 'Informe uma data de nascimento válida.' };
  }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const today = Object.fromEntries(parts.map(part => [part.type, part.value]));
  if (iso > `${today.year}-${today.month}-${today.day}`) return { error: 'A data de nascimento não pode estar no futuro.' };
  const birthdayPending = `${today.month}-${today.day}` < iso.slice(5);
  const age = Number(today.year) - year - (birthdayPending ? 1 : 0);
  if (age < 18) return { error: 'O cadastro é permitido somente para pessoas com 18 anos completos ou mais.' };
  return { birthDate: iso, error: '' };
}
