function dateYearsBefore(date, years) {
  const year = date.getUTCFullYear() - years;
  const month = date.getUTCMonth();
  const day = Math.min(
    date.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  );

  return new Date(Date.UTC(year, month, day));
}

function generateBirthDateForAge(age, today = new Date(), random = Math.random) {
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    throw new RangeError("Age must be an integer between 0 and 120.");
  }
  if (typeof random !== "function") {
    throw new TypeError("random must be a function.");
  }

  const currentDate = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  ));
  const firstPossibleDate = dateYearsBefore(currentDate, age + 1);
  firstPossibleDate.setUTCDate(firstPossibleDate.getUTCDate() + 1);
  const lastPossibleDate = dateYearsBefore(currentDate, age);
  const dayCount = Math.round(
    (lastPossibleDate.getTime() - firstPossibleDate.getTime()) / 86400000
  ) + 1;
  const offset = Math.floor(random() * dayCount);

  if (!Number.isFinite(offset) || offset < 0 || offset >= dayCount) {
    throw new RangeError("random must return a value between 0 and 1.");
  }

  firstPossibleDate.setUTCDate(firstPossibleDate.getUTCDate() + offset);
  return firstPossibleDate;
}

module.exports = { generateBirthDateForAge };
