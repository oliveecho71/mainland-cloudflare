const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const displayFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function parts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Object.fromEntries(partsFormatter.formatToParts(date).map(part => [part.type, part.value]));
}

export function shanghaiDayKey(value: string | Date) {
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}`;
}

export function shanghaiTime(value: string | Date) {
  const p = parts(value);
  return `${p.hour}:${p.minute}`;
}

export function shanghaiInput(value: string | Date) {
  return `${shanghaiDayKey(value)}T${shanghaiTime(value)}`;
}

export function shanghaiDateTime(value: string | Date) {
  return displayFormatter.format(value instanceof Date ? value : new Date(value));
}

export function shanghaiRange(start: string, end: string) {
  return `${shanghaiDateTime(start)}–${shanghaiDayKey(start) === shanghaiDayKey(end) ? shanghaiTime(end) : shanghaiDateTime(end)}`;
}

function lessonDays(start: string, end: string) {
  const first = Date.parse(start), afterLast = Date.parse(end);
  if (!Number.isFinite(first) || !Number.isFinite(afterLast) || afterLast <= first) return null;
  return { first: shanghaiDayKey(start), last: shanghaiDayKey(new Date(afterLast - 1)) };
}

export function lessonOccursOnDay(start: string, end: string, dayKey: string) {
  const days = lessonDays(start, end);
  return !!days && days.first <= dayKey && dayKey <= days.last;
}

export function lessonOccursInMonth(start: string, end: string, monthKey: string) {
  const days = lessonDays(start, end);
  return !!days && days.first.slice(0, 7) <= monthKey && monthKey <= days.last.slice(0, 7);
}

export function lessonCalendarLabel(start: string, end: string, dayKey: string) {
  const days = lessonDays(start, end);
  if (!days || dayKey < days.first || dayKey > days.last) return "";
  if (dayKey === days.first) return `${shanghaiTime(start)} 开始`;
  if (dayKey === days.last) return `${shanghaiTime(end)} 结束`;
  return "课程进行中";
}

export function parseShanghaiDateTime(value: string): Date | null {
  const wall = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (wall) {
    const [, year, month, day, hour, minute, second = "0"] = wall;
    const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) - SHANGHAI_OFFSET_MS);
    return shanghaiInput(date) === value.slice(0, 16) ? date : null;
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
