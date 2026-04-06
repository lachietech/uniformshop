import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "POSProduct" },
    salesRecordId: { type: mongoose.Schema.Types.ObjectId, ref: "Sales", default: null },
    name: { type: String, required: true },
    category: { type: String, default: "" },
    size: { type: String, default: "" },
    price: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true }
  },
  { _id: false }
);

const posOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    paymentMethod: { type: String, enum: ["cash", "card", "center-pay"], required: true },
    amountTendered: { type: Number, default: 0 },
    change: { type: Number, default: 0 },
    receiptEmail: { type: String, trim: true, lowercase: true, default: "" },
    receiptStatus: { type: String, enum: ["not-requested", "saved", "sent", "failed"], default: "saved" },
    receiptSentAt: { type: Date, default: null },
    receiptError: { type: String, default: "" },
    cashierUsername: { type: String, default: "" }
  },
  { timestamps: true }
);

export default mongoose.model("POSOrder", posOrderSchema);
