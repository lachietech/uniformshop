import mongoose from "mongoose";
import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import salesRoutes from "./routes/sales.js";
import Sales from "./models/Sales.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

async function loadSalesData() {
  try {
    const jsonPath = path.join(import.meta.dirname, "../sales.json");
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    
    const months = jsonData.months;
    const count = await Sales.countDocuments({});
    
    if (count === 0) {
      const salesRecords = [];
      for (const product of jsonData.products) {
        for (const sizeObj of product.sizes) {
          salesRecords.push({
            category: product.category,
            size: sizeObj.size,
            months: months,
            sales: sizeObj.sales
          });
        }
      }
      await Sales.insertMany(salesRecords);
      console.log(`✓ Loaded ${salesRecords.length} sales records`);
    }
  } catch (error) {
    console.error("Error loading sales data:", error.message);
  }
}

mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("MongoDB connected");
  loadSalesData();
})
.catch((err) => console.error("MongoDB connection error:", err));

app.use(express.json());
app.use(express.static(path.join(import.meta.dirname , "../frontend")))

// API routes
app.post("/api/auth", (req, res) => {
  const { password } = req.body;
  if (!process.env.APP_PASSWORD) return res.status(500).json({ error: "Password not configured" });
  if (password === process.env.APP_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ ok: false });
});

app.use("/api", salesRoutes);

app.get("/", (req, res) => {
    res.sendFile(path.join(import.meta.dirname , "../frontend/templates/index.html"));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
