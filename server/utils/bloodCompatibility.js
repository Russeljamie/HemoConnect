const DONOR_TO_RECIPIENT_BLOOD_TYPES = Object.freeze({
  "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
  "O+": ["O+", "A+", "B+", "AB+"],
  "A-": ["A-", "A+", "AB-", "AB+"],
  "A+": ["A+", "AB+"],
  "B-": ["B-", "B+", "AB-", "AB+"],
  "B+": ["B+", "AB+"],
  "AB-": ["AB-", "AB+"],
  "AB+": ["AB+"],
});

const getCompatibleRecipientBloodTypes = (donorBloodType) =>
  DONOR_TO_RECIPIENT_BLOOD_TYPES[donorBloodType] || [];

const getCompatibleDonorBloodTypes = (recipientBloodType) =>
  Object.entries(DONOR_TO_RECIPIENT_BLOOD_TYPES)
    .filter(([, recipientTypes]) => recipientTypes.includes(recipientBloodType))
    .map(([donorBloodType]) => donorBloodType);

module.exports = {
  getCompatibleRecipientBloodTypes,
  getCompatibleDonorBloodTypes,
};
