import mongoose from "mongoose";

const salesSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ["Shirts", "Shorts", "Hat", "Skorts"]
  },
  size: {
    type: String,
    required: true
  },
  months: {
    type: [String],
    required: true,
    default: []
  },
  sales: {
    type: [Number],
    required: true,
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure months and sales arrays are same length
salesSchema.pre('save', function() {
  this.updatedAt = Date.now();
  if (this.months.length !== this.sales.length) {
    throw new Error("Months and sales arrays must have the same length");
  }
});

export default mongoose.model('Sales', salesSchema);
