import mongoose from "mongoose";

const posProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    size: { type: String, trim: true, default: "" },
    sku: { type: String, trim: true, default: "" },
    salesRecordId: { type: mongoose.Schema.Types.ObjectId, ref: "Sales", default: null },
    stockOnHand: { type: Number, min: 0, default: 0 },
    stockInWarehouse: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model("POSProduct", posProductSchema);
