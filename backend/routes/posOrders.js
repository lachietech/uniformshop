import express from "express";
import mongoose from "mongoose";
import POSOrder from "../models/POSOrder.js";
import POSProduct from "../models/POSProduct.js";
import { applyPosOrderToSales } from "../services/posIntegration.js";
import { buildReceiptContent } from "../services/receiptEmail.js";

const router = express.Router();

const ALLOWED_PAYMENT_METHODS = ["cash", "card", "center-pay"];

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function parseBoundedInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function generateOrderNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 9000 + 1000).toString();
  return `ORD-${datePart}-${rand}`;
}

router.get("/", async (req, res) => {
  try {
    const limit = parseBoundedInt(req.query.limit, 100, { min: 1, max: 500 });
    const skip = parseBoundedInt(req.query.skip, 0, { min: 0, max: 100000 });
    const filter = {};

    if (req.query.date) {
      const start = new Date(req.query.date);
      const end = new Date(req.query.date);
      end.setDate(end.getDate() + 1);
      if (isNaN(start.getTime())) {
        return res.status(400).json({ error: "Invalid date" });
      }
      filter.createdAt = { $gte: start, $lt: end };
    }

    const orders = await POSOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/receipts", async (req, res) => {
  try {
    const limit = parseBoundedInt(req.query.limit, 100, { min: 1, max: 500 });
    const receipts = await POSOrder.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("orderNumber createdAt total paymentMethod receiptStatus receiptSentAt receiptError cashierUsername");

    res.json(receipts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/receipt", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid order id" });
    }

    const order = await POSOrder.findById(req.params.id).lean();
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const receipt = buildReceiptContent(order);
    return res.json({
      orderId: order._id,
      orderNumber: order.orderNumber,
      receiptEmail: order.receiptEmail,
      receiptStatus: order.receiptStatus,
      createdAt: order.createdAt,
      text: receipt.text,
      html: receipt.html
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { items, paymentMethod, amountTendered } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items in order" });
    }
    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    const productIds = [];
    for (const item of items) {
      if (!isValidObjectId(item.productId)) {
        return res.status(400).json({ error: "Invalid product id in order item" });
      }
      productIds.push(item.productId);
    }

    const products = await POSProduct.find({ _id: { $in: productIds }, active: true }).lean();
    const productsById = new Map(products.map((product) => [String(product._id), product]));

    const normalizedItems = [];
    for (const item of items) {
      const qty = Number(item.qty || 0);
      if (!Number.isFinite(qty) || qty < 1) {
        return res.status(400).json({ error: "Invalid item quantity" });
      }

      const matched = productsById.get(String(item.productId || ""));
      if (!matched) {
        return res.status(400).json({ error: `Product unavailable for item: ${item.name || "Unknown"}` });
      }

      if (Number(matched.stockOnHand || 0) < qty) {
        return res.status(400).json({ error: `Insufficient stock on hand for ${matched.name}` });
      }

      const price = Number(matched.price || 0);
      normalizedItems.push({
        productId: matched._id,
        salesRecordId: matched.salesRecordId || null,
        name: matched.name,
        category: matched.category,
        size: matched.size,
        price,
        qty,
        subtotal: Number((price * qty).toFixed(2))
      });
    }

    const subtotal = normalizedItems.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
    const total = subtotal;
    const tendered = paymentMethod === "cash" ? parseFloat(amountTendered) || 0 : 0;
    const change = paymentMethod === "cash" ? Math.max(0, tendered - total) : 0;

    if (paymentMethod === "cash" && tendered < total) {
      return res.status(400).json({ error: "Cash tendered must cover order total" });
    }

    const order = new POSOrder({
      orderNumber: generateOrderNumber(),
      items: normalizedItems,
      subtotal,
      total,
      paymentMethod,
      amountTendered: tendered,
      change,
      receiptStatus: "saved",
      cashierUsername: req.user?.username || ""
    });

    await order.save();

    const stockDeltas = new Map();
    for (const item of normalizedItems) {
      const productId = String(item.productId);
      const currentDelta = stockDeltas.get(productId) || 0;
      stockDeltas.set(productId, currentDelta + Number(item.qty || 0));
    }

    if (stockDeltas.size) {
      await POSProduct.bulkWrite(
        [...stockDeltas.entries()].map(([productId, quantity]) => ({
          updateOne: {
            filter: { _id: productId },
            update: { $inc: { stockOnHand: -quantity } }
          }
        }))
      );
    }

    await applyPosOrderToSales(normalizedItems);

    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
