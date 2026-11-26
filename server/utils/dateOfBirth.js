const {
  NAIROBI_TIME_ZONE,
  addCalendarDays,
  getNairobiDateParts,
  parseNairobiDateOnly,
  startOfNairobiDay,
  toDateOnlyValue,
} = require("./nairobiDate");

function parseDateOfBirth(value) {
  return parseNairobiDateOnly(value);
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getBirthdayParts(dateOfBirth, year) {
  const birthParts = getNairobiDateParts(dateOfBirth);
  if (!birthParts) return null;

  if (birthParts.month === 2 && birthParts.day === 29) {
    return { month: 2, day: isLeapYear(year) ? 29 : 28 };
  }

  return { month: birthParts.month, day: birthParts.day };
}

function ageFromDateOfBirth(dateOfBirth, today = new Date()) {
  const birthParts = getNairobiDateParts(dateOfBirth);
  const todayParts = getNairobiDateParts(today);
  if (!birthParts || !todayParts) return null;

  const birthday = getBirthdayParts(dateOfBirth, todayParts.year);
  let age = todayParts.year - birthParts.year;
  if (
    todayParts.month < birthday.month ||
    (todayParts.month === birthday.month && todayParts.day < birthday.day)
  ) {
    age -= 1;
  }
  return age;
}

function isValidDonorDateOfBirth(dateOfBirth, today = new Date()) {
  const eligibility = getDonorEligibility(dateOfBirth, today);
  if (!eligibility.eligibleFrom) return false;

  const todayDate = startOfNairobiDay(today);
  const eligibleFrom = startOfNairobiDay(eligibility.eligibleFrom);
  return Boolean(
    todayDate && eligibleFrom && todayDate.getTime() >= eligibleFrom.getTime() &&
    eligibility.age !== null && eligibility.age <= 100
  );
}

function getDonorEligibility(dateOfBirth, today = new Date()) {
  const birthParts = getNairobiDateParts(dateOfBirth);
  if (!birthParts) {
    return { isValid: false, age: null, eligibleFrom: null };
  }

  const age = ageFromDateOfBirth(dateOfBirth, today);
  const eighteenthYear = birthParts.year + 18;
  const birthday = getBirthdayParts(dateOfBirth, eighteenthYear);
  if (!birthday) {
    return { isValid: false, age: null, eligibleFrom: null };
  }
  const anniversary = parseNairobiDateOnly(
    `${eighteenthYear}-${String(birthday.month).padStart(2, "0")}-${String(birthday.day).padStart(2, "0")}`
  );
  const eligibleFrom = anniversary
    ? addCalendarDays(startOfNairobiDay(anniversary), 1)
    : null;

  const todayDate = startOfNairobiDay(today);
  const isValid = Boolean(
    todayDate && eligibleFrom && todayDate.getTime() >= eligibleFrom.getTime() &&
    age !== null && age <= 100
  );

  return {
    isValid,
    age,
    eligibleFrom,
  };
}

module.exports = {
  NAIROBI_TIME_ZONE,
  parseDateOfBirth,
  ageFromDateOfBirth,
  isValidDonorDateOfBirth,
  getDonorEligibility,
  startOfNairobiDay,
  toDateOnlyValue,
};
