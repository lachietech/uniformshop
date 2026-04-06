import express from "express";
import POSOrder from "../models/POSOrder.js";
import POSProduct from "../models/POSProduct.js";
import { applyPosOrderToSales } from "../services/posIntegration.js";
import { buildReceiptContent } from "../services/receiptEmail.js";

const router = express.Router();

const ALLOWED_PAYMENT_METHODS = ["cash", "card", "center-pay"];

function generateOrderNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 9000 + 1000).toString();
  return `ORD-${datePart}-${rand}`;
}

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const skip = parseInt(req.query.skip, 10) || 0;
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
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
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

    const productIds = items
      .map((item) => item.productId)
      .filter(Boolean);
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

    for (const item of normalizedItems) {
      await POSProduct.findByIdAndUpdate(item.productId, { $inc: { stockOnHand: -Number(item.qty || 0) } });
    }

    await applyPosOrderToSales(normalizedItems);

    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
