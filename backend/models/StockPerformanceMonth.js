import mongoose from "mongoose";

const StockItemSchema = new mongoose.Schema(
    {
        size: { type: String, default: "" },
        openingStock: { type: Number, default: null },
        purchases: { type: Number, default: null },
        stockOnHand: { type: Number, default: null },
        sales: { type: Number, default: null },
        costPrice: { type: Number, default: null },
        valueOfStock: { type: Number, default: null },
        rawRowIndex: { type: Number, required: true },
    },
    { _id: false }
);

const CategorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        items: { type: [StockItemSchema], default: [] },
    },
    { _id: false }
);

const TotalsSchema = new mongoose.Schema(
    {
        openingStock: { type: Number, default: 0 },
        purchases: { type: Number, default: 0 },
        stockOnHand: { type: Number, default: 0 },
        sales: { type: Number, default: 0 },
        valueOfStock: { type: Number, default: 0 },
    },
    { _id: false }
);

const StockPerformanceMonthSchema = new mongoose.Schema(
    {
        month: { type: String, required: true, unique: true, index: true },
        sheetIndex: { type: Number, required: true },
        sourceFile: { type: String, required: true },
        rawRows: { type: [[mongoose.Schema.Types.Mixed]], default: [] },
        categories: { type: [CategorySchema], default: [] },
        totals: { type: TotalsSchema, required: true },
        generatedAt: { type: Date, required: true },
        syncedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model("StockPerformanceMonth", StockPerformanceMonthSchema);
