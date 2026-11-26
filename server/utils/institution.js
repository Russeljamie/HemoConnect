function isActiveKnbtsCentre(institution) {
  return Boolean(
    institution &&
    institution.institutionType === "KNBTS_CENTRE" &&
    institution.isActive
  );
}

module.exports = { isActiveKnbtsCentre };
