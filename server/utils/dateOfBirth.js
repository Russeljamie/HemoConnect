function parseDateOfBirth(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const dateOfBirth = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return dateOfBirth;
}

function ageFromDateOfBirth(dateOfBirth, today = new Date()) {
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const birthdayHasNotPassed =
    today.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (today.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      today.getUTCDate() < dateOfBirth.getUTCDate());

  if (birthdayHasNotPassed) age -= 1;
  return age;
}

function isValidDonorDateOfBirth(dateOfBirth, today = new Date()) {
  const age = ageFromDateOfBirth(dateOfBirth, today);
  return age >= 18 && age <= 100;
}

module.exports = {
  ageFromDateOfBirth,
  isValidDonorDateOfBirth,
  parseDateOfBirth,
};
