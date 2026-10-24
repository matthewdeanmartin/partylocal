// Typed times, for UIs that take them as text: "fri 7pm", "tomorrow 18:30",
// "2026-11-07 19:00", "nov 7 7:30pm". Local time, Unix seconds out.

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The time of day in `text` ("7pm", "19:30", "7.30 pm", "noon"), as [hour, minute]. */
function clock(text: string): [number, number] | null {
  if (/\bnoon\b/.test(text)) return [12, 0];
  if (/\bmidnight\b/.test(text)) return [0, 0];
  // The first number that looks like a time ("7" in "nov 7 7pm" is the date).
  const all = text.replace(/\b\d{4}-\d{2}-\d{2}\b/, '').matchAll(/\b(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a|p)?\b/g);
  const m = [...all].find((x) => x[2] || x[3]);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const half = m[3]?.[0];
  if (half === 'p' && h < 12) h += 12;
  if (half === 'a' && h === 12) h = 0;
  return h < 24 && min < 60 ? [h, min] : null;
}

/** Unix seconds for `text`, or 0 if it isn't a time. `defaultHour` fills a bare day. */
export function parseWhen(raw: string, now = new Date(), defaultHour = 19): number {
  const text = raw.trim().toLowerCase();
  if (!text) return 0;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2}))?/.exec(text);
  const d = new Date(now);
  d.setSeconds(0, 0);
  let dated = false;
  let weekday = false;
  if (iso) {
    d.setFullYear(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (iso[4]) d.setHours(Number(iso[4]), Number(iso[5]));
    dated = true;
    if (iso[4]) return Math.floor(d.getTime() / 1000);
  } else if (/\btoday|tonight\b/.test(text)) {
    dated = true;
  } else if (/\btomorrow|tmrw\b/.test(text)) {
    d.setDate(d.getDate() + 1);
    dated = true;
  } else {
    const day = DAYS.findIndex((x) => new RegExp(`\\b${x}`).test(text));
    const month = MONTHS.findIndex((x) => new RegExp(`\\b${x}`).test(text));
    const date = /\b(\d{1,2})(?:st|nd|rd|th)?\b/.exec(text.replace(/\b\d{1,2}([:.]\d{2})?\s*(am|pm|a|p)\b|\b\d{1,2}[:.]\d{2}\b/g, ''));
    if (month >= 0 && date) {
      d.setMonth(month, Number(date[1]));
      if (d.getTime() < now.getTime() - 86_400_000) d.setFullYear(d.getFullYear() + 1);
      dated = true;
    } else if (day >= 0) {
      d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || (/\bnext\b/.test(text) ? 7 : 0)));
      dated = true;
      weekday = true;
    }
  }
  const t = clock(text);
  if (!dated && !t) return 0;
  if (t) d.setHours(t[0], t[1]);
  else d.setHours(/\btonight\b/.test(text) ? 19 : defaultHour, 0);
  // "7pm" alone means the next 7pm; "fri" late on a Friday, next Friday.
  if (!dated && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  if (weekday && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
  return Math.floor(d.getTime() / 1000);
}

/** A few likely times from now, for chips and pickers. */
export function suggestTimes(now = new Date()): { label: string; at: number }[] {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  };
  const until = (weekday: number) => ((weekday - now.getDay() + 7) % 7) || 7;
  const out = [
    { label: 'Tonight, 7pm', at: at(0, 19) },
    { label: 'Tomorrow, 7pm', at: at(1, 19) },
    { label: 'Friday, 7pm', at: at(until(5), 19) },
    { label: 'Saturday, 10am', at: at(until(6), 10) },
    { label: 'Sunday, 2pm', at: at(until(0), 14) },
  ];
  return out.filter((o) => o.at > now.getTime() / 1000 + 1800);
}
