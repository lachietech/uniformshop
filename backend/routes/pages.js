import express from "express";
import path from "path";
import { resolveAuthenticatedUser } from "../middleware/auth.js";

const router = express.Router();

const frontendRoot = path.join(import.meta.dirname, "../../frontend");
const signinPath = path.join(frontendRoot, "templates", "signin.html");
const appShellPath = path.join(frontendRoot, "templates", "index.html");

const appRoutes = [
  "/dashboard",
  "/sales-records",
  "/pos",
  "/receipts",
  "/stock-manager",
  "/access-management",
  "/account"
];
const allowedNextTargets = new Set(["/dashboard", ...appRoutes]);

async function requirePageAuth(req, res, next) {
  const user = await resolveAuthenticatedUser(req, res);
  if (!user) {
    const target = encodeURIComponent(req.originalUrl || "/dashboard");
    return res.redirect(`/signin?next=${target}`);
  }

  req.user = user;
  next();
}

function getSafeNextTarget(nextValue) {
  if (typeof nextValue !== "string") {
    return "/dashboard";
  }

  const trimmedValue = nextValue.trim();
  if (!allowedNextTargets.has(trimmedValue)) {
    return "/dashboard";
  }

  return trimmedValue;
}

router.get("/", async (req, res) => {
  const user = await resolveAuthenticatedUser(req, res);
  if (!user) {
    return res.redirect("/signin");
  }
  return res.redirect("/dashboard");
});

router.get("/signin", async (req, res) => {
  const user = await resolveAuthenticatedUser(req, res);
  if (user) {
    const nextTarget = getSafeNextTarget(req.query.next);
    return res.redirect(nextTarget);
  }

  return res.sendFile(signinPath);
});

router.get("/monthly-update", requirePageAuth, (req, res) => {
  res.redirect("/sales-records");
});

for (const route of appRoutes) {
  router.get(route, requirePageAuth, (req, res) => {
    res.sendFile(appShellPath);
  });
}

export default router;