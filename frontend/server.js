const express = require("express");
const path    = require("path");

const app  = express();
const PORT = process.env.FRONTEND_PORT || 3000;
const DIST = path.join(__dirname, "dist");

// Arquivos estáticos
app.use(express.static(DIST, {
  maxAge:  "1d",
  etag:    true,
  index:   false,
}));

// Health check
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", app: "BibelôCRM Frontend" });
});

// SPA — todas as rotas vão para index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BibelôCRM Frontend rodando na porta ${PORT}`);
});
