import mongoose from "mongoose";
import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import salesRoutes from "./routes/sales.js";
import Sales from "./models/Sales.js";
import posProductsRoutes from "./routes/posProducts.js";
import posOrdersRoutes from "./routes/posOrders.js";
import authRoutes from "./routes/auth.js";
import pageRoutes from "./routes/pages.js";
import { requireAuth, requirePasswordChangeResolved } from "./middleware/auth.js";
import { syncPosProductsFromSalesRecords } from "./services/posIntegration.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.disable("x-powered-by");

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign in attempts. Please try again later." }
});

async function loadSalesData() {
  try {
    const jsonPath = path.join(import.meta.dirname, "../sales.json");
    if (!fs.existsSync(jsonPath)) {
      return;
    }
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
  syncPosProductsFromSalesRecords().catch((error) => {
    console.error("Unable to sync POS products from sales records:", error.message);
  });
})
.catch((err) => console.error("MongoDB connection error:", err));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  },
  crossOriginOpenerPolicy: { policy: "same-origin" }
}));
app.use(generalLimiter);
app.use(cookieParser());
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(import.meta.dirname , "../frontend")))

app.use(pageRoutes);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api", requireAuth, requirePasswordChangeResolved, salesRoutes);
app.use("/api/pos/products", requireAuth, requirePasswordChangeResolved, posProductsRoutes);
app.use("/api/pos/orders", requireAuth, requirePasswordChangeResolved, posOrdersRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
