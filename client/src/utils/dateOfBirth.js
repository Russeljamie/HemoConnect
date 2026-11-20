export function ageFromDateOfBirth(value, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;

  const [year, month, day] = value.split("-").map(Number);
  const dateOfBirth = new Date(year, month - 1, day);
  if (
    dateOfBirth.getFullYear() !== year ||
    dateOfBirth.getMonth() !== month - 1 ||
    dateOfBirth.getDate() !== day
  ) {
    return null;
  }

  let age = today.getFullYear() - year;
  if (
    today.getMonth() < month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() < day)
  ) {
    age -= 1;
  }
  return age;
}

export function dateInputYearsAgo(years, today = new Date()) {
  const date = new Date(today);
  date.setFullYear(date.getFullYear() - years);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
