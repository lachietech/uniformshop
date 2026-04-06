import Sales from "../models/Sales.js";
import POSProduct from "../models/POSProduct.js";

export function getCurrentMonthLabel(date = new Date()) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
}

function toSku(category, size) {
  return `${String(category || "").trim()}-${String(size || "").trim()}`
    .replace(/\s+/g, "-")
    .toUpperCase();
}

function normalizeText(value) {
  return String(value || "").trim().toUpperCase();
}

function getProductCanonicalKey(product) {
  const salesRecordId = String(product.salesRecordId || "").trim();
  if (salesRecordId) {
    return `sales:${salesRecordId}`;
  }

  const sku = normalizeText(product.sku);
  if (sku) {
    return `sku:${sku}`;
  }

  const category = normalizeText(product.category);
  const size = normalizeText(product.size);
  if (category || size) {
    return `variant:${category}|${size}`;
  }

  return `name:${normalizeText(product.name)}`;
}

function pickCanonicalProduct(existing, candidate) {
  if (!!candidate.active !== !!existing.active) {
    return candidate.active ? candidate : existing;
  }

  const existingTime = Date.parse(existing.updatedAt || existing.createdAt || 0);
  const candidateTime = Date.parse(candidate.updatedAt || candidate.createdAt || 0);
  if (!Number.isNaN(existingTime) && !Number.isNaN(candidateTime)) {
    return candidateTime > existingTime ? candidate : existing;
  }

  return existing;
}

export async function syncPosProductsFromSalesRecords() {
  const salesRecords = await Sales.find({}).select("_id category size").lean();
  if (!salesRecords.length) {
    return { synced: 0, deactivated: 0 };
  }

  const salesIds = salesRecords.map((record) => record._id);

  const operations = salesRecords.map((record) => ({
    updateOne: {
      filter: { salesRecordId: record._id },
      update: {
        $set: {
          category: record.category,
          size: record.size,
          name: `${record.category} - ${record.size}`,
          sku: toSku(record.category, record.size),
          salesRecordId: record._id,
          active: true
        },
        $setOnInsert: {
          price: 0,
          stockOnHand: 0,
          stockInWarehouse: 0
        }
      },
      upsert: true
    }
  }));

  if (operations.length) {
    await POSProduct.bulkWrite(operations);
  }

  // Ensure each sales record maps to a single active POS product.
  const linkedProducts = await POSProduct.find({ salesRecordId: { $ne: null } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("_id salesRecordId")
    .lean();

  const seenSalesRecordIds = new Set();
  const duplicateProductIds = [];
  for (const product of linkedProducts) {
    const key = String(product.salesRecordId || "");
    if (!key) {
      continue;
    }
    if (seenSalesRecordIds.has(key)) {
      duplicateProductIds.push(product._id);
      continue;
    }
    seenSalesRecordIds.add(key);
  }

  if (duplicateProductIds.length) {
    await POSProduct.updateMany(
      { _id: { $in: duplicateProductIds } },
      { $set: { active: false } }
    );
  }

  // Also collapse legacy/manual duplicates by SKU or category+size variants.
  const allProducts = await POSProduct.find({})
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("_id name sku category size salesRecordId active updatedAt createdAt")
    .lean();

  const canonicalByKey = new Map();
  const duplicateVariantIds = [];

  for (const product of allProducts) {
    const key = getProductCanonicalKey(product);
    const existing = canonicalByKey.get(key);
    if (!existing) {
      canonicalByKey.set(key, product);
      continue;
    }

    const canonical = pickCanonicalProduct(existing, product);
    const canonicalId = String(canonical._id);
    const existingId = String(existing._id);
    const duplicate = canonicalId === existingId ? product : existing;

    canonicalByKey.set(key, canonical);
    duplicateVariantIds.push(duplicate._id);
  }

  if (duplicateVariantIds.length) {
    await POSProduct.updateMany(
      { _id: { $in: duplicateVariantIds } },
      { $set: { active: false } }
    );
  }

  const deactivateResult = await POSProduct.updateMany(
    { salesRecordId: { $exists: true, $nin: salesIds } },
    { $set: { active: false } }
  );

  return {
    synced: operations.length,
    deactivated: deactivateResult.modifiedCount || 0
  };
}

export async function applyPosOrderToSales(items) {
  const monthLabel = getCurrentMonthLabel();
  const incrementsByRecord = new Map();

  for (const item of items) {
    const quantity = Number(item.qty || 0);
    if (!quantity || quantity < 1) {
      continue;
    }

    const key = item.salesRecordId
      ? `id:${item.salesRecordId}`
      : `key:${item.category || ""}::${item.size || ""}`;

    const existingQty = incrementsByRecord.get(key) || 0;
    incrementsByRecord.set(key, existingQty + quantity);
  }

  for (const [key, quantity] of incrementsByRecord.entries()) {
    let sale = null;

    if (key.startsWith("id:")) {
      const salesRecordId = key.slice(3);
      sale = await Sales.findById(salesRecordId);
    } else {
      const [, payload] = key.split("key:");
      const [category, size] = payload.split("::");
      sale = await Sales.findOne({ category, size });
    }

    if (!sale) {
      continue;
    }

    const monthIndex = sale.months.findIndex((month) => month === monthLabel);
    if (monthIndex >= 0) {
      sale.sales[monthIndex] = Number(sale.sales[monthIndex] || 0) + quantity;
    } else {
      sale.months.push(monthLabel);
      sale.sales.push(quantity);
    }

    await sale.save();
  }
}