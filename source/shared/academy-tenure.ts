export type AcademyTenure = {
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  totalDays: number;
  asOfDate: string;
};

export function calendarToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function anniversary(start: Date, months: number): Date {
  const anchor = new Date(start);
  anchor.setUTCDate(1);
  anchor.setUTCMonth(anchor.getUTCMonth() + months);
  const endOfMonth = new Date(anchor);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
  anchor.setUTCDate(Math.min(start.getUTCDate(), endOfMonth.getUTCDate()));
  return anchor;
}

export function getAcademyTenure(
  joinDate?: string | null,
  asOfDate = calendarToday()
): AcademyTenure | null {
  if (
    !joinDate ||
    !isValidCalendarDate(joinDate) ||
    !isValidCalendarDate(asOfDate) ||
    joinDate > asOfDate
  )
    return null;
  const start = new Date(`${joinDate}T00:00:00.000Z`);
  const end = new Date(`${asOfDate}T00:00:00.000Z`);
  let totalMonths =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth();
  if (anniversary(start, totalMonths).getTime() > end.getTime())
    totalMonths -= 1;
  const anchor = anniversary(start, totalMonths);
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: Math.floor((end.getTime() - anchor.getTime()) / 86_400_000),
    totalMonths,
    totalDays: Math.floor((end.getTime() - start.getTime()) / 86_400_000),
    asOfDate,
  };
}

function arabicUnit(
  count: number,
  one: string,
  two: string,
  plural: string,
  many: string
): string {
  if (count === 1) return one;
  if (count === 2) return two;
  return `${count} ${count >= 3 && count <= 10 ? plural : many}`;
}

export function formatAcademyTenure(
  joinDate?: string | null,
  asOfDate = calendarToday()
): string {
  if (!joinDate || !isValidCalendarDate(joinDate))
    return "لم يُحدد تاريخ الانضمام";
  if (!isValidCalendarDate(asOfDate)) return "تاريخ المتابعة غير صالح";
  if (joinDate > asOfDate) return "قبل تاريخ الانضمام المدخل";
  const tenure = getAcademyTenure(joinDate, asOfDate)!;
  if (tenure.totalDays === 0) return "يوم الانضمام";
  return [
    tenure.years
      ? arabicUnit(tenure.years, "سنة واحدة", "سنتان", "سنوات", "سنة")
      : "",
    tenure.months
      ? arabicUnit(tenure.months, "شهر واحد", "شهران", "أشهر", "شهرًا")
      : "",
    tenure.days
      ? arabicUnit(tenure.days, "يوم واحد", "يومان", "أيام", "يومًا")
      : "",
  ]
    .filter(Boolean)
    .join(" و");
}

export const ACADEMY_TENURE_NOTE =
  "مدة تقويمية منذ الانضمام، وليست عدد جلسات تدريب أو دليلًا على أن مدة التدريب وحدها سببت تغير الأداء.";
