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

function pickCanonicalProduct(existing, candidate) {
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
    return { synced: 0, created: 0, updated: 0, removedDuplicates: 0, deactivated: 0 };
  }

  const existingProducts = await POSProduct.find({})
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("_id name sku category size salesRecordId price stockOnHand stockInWarehouse updatedAt createdAt")
    .lean();

  const bySalesRecordId = new Map();
  const bySku = new Map();
  const byVariant = new Map();

  for (const product of existingProducts) {
    const salesKey = String(product.salesRecordId || "").trim();
    const skuKey = normalizeText(product.sku);
    const variantKey = `${normalizeText(product.category)}|${normalizeText(product.size)}`;

    if (salesKey && !bySalesRecordId.has(salesKey)) {
      bySalesRecordId.set(salesKey, product);
    }
    if (skuKey && !bySku.has(skuKey)) {
      bySku.set(skuKey, product);
    }
    if (variantKey !== "|" && !byVariant.has(variantKey)) {
      byVariant.set(variantKey, product);
    }
  }

  let created = 0;
  let updated = 0;

  for (const record of salesRecords) {
    const salesKey = String(record._id);
    const computedSku = toSku(record.category, record.size);
    const skuKey = normalizeText(computedSku);
    const variantKey = `${normalizeText(record.category)}|${normalizeText(record.size)}`;

    let target = bySalesRecordId.get(salesKey) || bySku.get(skuKey) || byVariant.get(variantKey);

    if (target) {
      await POSProduct.updateOne(
        { _id: target._id },
        {
          $set: {
            category: record.category,
            size: record.size,
            name: `${record.category} - ${record.size}`,
            sku: computedSku,
            salesRecordId: record._id,
            active: true
          }
        }
      );
      updated += 1;

      const refreshedTarget = {
        ...target,
        category: record.category,
        size: record.size,
        name: `${record.category} - ${record.size}`,
        sku: computedSku,
        salesRecordId: record._id,
        active: true
      };

      bySalesRecordId.set(salesKey, refreshedTarget);
      bySku.set(skuKey, refreshedTarget);
      byVariant.set(variantKey, refreshedTarget);
      continue;
    }

    const createdProduct = await POSProduct.create({
      category: record.category,
      size: record.size,
      name: `${record.category} - ${record.size}`,
      sku: computedSku,
      salesRecordId: record._id,
      price: 0,
      stockOnHand: 0,
      stockInWarehouse: 0,
      active: true
    });

    created += 1;
    const createdLean = createdProduct.toObject();
    bySalesRecordId.set(salesKey, createdLean);
    bySku.set(skuKey, createdLean);
    byVariant.set(variantKey, createdLean);
  }

  const linkedProducts = await POSProduct.find({ salesRecordId: { $ne: null } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("_id salesRecordId")
    .lean();

  const canonicalBySalesRecord = new Map();
  const duplicateLinkedIds = [];

  for (const product of linkedProducts) {
    const key = String(product.salesRecordId || "").trim();
    if (!key) {
      continue;
    }

    const existing = canonicalBySalesRecord.get(key);
    if (!existing) {
      canonicalBySalesRecord.set(key, product);
      continue;
    }

    const canonical = pickCanonicalProduct(existing, product);
    const duplicate = String(canonical._id) === String(existing._id) ? product : existing;
    canonicalBySalesRecord.set(key, canonical);
    duplicateLinkedIds.push(duplicate._id);
  }

  let removedDuplicates = 0;
  if (duplicateLinkedIds.length) {
    const deleteResult = await POSProduct.deleteMany({ _id: { $in: duplicateLinkedIds } });
    removedDuplicates = deleteResult.deletedCount || 0;
  }

  return {
    synced: updated + created,
    created,
    updated,
    removedDuplicates,
    deactivated: 0
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