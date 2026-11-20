const DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (date) => {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
};

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

const sumUnits = (transactions) => transactions.reduce((sum, transaction) => (
  sum + Math.abs(transaction.unitsChanged)
), 0);

const hasSufficientHistory = (transactions) => transactions.length >= 2
  && new Set(transactions.map((transaction) => transaction.createdAt.toISOString().slice(0, 10))).size >= 2;

const getTrend = (currentUnits, previousUnits, days) => {
  if (currentUnits === 0 || previousUnits === 0) return { trend: "INSUFFICIENT_DATA", changePercent: null };
  const currentAverage = currentUnits / days;
  const previousAverage = previousUnits / days;
  const changePercent = ((currentAverage - previousAverage) / previousAverage) * 100;
  return {
    trend: changePercent > 10 ? "INCREASING" : changePercent < -10 ? "DECREASING" : "STABLE",
    changePercent: Math.round(changePercent * 10) / 10,
  };
};

function buildInsights({ inventory, transactions, settings, now = new Date(), bloodType }) {
  const windowDays = settings?.historicalWindowDays || 30;
  const periodEnd = startOfUtcDay(now);
  const periodStart = addDays(periodEnd, -windowDays);
  const previousStart = addDays(periodStart, -windowDays);
  const hasOperationalSettings = Number.isInteger(settings?.replenishmentLeadTimeDays)
    && Number.isInteger(settings?.safetyBufferDays);
  const rows = inventory
    .filter((item) => !bloodType || item.bloodType === bloodType)
    .map((item) => {
      const relevant = transactions.filter((entry) => entry.inventoryId === item.inventoryId);
      const currentTransactions = relevant.filter((entry) => entry.createdAt >= periodStart && entry.createdAt < periodEnd);
      const previousTransactions = relevant.filter((entry) => entry.createdAt >= previousStart && entry.createdAt < periodStart);
      const currentUnitsIssued = sumUnits(currentTransactions);
      const previousUnitsIssued = sumUnits(previousTransactions);
      const sufficient = hasSufficientHistory(currentTransactions);
      const averageDailyUsage = sufficient ? currentUnitsIssued / windowDays : null;
      const recommendedThreshold = sufficient && hasOperationalSettings
        ? Math.ceil(averageDailyUsage * (settings.replenishmentLeadTimeDays + settings.safetyBufferDays))
        : null;
      const daysOfStockRemaining = sufficient && averageDailyUsage > 0
        ? item.unitsAvailable / averageDailyUsage
        : null;
      const trendResult = hasSufficientHistory(currentTransactions) && hasSufficientHistory(previousTransactions)
        ? getTrend(currentUnitsIssued, previousUnitsIssued, windowDays)
        : { trend: "INSUFFICIENT_DATA", changePercent: null };

      let shortageRisk = "INSUFFICIENT_DATA";
      if (sufficient && averageDailyUsage === 0) shortageRisk = "NO_RECORDED_USAGE";
      else if (daysOfStockRemaining !== null && hasOperationalSettings) {
        if (daysOfStockRemaining <= settings.replenishmentLeadTimeDays) shortageRisk = "CRITICAL";
        else if (daysOfStockRemaining <= settings.replenishmentLeadTimeDays + settings.safetyBufferDays) shortageRisk = "HIGH";
        else shortageRisk = "LOW";
      }

      const recommendation = !sufficient
        ? "INSUFFICIENT_HISTORY"
        : !hasOperationalSettings
          ? "CONFIGURE_SETTINGS"
          : item.unitsAvailable <= recommendedThreshold
            ? "REPLENISH"
            : "ABOVE_THRESHOLD";

      return {
        inventoryId: item.inventoryId,
        bloodType: item.bloodType,
        currentAvailableStock: item.unitsAvailable,
        currentThreshold: item.minimumUnits,
        currentUnitsIssued,
        previousUnitsIssued,
        averageDailyUsage,
        recommendedThreshold,
        thresholdDifference: recommendedThreshold === null ? null : recommendedThreshold - item.minimumUnits,
        daysOfStockRemaining,
        projectedShortageDate: daysOfStockRemaining === null ? null : addDays(now, daysOfStockRemaining).toISOString(),
        demandTrend: trendResult.trend,
        demandChangePercent: trendResult.changePercent,
        shortageRisk,
        recommendation,
        dataSufficient: sufficient,
        insufficientDataMessage: sufficient ? null : "Insufficient usage history to generate a reliable recommendation.",
        analysisPeriod: { from: periodStart.toISOString(), to: periodEnd.toISOString(), days: windowDays },
        transactionCount: currentTransactions.length,
      };
    });

  return {
    settings: settings || {
      historicalWindowDays: 30,
      replenishmentLeadTimeDays: null,
      safetyBufferDays: null,
    },
    generatedAt: now.toISOString(),
    limitations: [
      "Usage is based on recorded request fulfillments only; other stock removals are excluded.",
      "The inventory model does not track reserved, expired, quarantined, or otherwise unusable units separately.",
      "No confirmed incoming stock is represented in this projection.",
      "A recorded fulfillment is an operational stock issue, not confirmation of transfusion or clinical use.",
      "A recommendation requires at least two recorded fulfillment transactions on separate days in the analysis period.",
      "Demand is labelled stable when the comparison changes by no more than 10%; this is an operational display band, not a clinical threshold.",
      "These estimates support inventory operations and do not make patient compatibility, transfusion, or clinical decisions.",
    ],
    summary: {
      usableUnits: inventory.reduce((sum, item) => sum + item.unitsAvailable, 0),
      belowRecommendedThreshold: rows.filter((item) => item.recommendation === "REPLENISH").length,
      highOrCriticalRisk: rows.filter((item) => ["HIGH", "CRITICAL"].includes(item.shortageRisk)).length,
      increasingDemand: rows.filter((item) => item.demandTrend === "INCREASING").length,
    },
    recommendations: rows,
    usageTransactions: transactions
      .filter((entry) => (!bloodType || entry.bloodType === bloodType) && entry.createdAt >= previousStart && entry.createdAt < periodEnd)
      .map(({ bloodType: type, unitsChanged, createdAt }) => ({ bloodType: type, unitsIssued: Math.abs(unitsChanged), issuedAt: createdAt })),
  };
}

module.exports = { buildInsights, startOfUtcDay };
