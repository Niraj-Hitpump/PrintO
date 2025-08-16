import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import publicRoutes from "./routes/public.routes.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import templateRoutes from "./routes/template.routes.js";
import productRoutes from "./routes/product.routes.js";
import orderRoutes from "./routes/order.routes.js";
import { initializeAdmin } from "../init/adminInit.js";

import AdminRoute from "./routes/admin.routes.js";

// Load env vars
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET", "JWT_REFRESH_SECRET"];
const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);
if (missingEnvVars.length > 0) {
  console.error(
    "❌ Missing required environment variables:",
    missingEnvVars.join(", ")
  );
  process.exit(1);
}

// Initialize Express app
const app = express();

// Connect to database
mongoose
  .connect(process.env.MONGODB_URI, {
    // Add these options to handle deprecation warnings and index management
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ MongoDB Connected Successfully");

    // Optional: Rebuild indexes to ensure they're clean
    try {
      await mongoose.connection.db.collection("users").dropIndexes();
      console.log("✅ User indexes dropped and will be rebuilt");
    } catch (err) {
      console.log("Note: No existing indexes to drop");
    }

    // Initialize admin account after successful DB connection
    initializeAdmin().catch((err) =>
      console.error("Admin initialization error:", err)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// Global Middleware
app.use(cookieParser()); // Add cookie parser
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], // <-- PATCH added here
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Set-Cookie", "Access-Control-Allow-Origin"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers middleware
app.use((req, res, next) => {
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  res.header("Cross-Origin-Embedder-Policy", "require-corp");
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-XSS-Protection", "1; mode=block");
  next();
});

// Cookie middleware configuration
app.use(cookieParser());
app.use((req, res, next) => {
  res.cookie = res.cookie.bind(res);
  const originalCookie = res.cookie;
  res.cookie = function (name, value, options = {}) {
    const secure = process.env.NODE_ENV === "production";
    return originalCookie.call(this, name, value, {
      ...options,
      httpOnly: true,
      secure: secure,
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  };
  next();
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  ); // <-- PATCH included
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  next();
});

app.use("/api/auth", authRoutes);

app.use("/api/admin", AdminRoute);

app.use("/api/public", publicRoutes);

app.use("/api/user/product", productRoutes);

// Protected routes with /api prefix
const apiRouter = express.Router();
app.use("/api", apiRouter);

// Route registration

apiRouter.use("/users", userRoutes);
apiRouter.use("/templates", templateRoutes);
apiRouter.use("/orders", orderRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  const message = err.message || "Something went wrong!";
  res.status(statusCode).json({
    message,
    stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(
    `Server running in ${
      process.env.NODE_ENV || "development"
    } mode on port ${PORT}`
  );
});
