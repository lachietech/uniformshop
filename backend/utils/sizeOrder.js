const FIXED_SIZE_ORDER = new Map([
  ["XXS", 0],
  ["XS", 1],
  ["S", 2],
  ["M", 3],
  ["L", 4],
  ["XL", 5],
  ["XXL", 6],
  ["2XL", 6],
  ["XXXL", 7],
  ["3XL", 7],
  ["4XL", 8],
  ["5XL", 9]
]);

const SIZE_ALIASES = new Map([
  ["SM", "S"],
  ["SMALL", "S"],
  ["MED", "M"],
  ["MEDIUM", "M"],
  ["LG", "L"],
  ["LRG", "L"],
  ["LARGE", "L"],
  ["XSMALL", "XS"],
  ["EXTRASMALL", "XS"],
  ["XLARGE", "XL"],
  ["EXTRALARGE", "XL"],
  ["2X", "2XL"],
  ["3X", "3XL"],
  ["4X", "4XL"],
  ["5X", "5XL"]
]);

function normalizeSize(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  return SIZE_ALIASES.get(normalized) || normalized;
}

function parseNumericSize(value) {
  const normalized = normalizeSize(value);
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }
  return null;
}

function parseFixedSizeRank(value) {
  const normalized = normalizeSize(value);
  if (FIXED_SIZE_ORDER.has(normalized)) {
    return FIXED_SIZE_ORDER.get(normalized);
  }

  const xlMatch = normalized.match(/^(\d+)XL$/);
  if (xlMatch) {
    return 5 + Number(xlMatch[1]) - 1;
  }

  return null;
}

export function compareSizeValues(left, right) {
  const leftNumeric = parseNumericSize(left);
  const rightNumeric = parseNumericSize(right);

  if (leftNumeric !== null && rightNumeric !== null) {
    return leftNumeric - rightNumeric;
  }
  if (leftNumeric !== null) {
    return -1;
  }
  if (rightNumeric !== null) {
    return 1;
  }

  const leftRank = parseFixedSizeRank(left);
  const rightRank = parseFixedSizeRank(right);

  if (leftRank !== null && rightRank !== null) {
    return leftRank - rightRank;
  }
  if (leftRank !== null) {
    return -1;
  }
  if (rightRank !== null) {
    return 1;
  }

  return normalizeSize(left).localeCompare(normalizeSize(right));
}

export function compareCategoryThenSize(left, right) {
  const categoryCompare = String(left.category || "").localeCompare(String(right.category || ""));
  if (categoryCompare !== 0) {
    return categoryCompare;
  }

  const sizeCompare = compareSizeValues(left.size, right.size);
  if (sizeCompare !== 0) {
    return sizeCompare;
  }

  return String(left.name || "").localeCompare(String(right.name || ""));
}
