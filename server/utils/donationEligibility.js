const DONATION_INTERVAL_MONTHS = 4;

const startOfUtcDay = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const addCalendarMonths = (value, months) => {
  const date = startOfUtcDay(value);
  if (!date) return null;

  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const targetDay = Math.min(
    date.getUTCDate(),
    new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  );
  return new Date(Date.UTC(targetYear, normalizedMonth, targetDay));
};

const latestDate = (...values) => values
  .map((value) => value && startOfUtcDay(value))
  .filter(Boolean)
  .sort((left, right) => right.getTime() - left.getTime())[0] || null;

const getDonationEligibility = ({ lastSuccessfulDonationDate, today = new Date() }) => {
  const lastDonationDate = lastSuccessfulDonationDate
    ? startOfUtcDay(lastSuccessfulDonationDate)
    : null;
  const nextEligibleDonationDate = lastDonationDate
    ? addCalendarMonths(lastDonationDate, DONATION_INTERVAL_MONTHS)
    : null;
  const todayDate = startOfUtcDay(today);

  return {
    lastSuccessfulDonationDate: lastDonationDate,
    nextEligibleDonationDate,
    canScheduleDonation: !nextEligibleDonationDate ||
      (todayDate && todayDate.getTime() >= nextEligibleDonationDate.getTime()),
  };
};

const isEligibleForDonationOn = (lastSuccessfulDonationDate, plannedDate) => {
  if (!lastSuccessfulDonationDate) return true;
  const eligibility = getDonationEligibility({ lastSuccessfulDonationDate, today: plannedDate });
  const plannedDay = startOfUtcDay(plannedDate);
  return Boolean(
    eligibility.nextEligibleDonationDate &&
    plannedDay &&
    plannedDay.getTime() >= eligibility.nextEligibleDonationDate.getTime()
  );
};

module.exports = {
  DONATION_INTERVAL_MONTHS,
  addCalendarMonths,
  getDonationEligibility,
  isEligibleForDonationOn,
  latestDate,
  startOfUtcDay,
};
