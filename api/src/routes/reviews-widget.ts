import { Router, Request, Response } from "express";
import { getCachedReviews } from "../integrations/google/reviews";
import rateLimit from "express-rate-limit";

export const reviewsWidgetRouter = Router();

const limiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: "Rate limit" } });

// ── GET /api/reviews/data — reviews público (para widget NuvemShop) ──

reviewsWidgetRouter.get("/data", limiter, async (_req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=3600"); // 1h cache
  const data = await getCachedReviews();
  res.json(data);
});

// ── GET /api/reviews/widget.js — script JS do widget ─────────────

reviewsWidgetRouter.get("/widget.js", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.removeHeader("Cross-Origin-Resource-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.removeHeader("X-Frame-Options");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiBase = process.env.LEADS_API_URL || "https://webhook.papelariabibelo.com.br";

  res.send(`
(function() {
  'use strict';

  var API = '${apiBase}/api/reviews/data';
  var REVIEW_LINK = 'https://g.page/r/CdahFa43hhIXEAE/review';

  // Busca reviews
  fetch(API)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.reviews || data.reviews.length === 0) return;
      injectWidget(data);
    })
    .catch(function() {});

  function injectWidget(data) {
    var stars = '';
    for (var i = 0; i < Math.round(data.overall_rating); i++) stars += '\\u2B50';

    // Container principal
    var widget = document.createElement('div');
    widget.id = 'bibelo-reviews-widget';
    widget.style.cssText = 'max-width:1200px;margin:32px auto;padding:0 16px;font-family:Nunito,Jost,Segoe UI,Arial,sans-serif;';

    // Header
    var header = '<div style="text-align:center;margin-bottom:24px;">';
    header += '<p style="font-size:14px;color:#a07090;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;">O que nossas clientes dizem</p>';
    header += '<p style="font-size:28px;margin:0 0 4px;">' + stars + '</p>';
    header += '<p style="font-size:16px;color:#333;font-weight:800;margin:0;">' + data.overall_rating + '/5 \\u2014 ' + data.total_reviews + ' avalia\\u00E7\\u00F5es no Google</p>';
    header += '</div>';

    // Fotos (se tiver)
    var photosHtml = '';
    if (data.photos && data.photos.length > 0) {
      photosHtml = '<div style="display:flex;gap:8px;overflow-x:auto;padding:0 0 16px;margin-bottom:20px;-webkit-overflow-scrolling:touch;">';
      data.photos.slice(0, 6).forEach(function(url) {
        photosHtml += '<img src="' + url + '" alt="Foto cliente" loading="lazy" style="width:120px;height:120px;object-fit:cover;border-radius:12px;flex-shrink:0;border:2px solid #fce7f3;" />';
      });
      photosHtml += '</div>';
    }

    // Reviews
    var reviewsHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">';
    data.reviews.slice(0, 3).forEach(function(r) {
      if (!r.text || r.text.length < 10) return;
      var rStars = '';
      for (var j = 0; j < r.rating; j++) rStars += '\\u2B50';
      var text = r.text.length > 150 ? r.text.slice(0, 147) + '...' : r.text;
      var authorPhoto = r.profile_photo_url
        ? '<img src="' + r.profile_photo_url + '" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" />'
        : '<div style="width:36px;height:36px;border-radius:50%;background:#fce7f3;display:flex;align-items:center;justify-content:center;font-size:16px;color:#f43f8e;font-weight:700;">' + (r.author_name || 'C').charAt(0).toUpperCase() + '</div>';

      reviewsHtml += '<div style="background:#fff;border:2px solid #fce7f3;border-radius:16px;padding:20px;transition:border-color 0.2s;">';
      reviewsHtml += '<p style="font-size:14px;margin:0 0 4px;">' + rStars + '</p>';
      reviewsHtml += '<p style="font-size:14px;color:#555;line-height:1.5;margin:0 0 14px;font-style:italic;">\\u201C' + text + '\\u201D</p>';
      reviewsHtml += '<div style="display:flex;align-items:center;gap:10px;">';
      reviewsHtml += authorPhoto;
      reviewsHtml += '<div><p style="font-size:13px;font-weight:700;color:#333;margin:0;">' + (r.author_name || 'Cliente') + '</p>';
      reviewsHtml += '<p style="font-size:11px;color:#a07090;margin:0;">via Google</p></div>';
      reviewsHtml += '</div></div>';
    });
    reviewsHtml += '</div>';

    // CTA
    var cta = '<div style="text-align:center;margin-top:20px;">';
    cta += '<a href="' + REVIEW_LINK + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;color:#f43f8e;font-size:14px;font-weight:700;text-decoration:none;">Ver todas as avalia\\u00E7\\u00F5es no Google';
    cta += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></a>';
    cta += '<p style="font-size:10px;color:#ccc;margin:8px 0 0;">Powered by Google</p>';
    cta += '</div>';

    widget.innerHTML = header + photosHtml + reviewsHtml + cta;

    // Inserir no site — logo após o primeiro banner/slider ou no início do main
    var target = document.querySelector('.js-home-main-content, main, #content, .container, .page-content');
    if (target) {
      // Insere como primeiro filho do conteúdo principal
      target.insertBefore(widget, target.firstChild);
    } else {
      // Fallback: insere após o header
      var header_el = document.querySelector('header, .js-head-main, nav');
      if (header_el && header_el.nextSibling) {
        header_el.parentNode.insertBefore(widget, header_el.nextSibling);
      }
    }
  }
})();
`);
});
