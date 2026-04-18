import { Router } from "express";
import multer from "multer";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos PDF são permitidos"));
    }
  },
});

// POST /api/impressao/combinar
// Layout: A4 paisagem — DANFE à esquerda | linha de corte | Etiqueta à direita
// Etiqueta Correios (10×15cm) preenche o lado direito inteiro (~140% ampliada)
// DANFE A5/A4 preenche o lado esquerdo ao máximo
router.post(
  "/combinar",
  authMiddleware,
  upload.fields([
    { name: "danfe", maxCount: 1 },
    { name: "etiqueta", maxCount: 1 },
  ]),
  async (req, res) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files?.danfe?.[0] || !files?.etiqueta?.[0]) {
      return res
        .status(400)
        .json({ error: "Envie os dois arquivos: danfe e etiqueta" });
    }

    try {
      const danfePdf    = await PDFDocument.load(files.danfe[0].buffer);
      const etiquetaPdf = await PDFDocument.load(files.etiqueta[0].buffer);

      const outputDoc = await PDFDocument.create();

      // A4 paisagem: 841.89 × 595.28 pts
      const pageW = 841.89;
      const pageH = 595.28;
      const margin   = 6;   // ~2mm
      const cutGap   = 14;  // espaço total da linha de corte (7mm)
      const cutLineX = pageW / 2;

      // Área útil de cada lado
      const slotW = cutLineX - margin - cutGap / 2;   // ~408 pts = ~144mm
      const slotH = pageH - margin * 2;               // ~583 pts = ~206mm

      // Dimensões customizadas (cm → pts, limitadas ao slot)
      const CM_TO_PT = 28.3465;
      const danfeW_cm    = parseFloat(req.body?.danfeW)    || 0;
      const danfeH_cm    = parseFloat(req.body?.danfeH)    || 0;
      const etiquetaW_cm = parseFloat(req.body?.etiquetaW) || 0;
      const etiquetaH_cm = parseFloat(req.body?.etiquetaH) || 0;
      const danfeMaxW    = danfeW_cm    > 0 ? Math.min(danfeW_cm    * CM_TO_PT, slotW) : slotW;
      const danfeMaxH    = danfeH_cm    > 0 ? Math.min(danfeH_cm    * CM_TO_PT, slotH) : slotH;
      const etiquetaMaxW = etiquetaW_cm > 0 ? Math.min(etiquetaW_cm * CM_TO_PT, slotW) : slotW;
      const etiquetaMaxH = etiquetaH_cm > 0 ? Math.min(etiquetaH_cm * CM_TO_PT, slotH) : slotH;

      const page = outputDoc.addPage([pageW, pageH]);
      const font = await outputDoc.embedFont(StandardFonts.Helvetica);

      // ── Embedar PDFs ────────────────────────────────────────────
      const [danfePage]    = await outputDoc.embedPdf(danfePdf,    [0]);
      const [etiquetaPage] = await outputDoc.embedPdf(etiquetaPdf, [0]);

      // ── DANFE — lado esquerdo ────────────────────────────────────
      const dd = danfePage.scale(1);
      const ds = Math.min(danfeMaxW / dd.width, danfeMaxH / dd.height);
      const dW = dd.width  * ds;
      const dH = dd.height * ds;
      const dX = margin + (slotW - dW) / 2;
      const dY = margin + (slotH - dH) / 2;

      page.drawPage(danfePage, { x: dX, y: dY, width: dW, height: dH });

      page.drawText("DANFE SIMPLIFICADA (NF)", {
        x: margin,
        y: pageH - margin - 7,
        size: 6,
        font,
        color: rgb(0.6, 0.6, 0.6),
      });

      // ── Linha de corte vertical ──────────────────────────────────
      const dashStep = 8;
      for (let y = margin + 10; y < pageH - margin - 10; y += dashStep) {
        page.drawLine({
          start: { x: cutLineX, y },
          end:   { x: cutLineX, y: Math.min(y + 4, pageH - margin - 10) },
          thickness: 0.7,
          color: rgb(0.45, 0.45, 0.45),
        });
      }

      // Rótulo "recorte aqui" rotacionado 90° ao longo da linha
      const labelText  = "recorte aqui";
      const labelSize  = 6.5;
      const labelWidth = font.widthOfTextAtSize(labelText, labelSize);
      page.drawText(labelText, {
        x:      cutLineX + 3,
        y:      pageH / 2 - labelWidth / 2,
        size:   labelSize,
        font,
        color:  rgb(0.5, 0.5, 0.5),
        rotate: degrees(90),
      });

      // ── Etiqueta — lado direito ──────────────────────────────────
      const ed = etiquetaPage.scale(1);
      const es = Math.min(etiquetaMaxW / ed.width, etiquetaMaxH / ed.height);
      const eW = ed.width  * es;
      const eH = ed.height * es;
      const eX = cutLineX + cutGap / 2 + (slotW - eW) / 2;
      const eY = margin    + (slotH - eH) / 2;

      page.drawPage(etiquetaPage, { x: eX, y: eY, width: eW, height: eH });

      page.drawText("ETIQUETA DE ENVIO", {
        x: cutLineX + cutGap / 2,
        y: pageH - margin - 7,
        size: 6,
        font,
        color: rgb(0.6, 0.6, 0.6),
      });

      // ── Salvar ───────────────────────────────────────────────────
      const pdfBytes = await outputDoc.save();

      logger.info("Impressão: PDF A4 paisagem gerado", {
        danfeSize:     files.danfe[0].size,
        etiquetaSize:  files.etiqueta[0].size,
        outputSize:    pdfBytes.byteLength,
        danfeScale:    ds.toFixed(3),
        etiquetaScale: es.toFixed(3),
        dims: { danfeW_cm, danfeH_cm, etiquetaW_cm, etiquetaH_cm },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="etiqueta-impressao.pdf"');
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      logger.error("Impressão: erro ao combinar PDFs", { err });
      res.status(500).json({
        error: "Erro ao processar os PDFs. Verifique se os arquivos são PDFs válidos.",
      });
    }
  }
);

export { router as impressaoRouter };
