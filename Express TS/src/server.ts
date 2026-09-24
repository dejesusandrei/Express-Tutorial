import express from "express";
import cors from "cors";
import { env } from "./config/env.js";


// Global Middleware
import requestLogger from "./middleware/requestLogger.js";

// Routers
import userRouter from "./routers/user.route.js";
import taskRoute from "./routers/task.route.js";
import authRouter from "./routers/auth.route.js";

// Error Middleware
import notFound from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();


// =========================
// Global Middleware
// =========================

app.use(express.json());
app.use(requestLogger);

app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true
  })
);


// =========================
// Routes
// =========================

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/tasks", taskRoute);

app.get("/", (req, res) => {
  res.status(200).json({
    msg: "Hello Express!",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
  });
});

// =========================
// Error Handling
// =========================

// 404 handler
// Runs when no route above matches the request.
app.use(notFound);

// Global error handler
// Handles errors thrown from controllers, services, etc.
app.use(errorHandler);


// =========================
// Start Server
// =========================
app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
});