const NAIROBI_TIME_ZONE = "Africa/Nairobi";

const formatParts = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NAIROBI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(byType.year);
  const month = Number(byType.month);
  const day = Number(byType.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  return { year, month, day };
};

const isValidCalendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
};

const parseNairobiDateOnly = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!isValidCalendarDate(year, month, day)) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

const getNairobiDateParts = (value) => formatParts(value);

const startOfNairobiDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    if (typeof value === "string") return parseNairobiDateOnly(value);
    return null;
  }

  const parts = formatParts(date);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
};

const toDateOnlyValue = (value) => {
  const date = startOfNairobiDay(value);
  return date
    ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
    : null;
};

const addCalendarDays = (value, days) => {
  const date = startOfNairobiDay(value);
  if (!date || !Number.isInteger(days)) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
};

const compareNairobiDateOnly = (left, right) => {
  const leftDate = startOfNairobiDay(left);
  const rightDate = startOfNairobiDay(right);
  if (!leftDate || !rightDate) return null;
  return leftDate.getTime() - rightDate.getTime();
};

module.exports = {
  NAIROBI_TIME_ZONE,
  parseNairobiDateOnly,
  getNairobiDateParts,
  startOfNairobiDay,
  toDateOnlyValue,
  addCalendarDays,
  compareNairobiDateOnly,
  isValidCalendarDate,
};
