const env = require("../config/env");
const {
  addCalendarDays,
  compareNairobiDateOnly,
  startOfNairobiDay,
  toDateOnlyValue,
} = require("./nairobiDate");

const DONATION_INTERVAL_DAYS = env.DONATION_WAITING_PERIOD_DAYS;

const getDonationEligibility = ({
  lastSuccessfulDonationDate,
  today = new Date(),
  waitingPeriodDays = DONATION_INTERVAL_DAYS,
}) => {
  if (!Number.isInteger(waitingPeriodDays) || waitingPeriodDays <= 0) {
    throw new RangeError("Waiting period must be a positive integer.");
  }

  const lastDonationDate = lastSuccessfulDonationDate
    ? startOfNairobiDay(lastSuccessfulDonationDate)
    : null;
  const nextEligibleDonationDate = lastDonationDate
    ? addCalendarDays(lastDonationDate, waitingPeriodDays)
    : null;
  const todayDate = startOfNairobiDay(today);

  return {
    lastSuccessfulDonationDate: lastDonationDate,
    nextEligibleDonationDate,
    canScheduleDonation: !nextEligibleDonationDate ||
      Boolean(todayDate && nextEligibleDonationDate &&
        compareNairobiDateOnly(todayDate, nextEligibleDonationDate) >= 0),
  };
};

const isEligibleForDonationOn = (
  lastSuccessfulDonationDate,
  plannedDate,
  waitingPeriodDays = DONATION_INTERVAL_DAYS
) => {
  if (!lastSuccessfulDonationDate) return true;
  const eligibility = getDonationEligibility({
    lastSuccessfulDonationDate,
    today: plannedDate,
    waitingPeriodDays,
  });
  const plannedDay = startOfNairobiDay(plannedDate);
  return Boolean(
    eligibility.nextEligibleDonationDate &&
    plannedDay &&
    compareNairobiDateOnly(plannedDay, eligibility.nextEligibleDonationDate) >= 0
  );
};

const latestDate = (...values) => values
  .map((value) => value && startOfNairobiDay(value))
  .filter(Boolean)
  .sort((left, right) => right.getTime() - left.getTime())[0] || null;

const startOfUtcDay = startOfNairobiDay;

module.exports = {
  DONATION_INTERVAL_DAYS,
  getDonationEligibility,
  isEligibleForDonationOn,
  latestDate,
  startOfUtcDay,
  startOfNairobiDay,
  toDateOnlyValue,
  addCalendarDays,
};
