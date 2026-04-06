import express from "express";
import fs from "fs";
import path from "path";
import { resolveAuthenticatedUser } from "../middleware/auth.js";

const router = express.Router();

const templatesRoot = path.join(import.meta.dirname, "../../frontend/templates");
const layoutPath = path.join(templatesRoot, "layout.html");
const signinPath = path.join(templatesRoot, "signin.html");

const pageDefinitions = [
  { route: "/dashboard", pageId: "dashboard", template: "dashboard", title: "Dashboard" },
  { route: "/sales-records", pageId: "view", template: "sales-records", title: "Sales Records" },
  { route: "/pos", pageId: "pos", template: "pos", title: "Point of Sale" },
  { route: "/receipts", pageId: "receipts", template: "receipts", title: "Receipts" },
  { route: "/stock-manager", pageId: "stock", template: "stock-manager", title: "Stock Manager" },
  { route: "/access-management", pageId: "access", template: "access-management", title: "Access Management" },
  { route: "/account", pageId: "account", template: "account", title: "My Account" }
];

function readTemplate(relativePath) {
  return fs.readFileSync(path.join(templatesRoot, relativePath), "utf8");
}

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
  if (!nextValue.startsWith("/") || nextValue.startsWith("//") || nextValue.startsWith("/signin")) {
    return "/dashboard";
  }
  return nextValue;
}

function renderPage(pageDefinition, user) {
  const layout = fs.readFileSync(layoutPath, "utf8");
  const pageContent = readTemplate(path.join("pages", `${pageDefinition.template}.html`));
  const modalsPath = path.join(templatesRoot, "modals", `${pageDefinition.template}.html`);
  const modals = fs.existsSync(modalsPath)
    ? fs.readFileSync(modalsPath, "utf8")
    : "";
  const sessionUserJson = JSON.stringify(user || null).replace(/</g, "\\u003c");

  return layout
    .replaceAll("{{PAGE_TITLE}}", pageDefinition.title)
    .replaceAll("{{PAGE_ID}}", pageDefinition.pageId)
    .replace("{{SESSION_USER_JSON}}", sessionUserJson)
    .replace("{{PAGE_CONTENT}}", pageContent)
    .replace("{{PAGE_MODALS}}", modals);
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

  const signinTemplate = fs.readFileSync(signinPath, "utf8");
  return res.send(signinTemplate);
});

router.get("/monthly-update", requirePageAuth, (req, res) => {
  res.redirect("/sales-records");
});

for (const pageDefinition of pageDefinitions) {
  router.get(pageDefinition.route, requirePageAuth, (req, res) => {
    res.send(renderPage(pageDefinition, req.user));
  });
}

export default router;