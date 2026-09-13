export const dateInput = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function monthDays(month) {
  const first = new Date(month + '-01T12:00:00');
  const start = new Date(first); start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => { const d = new Date(start); d.setDate(start.getDate() + index); return dateInput(d); });
}
export function plansOnDay(plans, day) {
  const start = new Date(day + 'T00:00:00'), end = new Date(start); end.setDate(end.getDate() + 1);
  return plans.filter(p => p.start < end.getTime() && p.end > start.getTime()).sort((a,b)=>a.start-b.start);
}
