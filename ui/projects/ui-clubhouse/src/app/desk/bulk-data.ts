export interface BulkRow { title: string; start: number; id?: number; duplicate?: boolean }
export function parseBulk(text: string, now = Date.now() / 1000): BulkRow[] {
  const lines = text.split(/\r?\n/).filter(s => s.trim());
  if (!lines.length || lines.length > 60) throw new Error('Enter between 1 and 60 events.');
  const seen = new Set<string>();
  return lines.map((line, i) => {
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\|\s*(.+)$/.exec(line.trim());
    if (!match) throw new Error(`Line ${i + 1}: use YYYY-MM-DD HH:mm | Title.`);
    const date = new Date(`${match[1]}T${match[2]}`); const start = date.getTime() / 1000; const title = match[3].trim();
    const local = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    if (!Number.isFinite(start) || local !== `${match[1]} ${match[2]}` || start <= now) throw new Error(`Line ${i + 1}: choose a valid future date and time.`);
    if ([...title].length > 80) throw new Error(`Line ${i + 1}: title must be at most 80 characters.`);
    const key = `${start}|${title}`; if (seen.has(key)) throw new Error(`Line ${i + 1}: duplicate event.`); seen.add(key);
    return { title, start };
  });
}
/** Actual dates, not the weekday substituted for federal employees' leave. */
export function usHolidays(year: number): string {
  if (!Number.isInteger(year) || year < 2026 || year > 2100) throw new Error('Choose a year from 2026 to 2100.');
  const nth = (month: number, weekday: number, n: number) => 1 + (weekday - new Date(year, month-1, 1).getDay() + 7) % 7 + (n-1)*7;
  const lastMonday = 31 - (new Date(year, 4, 31).getDay() + 6) % 7;
  const dates: [number, number, string][] = [[1,1,"New Year's Day"],[1,nth(1,1,3),'Martin Luther King Jr. Day'],[2,nth(2,1,3),"Washington’s Birthday"],[5,lastMonday,'Memorial Day'],[6,19,'Juneteenth'],[7,4,'Independence Day'],[9,nth(9,1,1),'Labor Day'],[10,nth(10,1,2),'Columbus Day'],[11,11,'Veterans Day'],[11,nth(11,4,4),'Thanksgiving Day'],[12,25,'Christmas Day']];
  return dates.map(([m,d,title]) => `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')} 12:00 | ${title}`).join('\n');
}
