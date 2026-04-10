import { Router, Request, Response } from "express";
import { getCachedReviews } from "../integrations/google/reviews";
import rateLimit from "express-rate-limit";
import { escJs } from "../utils/sanitize";

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

  var API = '${escJs(apiBase)}/api/reviews/data';
  var REVIEW_LINK = 'https://g.page/r/CdahFa43hhIXEAE/review';

  function escH(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // Só exibe na home page
  var path = window.location.pathname;
  if (path !== '/' && path !== '') return;

  console.log('[BibeloReviews] Carregando widget...');

  // Busca reviews
  fetch(API)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      console.log('[BibeloReviews] Dados recebidos:', data.reviews ? data.reviews.length + ' reviews' : 'sem dados');
      if (!data || !data.reviews || data.reviews.length === 0) return;
      injectWidget(data);
    })
    .catch(function(e) { console.error('[BibeloReviews] Erro:', e); });

  function isValidUrl(s) {
    return typeof s === 'string' && s.indexOf('http') === 0;
  }

  function injectWidget(data) {
    // Remove widget anterior se existir
    var old = document.getElementById('bibelo-reviews-widget');
    if (old) old.remove();

    var stars = '';
    for (var i = 0; i < Math.round(data.overall_rating); i++) stars += '\\u2B50';

    // Container principal — full width com fundo rosa claro
    var widget = document.createElement('div');
    widget.id = 'bibelo-reviews-widget';
    widget.style.cssText = 'width:100%;background:#fff9fb;padding:60px 20px;font-family:Nunito,Jost,Segoe UI,Arial,sans-serif;';

    // Estilo dos botões de navegação
    var btnStyle = 'position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:#fff;border:2px solid #fce7f3;color:#f43f8e;font-size:20px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.1);transition:background 0.2s,transform 0.2s;z-index:2;';

    var inner = '<div style="max-width:1400px;margin:0 auto;">';

    // Header
    inner += '<div style="text-align:center;margin-bottom:40px;">';
    inner += '<p style="font-size:13px;color:#f43f8e;font-weight:800;text-transform:uppercase;letter-spacing:3px;margin:0 0 12px;">\\u2665 Avalia\\u00E7\\u00F5es reais</p>';
    inner += '<h2 style="font-size:32px;color:#333;font-weight:800;margin:0 0 12px;">O que nossas clientes dizem</h2>';
    inner += '<p style="font-size:42px;margin:0 0 8px;line-height:1;">' + stars + '</p>';
    inner += '<p style="font-size:20px;color:#555;font-weight:700;margin:0;">' + data.overall_rating + ' de 5 \\u2014 <span style="color:#f43f8e;">' + data.total_reviews + ' avalia\\u00E7\\u00F5es</span> no Google</p>';
    inner += '</div>';

    // ── Fotos (sem carrossel — mostra todas lado a lado) ──
    var validPhotos = [];
    if (data.photos) {
      data.photos.forEach(function(url) { if (isValidUrl(url)) validPhotos.push(url); });
    }
    var photosHtml = '';
    if (validPhotos.length > 0) {
      photosHtml += '<div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-bottom:40px;">';
      validPhotos.forEach(function(url) {
        photosHtml += '<img src="' + escH(url) + '" alt="Foto de cliente" loading="lazy" style="width:200px;height:200px;object-fit:cover;border-radius:16px;flex-shrink:0;border:3px solid #fce7f3;box-shadow:0 4px 12px rgba(244,63,142,0.1);transition:transform 0.3s;" onmouseover="this.style.transform=\\'scale(1.05)\\'" onmouseout="this.style.transform=\\'none\\'" />';
      });
      photosHtml += '</div>';
    }

    // ── Carrossel de reviews ──
    var validReviews = [];
    data.reviews.forEach(function(r) {
      if (r.text && r.text.length >= 10) validReviews.push(r);
    });

    var reviewsHtml = '<div style="position:relative;margin-bottom:36px;">';
    reviewsHtml += '<div id="br-reviews-track" style="display:flex;gap:24px;overflow:hidden;scroll-behavior:smooth;padding:4px;">';

    validReviews.forEach(function(r, idx) {
      var rStars = '';
      for (var j = 0; j < r.rating; j++) rStars += '\\u2B50';
      var text = r.text.length > 250 ? r.text.slice(0, 247) + '...' : r.text;

      var photoUrl = r.profile_photo_url;
      var authorPhoto;
      if (isValidUrl(photoUrl)) {
        authorPhoto = '<img src="' + escH(photoUrl) + '" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #fce7f3;" />';
      } else {
        authorPhoto = '<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#fce7f3,#f43f8e);display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;font-weight:700;">' + escH((r.author_name || 'C').charAt(0).toUpperCase()) + '</div>';
      }

      reviewsHtml += '<div data-br-review="' + idx + '" style="min-width:340px;max-width:400px;flex-shrink:0;background:#fff;border:2px solid #fce7f3;border-radius:20px;padding:28px;box-shadow:0 4px 16px rgba(244,63,142,0.06);transition:transform 0.2s,box-shadow 0.2s;" onmouseover="this.style.transform=\\'translateY(-4px)\\';this.style.boxShadow=\\'0 8px 24px rgba(244,63,142,0.12)\\'" onmouseout="this.style.transform=\\'none\\';this.style.boxShadow=\\'0 4px 16px rgba(244,63,142,0.06)\\'">';
      reviewsHtml += '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">';
      reviewsHtml += authorPhoto;
      reviewsHtml += '<div><p style="font-size:16px;font-weight:700;color:#333;margin:0;">' + escH(r.author_name || 'Cliente') + '</p>';
      reviewsHtml += '<p style="font-size:12px;color:#a07090;margin:2px 0 0;">via Google \\u2022 ' + escH(r.relative_time_description || '') + '</p></div>';
      reviewsHtml += '</div>';
      reviewsHtml += '<p style="font-size:18px;margin:0 0 12px;line-height:1;">' + rStars + '</p>';
      reviewsHtml += '<p style="font-size:15px;color:#555;line-height:1.7;margin:0;font-style:italic;">\\u201C' + escH(text) + '\\u201D</p>';
      reviewsHtml += '</div>';
    });
    reviewsHtml += '</div>';

    if (validReviews.length > 1) {
      reviewsHtml += '<button id="br-reviews-prev" style="' + btnStyle + 'left:-16px;" aria-label="Anterior">\\u2039</button>';
      reviewsHtml += '<button id="br-reviews-next" style="' + btnStyle + 'right:-16px;" aria-label="Pr\\u00F3ximo">\\u203A</button>';
    }
    reviewsHtml += '</div>';

    // Indicadores (bolinhas)
    if (validReviews.length > 1) {
      reviewsHtml += '<div id="br-reviews-dots" style="display:flex;justify-content:center;gap:8px;margin-bottom:32px;">';
      validReviews.forEach(function(_, idx) {
        reviewsHtml += '<span data-br-dot="' + idx + '" style="width:10px;height:10px;border-radius:50%;background:' + (idx === 0 ? '#f43f8e' : '#fce7f3') + ';cursor:pointer;transition:background 0.3s;"></span>';
      });
      reviewsHtml += '</div>';
    }

    // CTA — bot\\u00E3o rosa
    var cta = '<div style="text-align:center;">';
    cta += '<a href="' + REVIEW_LINK + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;background:#f43f8e;color:#fff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:50px;box-shadow:0 4px 16px rgba(244,63,142,0.3);transition:transform 0.2s,box-shadow 0.2s;" onmouseover="this.style.transform=\\'scale(1.05)\\';this.style.boxShadow=\\'0 6px 24px rgba(244,63,142,0.4)\\'" onmouseout="this.style.transform=\\'none\\';this.style.boxShadow=\\'0 4px 16px rgba(244,63,142,0.3)\\'">';
    cta += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>';
    cta += 'Avaliar no Google</a>';
    cta += '<p style="font-size:12px;color:#bbb;margin:12px 0 0;">Powered by Google Reviews</p>';
    cta += '</div>';

    inner += photosHtml + reviewsHtml + cta + '</div>';
    widget.innerHTML = inner;

    // ── Lógica dos carrosséis ──
    function setupCarousel(trackId, prevId, nextId, dotsId) {
      var track = document.getElementById(trackId);
      var prev = document.getElementById(prevId);
      var next = document.getElementById(nextId);
      if (!track) return;

      var scrollAmount = track.firstElementChild ? track.firstElementChild.offsetWidth + 24 : 360;

      if (prev) prev.addEventListener('click', function() {
        track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      });
      if (next) next.addEventListener('click', function() {
        track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      });

      // Atualiza bolinhas nos reviews
      if (dotsId) {
        track.addEventListener('scroll', function() {
          var dots = document.querySelectorAll('#' + dotsId + ' span');
          var idx = Math.round(track.scrollLeft / scrollAmount);
          dots.forEach(function(d, i) {
            d.style.background = i === idx ? '#f43f8e' : '#fce7f3';
          });
        });
      }
    }

    setTimeout(function() {
      setupCarousel('br-reviews-track', 'br-reviews-prev', 'br-reviews-next', 'br-reviews-dots');
    }, 100);

    // Inserir antes da seção do Instagram
    var igSection = document.querySelector('.section-instafeed-home');
    if (igSection) {
      igSection.parentNode.insertBefore(widget, igSection);
      console.log('[BibeloReviews] Widget inserido antes do Instagram');
    } else {
      // Fallback: final do container de seções
      var container = document.querySelector('.js-home-sections-container');
      if (container) {
        container.appendChild(widget);
        console.log('[BibeloReviews] Widget inserido no final do container');
      } else {
        document.body.appendChild(widget);
        console.log('[BibeloReviews] Widget inserido no body (fallback)');
      }
    }
  }
})();
`);
});
