const { buildInsights } = require("../services/stockInsights");

const now = new Date("2026-11-19T12:00:00.000Z");
const inventory = { inventoryId: 1, bloodType: "O+", unitsAvailable: 10, minimumUnits: 5 };
const settings = { historicalWindowDays: 30, replenishmentLeadTimeDays: 5, safetyBufferDays: 3 };
const entry = (daysAgo, unitsChanged = -1) => ({
  inventoryId: 1,
  bloodType: "O+",
  unitsChanged,
  createdAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
});

describe("adaptive stock insight calculations", () => {
  it("calculates average daily usage, threshold, and days remaining", () => {
    const result = buildInsights({
      inventory: [inventory],
      transactions: Array.from({ length: 30 }, (_, index) => entry(index + 1)),
      settings,
      now,
    }).recommendations[0];

    expect(result.currentUnitsIssued).toBe(30);
    expect(result.averageDailyUsage).toBe(1);
    expect(result.recommendedThreshold).toBe(8);
    expect(result.daysOfStockRemaining).toBe(10);
    expect(result.shortageRisk).toBe("LOW");
  });

  it.each([
    [4, "CRITICAL"],
    [6, "HIGH"],
  ])("classifies %s days of stock as %s relative to configured replenishment time", (unitsAvailable, expectedRisk) => {
    const result = buildInsights({
      inventory: [{ ...inventory, unitsAvailable }],
      transactions: Array.from({ length: 30 }, (_, index) => entry(index + 1)),
      settings,
      now,
    }).recommendations[0];
    expect(result.shortageRisk).toBe(expectedRisk);
  });

  it("rounds a positive fractional recommendation up to one unit", () => {
    const result = buildInsights({ inventory: [inventory], transactions: [entry(1), entry(2)], settings: { ...settings, replenishmentLeadTimeDays: 1, safetyBufferDays: 0 }, now }).recommendations[0];
    expect(result.recommendedThreshold).toBe(1);
  });

  it("does not treat missing usage history as zero demand", () => {
    const result = buildInsights({ inventory: [inventory], transactions: [], settings, now }).recommendations[0];
    expect(result.dataSufficient).toBe(false);
    expect(result.averageDailyUsage).toBeNull();
    expect(result.recommendedThreshold).toBeNull();
    expect(result.daysOfStockRemaining).toBeNull();
    expect(result.recommendation).toBe("INSUFFICIENT_HISTORY");
  });

  it("does not estimate days remaining for recorded zero usage", () => {
    const result = buildInsights({ inventory: [inventory], transactions: [entry(1, 0), entry(2, 0)], settings, now }).recommendations[0];
    expect(result.averageDailyUsage).toBe(0);
    expect(result.daysOfStockRemaining).toBeNull();
    expect(result.shortageRisk).toBe("NO_RECORDED_USAGE");
  });

  it.each([
    [36, "INCREASING", 20],
    [30, "STABLE", 0],
    [24, "DECREASING", -20],
  ])("classifies usage trend against the preceding period", (currentUnits, expectedTrend, expectedChange) => {
    const transactions = [
      ...Array.from({ length: 30 }, (_, index) => entry(index + 31)),
      ...Array.from({ length: currentUnits }, (_, index) => entry((index % 30) + 1)),
    ];
    const result = buildInsights({ inventory: [inventory], transactions, settings, now }).recommendations[0];
    expect(result.demandTrend).toBe(expectedTrend);
    expect(result.demandChangePercent).toBe(expectedChange);
  });

  it("does not calculate a threshold before hospital lead-time settings are configured", () => {
    const result = buildInsights({ inventory: [inventory], transactions: [entry(1), entry(2)], settings: { historicalWindowDays: 30 }, now }).recommendations[0];
    expect(result.recommendedThreshold).toBeNull();
    expect(result.recommendation).toBe("CONFIGURE_SETTINGS");
  });

  it("does not claim a trend unless both equivalent periods have sufficient history", () => {
    const transactions = [entry(1), entry(2)];
    const result = buildInsights({ inventory: [inventory], transactions, settings, now }).recommendations[0];
    expect(result.dataSufficient).toBe(true);
    expect(result.demandTrend).toBe("INSUFFICIENT_DATA");
    expect(result.demandChangePercent).toBeNull();
  });
});
