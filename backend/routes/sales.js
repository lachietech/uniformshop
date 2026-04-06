import express from "express";
import Sales from "../models/Sales.js";
import { syncPosProductsFromSalesRecords } from "../services/posIntegration.js";
import { compareCategoryThenSize, compareSizeValues } from "../utils/sizeOrder.js";

const router = express.Router();

function parseMonthLabel(label) {
  const [monthText, yearText] = label.split("-");
  const monthMap = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11
  };

  return new Date(2000 + Number(yearText), monthMap[monthText], 1);
}

function formatMonthLabel(date) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
}

function getNextMonthLabel(label) {
  const date = parseMonthLabel(label);
  date.setMonth(date.getMonth() + 1);
  return formatMonthLabel(date);
}

function roundValue(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildForecastFromSeries(monthlySeries, horizon = 12) {
  if (!monthlySeries.length) {
    return [];
  }

  const lastSix = monthlySeries.slice(-6);
  const deltas = [];
  for (let index = 1; index < lastSix.length; index += 1) {
    deltas.push(lastSix[index].total - lastSix[index - 1].total);
  }

  const averageTrend = deltas.length
    ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length
    : 0;

  const forecast = [];
  let lastForecastValue = monthlySeries.at(-1).total;
  let previousMonthLabel = monthlySeries.at(-1).month;

  for (let step = 0; step < horizon; step += 1) {
    const nextMonthLabel = getNextMonthLabel(previousMonthLabel);
    const [nextMonthName] = nextMonthLabel.split("-");
    const sameMonthHistory = monthlySeries
      .filter((entry) => entry.month.startsWith(nextMonthName))
      .map((entry) => entry.total);
    const seasonalAverage = sameMonthHistory.length
      ? sameMonthHistory.reduce((sum, value) => sum + value, 0) / sameMonthHistory.length
      : lastForecastValue;
    const blendedForecast = roundValue((lastForecastValue + averageTrend) * 0.55 + seasonalAverage * 0.45);
    const boundedForecast = Math.max(0, blendedForecast);

    forecast.push({
      month: nextMonthLabel,
      projectedTotal: boundedForecast,
      basis: {
        trendComponent: roundValue(lastForecastValue + averageTrend),
        seasonalAverage: roundValue(seasonalAverage)
      }
    });

    lastForecastValue = boundedForecast;
    previousMonthLabel = nextMonthLabel;
  }

  return forecast;
}

function buildRecordForecast(record, horizon = 12) {
  const months = record.months || [];
  const sales = (record.sales || []).map((value) => Number(value || 0));
  if (!months.length || !sales.length) {
    return [];
  }

  const history = months.map((month, index) => ({ month, total: sales[index] || 0 }));
  const lastSix = history.slice(-6);
  const deltas = [];
  for (let index = 1; index < lastSix.length; index += 1) {
    deltas.push(lastSix[index].total - lastSix[index - 1].total);
  }
  const averageTrend = deltas.length
    ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length
    : 0;

  const forecast = [];
  let lastForecastValue = history.at(-1).total;
  let previousMonthLabel = history.at(-1).month;
  for (let step = 0; step < horizon; step += 1) {
    const nextMonthLabel = getNextMonthLabel(previousMonthLabel);
    const [nextMonthName] = nextMonthLabel.split("-");
    const sameMonthHistory = history
      .filter((entry) => entry.month.startsWith(nextMonthName))
      .map((entry) => entry.total);
    const seasonalAverage = sameMonthHistory.length
      ? sameMonthHistory.reduce((sum, value) => sum + value, 0) / sameMonthHistory.length
      : lastForecastValue;
    const blendedForecast = roundValue((lastForecastValue + averageTrend) * 0.55 + seasonalAverage * 0.45);

    forecast.push({
      month: nextMonthLabel,
      projectedTotal: Math.max(0, blendedForecast)
    });

    lastForecastValue = Math.max(0, blendedForecast);
    previousMonthLabel = nextMonthLabel;
  }

  return forecast;
}

function buildDashboardMetrics(records) {
  if (!records.length) {
    return {
      totals: {
        currentMonth: null,
        previousMonth: null,
        currentTotal: 0,
        previousTotal: 0,
        monthOverMonthDelta: 0,
        monthOverMonthPercent: 0,
        yearOverYearDelta: null,
        yearOverYearPercent: null,
        yearOverYearMonth: null,
        yearOverYearTotal: null
      },
      monthlySeries: [],
      categoryBreakdown: [],
      sizeSnapshot: [],
      forecastSummary: {
        forecastHorizon: 12,
        projectedYearTotal: 0,
        projectedAverageMonthly: 0
      },
      projectionVsCurrentProgress: {
        currentYear: null,
        asOfMonth: null,
        projectedYearTotal: 0,
        actualToDateTotal: 0,
        remainingToProjection: 0,
        completionPercent: null,
        categoryBreakdown: []
      },
      yearProjectionComparison: {
        currentYear: null,
        previousYear: null,
        currentYearTotal: 0,
        previousYearTotal: 0,
        delta: 0,
        deltaPercent: null,
        sizeBreakdown: [],
        monthly: []
      },
      forecast: []
    };
  }

  const canonicalMonths = records[0].months || [];
  const monthlySeries = canonicalMonths.map((month, index) => {
    let total = 0;
    for (const record of records) {
      total += Number(record.sales?.[index] || 0);
    }
    return { month, total: roundValue(total) };
  });

  const currentPoint = monthlySeries.at(-1) || null;
  const previousPoint = monthlySeries.at(-2) || null;
  const currentTotal = currentPoint?.total || 0;
  const previousTotal = previousPoint?.total || 0;
  const monthOverMonthDelta = currentTotal - previousTotal;
  const monthOverMonthPercent = previousTotal === 0 ? null : roundValue((monthOverMonthDelta / previousTotal) * 100);

  let yearOverYearPoint = null;
  if (currentPoint) {
    const [currentMonthName, currentYearText] = currentPoint.month.split("-");
    const priorYearLabel = `${currentMonthName}-${String(Number(currentYearText) - 1).padStart(2, "0")}`;
    yearOverYearPoint = monthlySeries.find((entry) => entry.month === priorYearLabel) || null;
  }

  const yearOverYearDelta = yearOverYearPoint ? currentTotal - yearOverYearPoint.total : null;
  const yearOverYearPercent = yearOverYearPoint && yearOverYearPoint.total !== 0
    ? roundValue((yearOverYearDelta / yearOverYearPoint.total) * 100)
    : null;

  const currentMonthIndex = canonicalMonths.length - 1;
  const yearOverYearIndex = yearOverYearPoint
    ? canonicalMonths.findIndex((month) => month === yearOverYearPoint.month)
    : -1;

  const categoryBreakdown = [];
  const byCategory = new Map();
  for (const record of records) {
    const currentValue = Number(record.sales?.[canonicalMonths.length - 1] || 0);
    const previousValue = Number(record.sales?.[canonicalMonths.length - 2] || 0);
    const categoryEntry = byCategory.get(record.category) || { category: record.category, currentTotal: 0, previousTotal: 0 };
    categoryEntry.currentTotal += currentValue;
    categoryEntry.previousTotal += previousValue;
    byCategory.set(record.category, categoryEntry);
  }

  for (const entry of byCategory.values()) {
    const delta = entry.currentTotal - entry.previousTotal;
    categoryBreakdown.push({
      category: entry.category,
      currentTotal: roundValue(entry.currentTotal),
      previousTotal: roundValue(entry.previousTotal),
      delta: roundValue(delta),
      deltaPercent: entry.previousTotal === 0 ? null : roundValue((delta / entry.previousTotal) * 100)
    });
  }

  categoryBreakdown.sort((left, right) => right.currentTotal - left.currentTotal);

  const sizeSnapshot = records.map((record) => {
    const currentValue = Number(record.sales?.[currentMonthIndex] || 0);
    const yearAgoValue = yearOverYearIndex >= 0 ? Number(record.sales?.[yearOverYearIndex] || 0) : null;
    const delta = yearAgoValue === null ? null : currentValue - yearAgoValue;

    return {
      category: record.category,
      size: record.size,
      currentTotal: roundValue(currentValue),
      yearOverYearTotal: yearAgoValue === null ? null : roundValue(yearAgoValue),
      delta: delta === null ? null : roundValue(delta),
      deltaPercent: yearAgoValue === null || yearAgoValue === 0 ? null : roundValue((delta / yearAgoValue) * 100)
    };
  });

  sizeSnapshot.sort((left, right) => {
    return compareCategoryThenSize(left, right);
  });

  const forecast = buildForecastFromSeries(monthlySeries, 12);

  const projectedYearTotal = roundValue(forecast.reduce((sum, item) => sum + item.projectedTotal, 0));
  const projectedAverageMonthly = forecast.length ? roundValue(projectedYearTotal / forecast.length) : 0;

  const monthlyActualMap = new Map(monthlySeries.map((item) => [item.month, item.total]));
  const monthlyForecastMap = new Map(forecast.map((item) => [item.month, item.projectedTotal]));
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentCalendarYear = new Date().getFullYear();
  const previousCalendarYear = currentCalendarYear - 1;
  const currentYearSuffix = String(currentCalendarYear).slice(-2);

  const currentYearMonthIndexes = canonicalMonths
    .map((label, index) => ({ label, index }))
    .filter((entry) => entry.label.endsWith(`-${currentYearSuffix}`));
  const asOfMonthLabel = currentYearMonthIndexes.length
    ? currentYearMonthIndexes[currentYearMonthIndexes.length - 1].label
    : null;

  const recordMonthlyMaps = records.map((record) => {
    const recordSeries = (record.months || []).map((month, index) => ({
      month,
      total: Number(record.sales?.[index] || 0)
    }));
    const recordForecast = buildForecastFromSeries(recordSeries, 12);
    return {
      category: record.category,
      size: record.size,
      actual: new Map(recordSeries.map((item) => [item.month, item.total])),
      projected: new Map(recordForecast.map((item) => [item.month, item.projectedTotal]))
    };
  });

  const getMonthValue = (year, monthName) => {
    const label = `${monthName}-${String(year).slice(-2)}`;
    if (monthlyActualMap.has(label)) {
      return { value: monthlyActualMap.get(label), source: "actual" };
    }
    if (monthlyForecastMap.has(label)) {
      return { value: monthlyForecastMap.get(label), source: "projected" };
    }
    return { value: 0, source: "projected" };
  };

  const yearlyMonthlyComparison = monthNames.map((monthName) => {
    const current = getMonthValue(currentCalendarYear, monthName);
    const previous = getMonthValue(previousCalendarYear, monthName);
    const delta = current.value - previous.value;

    const sizeBreakdown = recordMonthlyMaps.map((entry) => {
      const currentLabel = `${monthName}-${String(currentCalendarYear).slice(-2)}`;
      const previousLabel = `${monthName}-${String(previousCalendarYear).slice(-2)}`;

      const currentHasActual = entry.actual.has(currentLabel);
      const previousHasActual = entry.actual.has(previousLabel);

      const currentValue = currentHasActual
        ? Number(entry.actual.get(currentLabel) || 0)
        : Number(entry.projected.get(currentLabel) || 0);
      const previousValue = previousHasActual
        ? Number(entry.actual.get(previousLabel) || 0)
        : Number(entry.projected.get(previousLabel) || 0);
      const rowDelta = currentValue - previousValue;

      return {
        category: entry.category,
        size: entry.size,
        currentYearValue: roundValue(currentValue),
        previousYearValue: roundValue(previousValue),
        delta: roundValue(rowDelta),
        deltaPercent: previousValue === 0 ? null : roundValue((rowDelta / previousValue) * 100),
        currentYearSource: currentHasActual ? "actual" : "projected",
        previousYearSource: previousHasActual ? "actual" : "projected"
      };
    });

    sizeBreakdown.sort((left, right) => {
      return compareCategoryThenSize(left, right);
    });

    const groupedCategories = [];
    const groupMap = new Map();
    for (const row of sizeBreakdown) {
      const existing = groupMap.get(row.category) || {
        category: row.category,
        currentYearTotal: 0,
        previousYearTotal: 0,
        delta: 0,
        deltaPercent: null,
        sizes: []
      };
      existing.currentYearTotal += row.currentYearValue;
      existing.previousYearTotal += row.previousYearValue;
      existing.sizes.push(row);
      groupMap.set(row.category, existing);
    }

    for (const value of groupMap.values()) {
      value.currentYearTotal = roundValue(value.currentYearTotal);
      value.previousYearTotal = roundValue(value.previousYearTotal);
      value.delta = roundValue(value.currentYearTotal - value.previousYearTotal);
      value.deltaPercent = value.previousYearTotal === 0
        ? null
        : roundValue((value.delta / value.previousYearTotal) * 100);
      groupedCategories.push(value);
    }

    groupedCategories.sort((left, right) => left.category.localeCompare(right.category));

    return {
      month: monthName,
      currentYearValue: roundValue(current.value),
      previousYearValue: roundValue(previous.value),
      delta: roundValue(delta),
      deltaPercent: previous.value === 0 ? null : roundValue((delta / previous.value) * 100),
      currentYearSource: current.source,
      previousYearSource: previous.source,
      categoryBreakdown: groupedCategories
    };
  });

  const currentYearTotal = roundValue(yearlyMonthlyComparison.reduce((sum, item) => sum + item.currentYearValue, 0));
  const previousYearTotal = roundValue(yearlyMonthlyComparison.reduce((sum, item) => sum + item.previousYearValue, 0));
  const yearlyDelta = roundValue(currentYearTotal - previousYearTotal);
  const yearlyDeltaPercent = previousYearTotal === 0 ? null : roundValue((yearlyDelta / previousYearTotal) * 100);

  const yearProjectionSizeBreakdown = records.map((record) => {
    const recordActualMap = new Map((record.months || []).map((month, index) => [month, Number(record.sales?.[index] || 0)]));
    const recordForecastMap = new Map(buildRecordForecast(record, 24).map((item) => [item.month, item.projectedTotal]));

    const getRecordMonthValue = (year, monthName) => {
      const label = `${monthName}-${String(year).slice(-2)}`;
      if (recordActualMap.has(label)) {
        return recordActualMap.get(label);
      }
      if (recordForecastMap.has(label)) {
        return recordForecastMap.get(label);
      }
      return 0;
    };

    let currentYearSizeTotal = 0;
    let previousYearSizeTotal = 0;
    for (const monthName of monthNames) {
      currentYearSizeTotal += getRecordMonthValue(currentCalendarYear, monthName);
      previousYearSizeTotal += getRecordMonthValue(previousCalendarYear, monthName);
    }

    const delta = currentYearSizeTotal - previousYearSizeTotal;
    return {
      category: record.category,
      size: record.size,
      currentYearTotal: roundValue(currentYearSizeTotal),
      previousYearTotal: roundValue(previousYearSizeTotal),
      delta: roundValue(delta),
      deltaPercent: previousYearSizeTotal === 0 ? null : roundValue((delta / previousYearSizeTotal) * 100)
    };
  });

  yearProjectionSizeBreakdown.sort((left, right) => {
    return compareCategoryThenSize(left, right);
  });

  const progressByCategory = new Map();
  for (const record of records) {
    const recordActualMap = new Map((record.months || []).map((month, index) => [month, Number(record.sales?.[index] || 0)]));
    const recordForecastMap = new Map(buildRecordForecast(record, 24).map((item) => [item.month, item.projectedTotal]));

    let projectedYearTotalForSize = 0;
    let actualToDateForSize = 0;
    let expectedRemainingForSize = 0;
    let previousYearRemainingForSize = 0;

    for (const monthName of monthNames) {
      const label = `${monthName}-${currentYearSuffix}`;
      const projectedValue = recordActualMap.has(label)
        ? Number(recordActualMap.get(label) || 0)
        : Number(recordForecastMap.get(label) || 0);
      projectedYearTotalForSize += projectedValue;

      if (asOfMonthLabel) {
        const monthDate = parseMonthLabel(label);
        const asOfDate = parseMonthLabel(asOfMonthLabel);
        
        if (monthDate <= asOfDate) {
          actualToDateForSize += Number(recordActualMap.get(label) || 0);
        } else {
          // Beyond current month: get forecast for this year and actual from previous year
          expectedRemainingForSize += Number(recordForecastMap.get(label) || 0);
          
          const prevYearLabel = `${monthName}-${String(previousCalendarYear).slice(-2)}`;
          previousYearRemainingForSize += Number(recordActualMap.get(prevYearLabel) || 0);
        }
      }
    }

    // Likelihood: will forecast for remaining months match previous year's pattern?
    let likelihoodForSize = null;
    if (asOfMonthLabel && previousYearRemainingForSize > 0) {
      likelihoodForSize = roundValue((expectedRemainingForSize / previousYearRemainingForSize) * 100);
    }

    const sizeEntry = {
      size: record.size,
      projectedYearTotal: roundValue(projectedYearTotalForSize),
      actualToDateTotal: roundValue(actualToDateForSize),
      remainingToProjection: roundValue(projectedYearTotalForSize - actualToDateForSize),
      completionPercent: projectedYearTotalForSize === 0
        ? null
        : roundValue((actualToDateForSize / projectedYearTotalForSize) * 100),
      likelihoodOfReachingProjection: likelihoodForSize
    };

    const categoryEntry = progressByCategory.get(record.category) || {
      category: record.category,
      projectedYearTotal: 0,
      actualToDateTotal: 0,
      remainingToProjection: 0,
      completionPercent: null,
      sizes: []
    };

    categoryEntry.projectedYearTotal += projectedYearTotalForSize;
    categoryEntry.actualToDateTotal += actualToDateForSize;
    categoryEntry.remainingToProjection += projectedYearTotalForSize - actualToDateForSize;
    categoryEntry.sizes.push(sizeEntry);
    progressByCategory.set(record.category, categoryEntry);
  }

  const progressCategoryBreakdown = [];
  for (const entry of progressByCategory.values()) {
    entry.projectedYearTotal = roundValue(entry.projectedYearTotal);
    entry.actualToDateTotal = roundValue(entry.actualToDateTotal);
    entry.remainingToProjection = roundValue(entry.remainingToProjection);
    entry.completionPercent = entry.projectedYearTotal === 0
      ? null
      : roundValue((entry.actualToDateTotal / entry.projectedYearTotal) * 100);
    
    // Category likelihood: weighted average of size likelihoods
    let categoryLikelihood = null;
    const categoryTotalPrevYearRemaining = entry.sizes.reduce((sum, size) => {
      // Reverse engineer: each size's previous year remaining
      if (size.likelihoodOfReachingProjection !== null) {
        return sum + (size.projectedYearTotal > size.actualToDateTotal 
          ? (size.projectedYearTotal - size.actualToDateTotal) / (size.likelihoodOfReachingProjection / 100)
          : 0);
      }
      return sum;
    }, 0);
    
    if (categoryTotalPrevYearRemaining > 0) {
      const categoryTotalExpectedRemaining = entry.sizes.reduce((sum, size) => {
        if (size.likelihoodOfReachingProjection !== null && size.projectedYearTotal > size.actualToDateTotal) {
          const prevYearRemaining = (size.projectedYearTotal - size.actualToDateTotal) / (size.likelihoodOfReachingProjection / 100);
          return sum + (prevYearRemaining * size.likelihoodOfReachingProjection / 100);
        }
        return sum;
      }, 0);
      categoryLikelihood = roundValue((categoryTotalExpectedRemaining / categoryTotalPrevYearRemaining) * 100);
    }
    entry.likelihoodOfReachingProjection = categoryLikelihood;
    
    entry.sizes.sort((left, right) => compareSizeValues(left.size, right.size));
    progressCategoryBreakdown.push(entry);
  }
  progressCategoryBreakdown.sort((left, right) => left.category.localeCompare(right.category));

  const projectedYearTotalProgress = roundValue(progressCategoryBreakdown.reduce((sum, entry) => sum + entry.projectedYearTotal, 0));
  const actualToDateTotalProgress = roundValue(progressCategoryBreakdown.reduce((sum, entry) => sum + entry.actualToDateTotal, 0));
  const remainingToProjectionProgress = roundValue(projectedYearTotalProgress - actualToDateTotalProgress);
  const completionPercentProgress = projectedYearTotalProgress === 0
    ? null
    : roundValue((actualToDateTotalProgress / projectedYearTotalProgress) * 100);


  return {
    totals: {
      currentMonth: currentPoint?.month || null,
      previousMonth: previousPoint?.month || null,
      currentTotal: roundValue(currentTotal),
      previousTotal: roundValue(previousTotal),
      monthOverMonthDelta: roundValue(monthOverMonthDelta),
      monthOverMonthPercent,
      yearOverYearDelta: yearOverYearDelta === null ? null : roundValue(yearOverYearDelta),
      yearOverYearPercent,
      yearOverYearMonth: yearOverYearPoint?.month || null,
      yearOverYearTotal: yearOverYearPoint ? roundValue(yearOverYearPoint.total) : null
    },
    monthlySeries,
    categoryBreakdown,
    sizeSnapshot,
    forecastSummary: {
      forecastHorizon: forecast.length,
      projectedYearTotal,
      projectedAverageMonthly
    },
    projectionVsCurrentProgress: {
      currentYear: currentCalendarYear,
      asOfMonth: asOfMonthLabel,
      projectedYearTotal: projectedYearTotalProgress,
      actualToDateTotal: actualToDateTotalProgress,
      remainingToProjection: remainingToProjectionProgress,
      completionPercent: completionPercentProgress,
      categoryBreakdown: progressCategoryBreakdown
    },
    yearProjectionComparison: {
      currentYear: currentCalendarYear,
      previousYear: previousCalendarYear,
      currentYearTotal,
      previousYearTotal,
      delta: yearlyDelta,
      deltaPercent: yearlyDeltaPercent,
      sizeBreakdown: yearProjectionSizeBreakdown,
      monthly: yearlyMonthlyComparison
    },
    forecast
  };
}

// Get all sales data with optional filters
router.get("/sales", async (req, res) => {
  try {
    const { category, size } = req.query;
    const filter = {};
    
    if (category) filter.category = category;
    if (size) filter.size = size;
    
    const sales = await Sales.find(filter).lean();
    sales.sort((left, right) => compareCategoryThenSize(left, right));
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const records = await Sales.find({}).lean();
    res.json(buildDashboardMetrics(records));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single sales record
router.get("/sales/:id", async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: "Sales record not found" });
    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new sales record
router.post("/sales", async (req, res) => {
  try {
    const { category, size, months, sales } = req.body;
    
    // Check if record already exists
    const existing = await Sales.findOne({ category, size });
    if (existing) {
      return res.status(400).json({ error: "Sales record for this category-size combination already exists" });
    }
    
    // Validate months and sales match
    if (months.length !== sales.length) {
      return res.status(400).json({ error: "Months and sales arrays must have the same length" });
    }
    
    const newSale = new Sales({ category, size, months, sales });
    await newSale.save();
    await syncPosProductsFromSalesRecords();
    res.status(201).json(newSale);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update sales record
router.put("/sales/:id", async (req, res) => {
  try {
    const { category, size, months, sales } = req.body;
    
    if (months && sales && months.length !== sales.length) {
      return res.status(400).json({ error: "Months and sales arrays must have the same length" });
    }
    
    const updated = await Sales.findByIdAndUpdate(
      req.params.id,
      { category, size, months, sales },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: "Sales record not found" });
    await syncPosProductsFromSalesRecords();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Add a new month to a sales record
router.post("/sales/:id/add-month", async (req, res) => {
  try {
    const { month, value } = req.body;
    
    if (!month || value === undefined) {
      return res.status(400).json({ error: "Month and value are required" });
    }
    
    const sale = await Sales.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: "Sales record not found" });
    
    // Check if month already exists
    if (sale.months.includes(month)) {
      return res.status(400).json({ error: `Month ${month} already exists for this record` });
    }
    
    sale.months.push(month);
    sale.sales.push(value);
    await sale.save();
    res.json(sale);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update specific month for a sales record
router.patch("/sales/:id/month/:monthIndex", async (req, res) => {
  try {
    const { value } = req.body;
    const monthIndex = parseInt(req.params.monthIndex);
    
    const sale = await Sales.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: "Sales record not found" });
    
    if (monthIndex < 0 || monthIndex >= sale.sales.length) {
      return res.status(400).json({ error: `Invalid month index (0-${sale.sales.length - 1})` });
    }
    
    sale.sales[monthIndex] = value;
    await sale.save();
    res.json(sale);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete sales record
router.delete("/sales/:id", async (req, res) => {
  try {
    const deleted = await Sales.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Sales record not found" });
    await syncPosProductsFromSalesRecords();
    res.json({ message: "Sales record deleted successfully", deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get metadata (months and available categories/sizes)
router.get("/metadata/months", async (req, res) => {
  try {
    const firstRecord = await Sales.findOne().select("months").lean();
    const months = firstRecord?.months || [];
    res.json({ months });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all categories
router.get("/metadata/categories", async (req, res) => {
  try {
    const categories = await Sales.distinct("category");
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get sizes for a category
router.get("/metadata/categories/:category/sizes", async (req, res) => {
  try {
    const sizes = await Sales.find({ category: req.params.category }).select("size").lean();
    const uniqueSizes = [...new Set(sizes.map((item) => String(item.size || "").trim()).filter(Boolean))];
    uniqueSizes.sort(compareSizeValues);
    res.json({ 
      category: req.params.category,
      sizes: uniqueSizes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
