import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";

export const leadsScriptRouter = Router();

const scriptLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, message: "// rate limited" });

// ── GET /api/leads/popup.js — script JS servido para a NuvemShop ──

leadsScriptRouter.get("/popup.js", scriptLimiter, (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.removeHeader("Cross-Origin-Resource-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.removeHeader("X-Frame-Options");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiBase = process.env.LEADS_API_URL || "https://webhook.papelariabibelo.com.br";

  res.send(`
(function() {
  'use strict';

  // Bloquear bots/crawlers (Facebook, Google, Bing, etc)
  var ua = (navigator.userAgent || '').toLowerCase();
  if (/facebookexternalhit|facebot|facebookbot|metainspector|googlebot|bingbot|yandexbot|baiduspider|twitterbot|linkedinbot|slurp|duckduckbot|ia_archiver|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider/.test(ua)) return;

  // ── Config ──────────────────────────────────────────────
  var API = '${apiBase}/api/leads';
  var TRACK_API = '${apiBase}/api/tracking';
  var COOKIE_NAME = '_bibelo_popup';
  var COOKIE_DAYS = 30;
  var VID_COOKIE = '_bibelo_vid';

  // ── Helpers ─────────────────────────────────────────────
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    // domain com ponto = cobre www. e sem www.
    var domain = '';
    try { domain = ';domain=.' + window.location.hostname.replace(/^www\\./, ''); } catch(e) {}
    document.cookie = name + '=' + value + ';expires=' + d.toUTCString() + ';path=/' + domain + ';SameSite=Lax';
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // localStorage fallback (cookies podem falhar em aba anônima/cross-page)
  function tryGet(k) { try { return localStorage.getItem(k); } catch(e) { return null; } }
  function trySet(k, v) { try { localStorage.setItem(k, v); } catch(e) {} }

  function trackEvent(visitorId, evento, metadata) {
    var params = new URLSearchParams(window.location.search);
    fetch(TRACK_API + '/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitor_id: visitorId,
        evento: evento,
        pagina: window.location.href,
        pagina_tipo: 'home',
        metadata: metadata || {},
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
        utm_content: params.get('utm_content') || undefined
      })
    }).catch(function() {});
  }

  // ── Forçar abertura via banner (clube=1 ou desconto=1) ──
  var qs = window.location.search;
  var forceClube = /[?&]clube=1/.test(qs);
  var forceDesconto = /[?&]desconto=1/.test(qs);
  var forceOpen = forceClube || forceDesconto;

  // ── Já é lead cadastrado? NUNCA mostrar de novo (nem via banner) ──
  if (getCookie('_bibelo_lead') || tryGet('_bibelo_lead')) return;

  // ── Já mostrou popup nesta sessão? (forceOpen ignora pra abrir via banner) ──
  if (!forceOpen && (getCookie(COOKIE_NAME) || tryGet(COOKIE_NAME))) return;

  // ── Visitor ID ──────────────────────────────────────────
  var vid = getCookie(VID_COOKIE);
  if (!vid) {
    vid = uuid();
    setCookie(VID_COOKIE, vid, 365);
  }

  // ── Buscar config ───────────────────────────────────────
  fetch(API + '/config')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.popups || !data.popups.length) return;

      var timerPopup = null;
      var exitPopup = null;
      var shown = false;

      for (var i = 0; i < data.popups.length; i++) {
        if (data.popups[i].tipo === 'timer') timerPopup = data.popups[i];
        if (data.popups[i].tipo === 'exit_intent') exitPopup = data.popups[i];
      }

      // Forçar abertura imediata via banner (clube=1 ou desconto=1)
      if (forceOpen) {
        var targetPopup = null;
        if (forceDesconto) {
          for (var j = 0; j < data.popups.length; j++) {
            if (data.popups[j].id === 'clube_bibelo') { targetPopup = data.popups[j]; break; }
          }
        }
        if (!targetPopup) targetPopup = timerPopup;
        if (targetPopup) {
          shown = true;
          trackEvent(vid, 'banner_click', { banner: '10% OFF', popup_id: targetPopup.id });
          showPopup(targetPopup, vid);
          if (window.history && window.history.replaceState) {
            var cleanUrl = window.location.href.replace(/[?&](clube|desconto)=1/g, '').replace(/\\?$/, '');
            window.history.replaceState(null, '', cleanUrl);
          }
        }
        return;
      }

      // Timer popup: aparece após X segundos
      if (timerPopup) {
        setTimeout(function() {
          if (!shown) { shown = true; showPopup(timerPopup, vid); }
        }, (timerPopup.delay_segundos || 5) * 1000);
      }

      // Exit intent popup: aparece quando mouse sai da janela (desktop only)
      if (exitPopup && !('ontouchstart' in window)) {
        document.addEventListener('mouseout', function(e) {
          if (shown) return;
          if (e.clientY < 5 && e.relatedTarget === null) {
            shown = true;
            showPopup(exitPopup, vid);
          }
        });
      }
    })
    .catch(function() {});

  // ── Renderizar popup ────────────────────────────────────
  function showPopup(config, visitorId) {
    setCookie(COOKIE_NAME, '1', COOKIE_DAYS);
    trySet(COOKIE_NAME, '1');

    fetch(API + '/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ popup_id: config.id })
    }).catch(function() {});

    trackEvent(visitorId, 'popup_view', { popup_id: config.id, desconto: config.desconto_texto });

    // Google Fonts
    var link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    var campos = config.campos || ['email'];
    var temNome = campos.indexOf('nome') !== -1;
    var temTelefone = campos.indexOf('telefone') !== -1;

    // Overlay
    var overlay = document.createElement('div');
    overlay.id = 'bibelo-popup-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);z-index:999998;opacity:0;transition:opacity 0.3s ease;display:flex;align-items:center;justify-content:center;padding:16px;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:24px;max-width:430px;width:100%;overflow:hidden;box-shadow:0 25px 80px rgba(254,104,196,0.35);transform:translateY(30px) scale(0.95);transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1);font-family:Jost,Arial,sans-serif;';

    var inputStyle = 'width:100%;padding:14px 16px 14px 44px;border:2px solid #ffe5ec;border-radius:14px;font-size:15px;margin-bottom:10px;outline:none;font-family:Jost,Arial,sans-serif;box-sizing:border-box;transition:border-color 0.2s,box-shadow 0.2s;background:#fff;';

    card.innerHTML =
      // ── Header com impacto visual ──
      '<div style="background:linear-gradient(160deg,#ffe5ec 0%,#fff7c1 40%,#ffe5ec 100%);padding:30px 28px 22px;text-align:center;position:relative;overflow:hidden;">' +
        '<div style="position:absolute;top:-30px;right:-30px;width:100px;height:100px;background:rgba(254,104,196,0.08);border-radius:50%;"></div>' +
        '<div style="position:absolute;bottom:-15px;left:-15px;width:60px;height:60px;background:rgba(254,104,196,0.06);border-radius:50%;"></div>' +
        '<button id="bibelo-popup-close" style="position:absolute;top:12px;right:14px;background:rgba(255,255,255,0.8);border:none;width:30px;height:30px;border-radius:50%;font-size:20px;cursor:pointer;color:#999;line-height:1;display:flex;align-items:center;justify-content:center;transition:background 0.2s;">&times;</button>' +
        // Badge grande pulsante
        '<div id="bibelo-popup-badge" style="background:linear-gradient(135deg,#fe68c4,#e91e63);color:#fff;display:inline-block;padding:10px 28px;border-radius:50px;font-size:22px;font-weight:700;margin-bottom:14px;letter-spacing:1px;font-family:Jost,sans-serif;box-shadow:0 4px 20px rgba(254,104,196,0.4);">' + esc(config.desconto_texto || '10% OFF') + '</div>' +
        '<style>@keyframes bibpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}#bibelo-popup-badge{animation:bibpulse 2s ease-in-out infinite}</style>' +
        // Titulo
        '<h2 style="color:#2d2d2d;margin:0 0 6px;font-size:26px;font-weight:700;font-family:Cormorant Garamond,Georgia,serif;line-height:1.2;">' + esc(config.titulo || 'Oferta exclusiva pra voc\\u00EA!') + '</h2>' +
        '<p style="color:#777;margin:0;font-size:14px;line-height:1.5;font-family:Jost,sans-serif;max-width:340px;display:inline-block;">' + esc(config.subtitulo || '10% de desconto na 1\\u00AA compra \\u2014 s\\u00F3 pra quem cadastra aqui!') + '</p>' +
      '</div>' +
      // ── Faixa de exclusividade ──
      '<div style="background:linear-gradient(90deg,#fe68c4,#e91e63,#fe68c4);padding:8px 20px;text-align:center;">' +
        '<span style="color:#fff;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;font-family:Jost,sans-serif;">\\u2728 s\\u00F3 pra quem cadastra aqui \\u2728</span>' +
      '</div>' +
      // ── Form ──
      '<div style="padding:22px 24px 18px;">' +
        '<form id="bibelo-popup-form">' +
          (temNome ? '<div style="position:relative;margin-bottom:10px;"><span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;opacity:0.5;">\\uD83D\\uDC64</span><input type="text" name="nome" placeholder="Seu nome" required style="' + inputStyle + '" onfocus="this.style.borderColor=\\'#fe68c4\\';this.style.boxShadow=\\'0 0 0 3px rgba(254,104,196,0.1)\\'" onblur="this.style.borderColor=\\'#ffe5ec\\';this.style.boxShadow=\\'none\\'" /></div>' : '') +
          '<div style="position:relative;margin-bottom:10px;"><span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;opacity:0.5;">\\u2709\\uFE0F</span><input type="email" name="email" placeholder="Seu melhor e-mail" required style="' + inputStyle + '" onfocus="this.style.borderColor=\\'#fe68c4\\';this.style.boxShadow=\\'0 0 0 3px rgba(254,104,196,0.1)\\'" onblur="this.style.borderColor=\\'#ffe5ec\\';this.style.boxShadow=\\'none\\'" /></div>' +
          (temTelefone ? '<div style="position:relative;margin-bottom:14px;"><span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;opacity:0.5;">\\uD83D\\uDCF1</span><input type="tel" name="telefone" placeholder="WhatsApp (opcional)" style="' + inputStyle + '" onfocus="this.style.borderColor=\\'#fe68c4\\';this.style.boxShadow=\\'0 0 0 3px rgba(254,104,196,0.1)\\'" onblur="this.style.borderColor=\\'#ffe5ec\\';this.style.boxShadow=\\'none\\'" /></div>' : '') +
          // Botao principal
          '<button type="submit" id="bibelo-popup-btn" style="width:100%;padding:16px;background:linear-gradient(135deg,#fe68c4,#e91e63);color:#fff;border:none;border-radius:14px;font-size:17px;font-weight:700;cursor:pointer;font-family:Jost,Arial,sans-serif;box-shadow:0 6px 25px rgba(254,104,196,0.4);transition:transform 0.2s,box-shadow 0.2s;letter-spacing:0.3px;" onmouseover="this.style.transform=\\'translateY(-2px)\\';this.style.boxShadow=\\'0 10px 35px rgba(254,104,196,0.5)\\'" onmouseout="this.style.transform=\\'none\\';this.style.boxShadow=\\'0 6px 25px rgba(254,104,196,0.4)\\'">' +
            '<span style="display:flex;align-items:center;justify-content:center;gap:8px;">Entrar para o Clube <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;flex-shrink:0;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span>' +
          '</button>' +
        '</form>' +
        // Beneficios rapidos
        '<div style="display:flex;justify-content:center;gap:12px;margin-top:14px;flex-wrap:wrap;">' +
          '<span style="font-size:11px;color:#888;font-family:Jost,sans-serif;">\\uD83C\\uDFF7\\uFE0F 10% OFF</span>' +
          '<span style="font-size:11px;color:#888;font-family:Jost,sans-serif;">\\uD83D\\uDE9A Frete gr\\u00E1tis*</span>' +
          '<span style="font-size:11px;color:#888;font-family:Jost,sans-serif;">\\uD83C\\uDF81 Mimo surpresa</span>' +
        '</div>' +
        // Success
        '<div id="bibelo-popup-success" style="display:none;text-align:center;padding:16px 0;">' +
          '<p style="font-size:40px;margin:0 0 12px;" id="bibelo-popup-emoji">\\u2709\\uFE0F</p>' +
          '<p style="font-size:20px;font-weight:600;color:#2d2d2d;margin:0 0 8px;font-family:Cormorant Garamond,Georgia,serif;" id="bibelo-popup-msg"></p>' +
          '<p style="font-size:13px;color:#999;margin:0;font-family:Jost,sans-serif;" id="bibelo-popup-submsg">Verifique tamb\\u00E9m a pasta de spam.</p>' +
        '</div>' +
      '</div>' +
      // ── Footer ──
      '<div style="padding:10px 24px;background:#fafafa;text-align:center;border-top:1px solid #ffe5ec;">' +
        '<p style="margin:0;font-size:11px;color:#bbb;font-family:Jost,sans-serif;">Papelaria Bibel\\u00F4 \\u00B7 <span style="color:#fe68c4;">papelariabibelo.com.br</span></p>' +
      '</div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Animacao de entrada (bounce)
    requestAnimationFrame(function() {
      overlay.style.opacity = '1';
      card.style.transform = 'translateY(0) scale(1)';
    });

    // Fechar
    function closePopup() {
      overlay.style.opacity = '0';
      card.style.transform = 'translateY(30px) scale(0.95)';
      setTimeout(function() { overlay.remove(); }, 300);
      setCookie(COOKIE_NAME, '1', COOKIE_DAYS);
      trySet(COOKIE_NAME, '1');
    }

    document.getElementById('bibelo-popup-close').onclick = closePopup;

    // Submit
    document.getElementById('bibelo-popup-form').onsubmit = function(e) {
      e.preventDefault();
      var btn = document.getElementById('bibelo-popup-btn');
      var form = e.target;
      var email = form.email.value.trim();
      var nome = form.nome ? form.nome.value.trim() : '';
      var telefone = form.telefone ? form.telefone.value.trim() : '';

      if (!email) return;
      btn.textContent = 'Enviando...';
      btn.disabled = true;

      fetch(API + '/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          nome: nome || undefined,
          telefone: telefone || undefined,
          popup_id: config.id,
          visitor_id: visitorId,
          pagina: window.location.href
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        trackEvent(visitorId, 'popup_submit', { popup_id: config.id, desconto: config.desconto_texto, verificacao: data.verificacao });
        form.style.display = 'none';
        var success = document.getElementById('bibelo-popup-success');
        success.style.display = 'block';
        document.getElementById('bibelo-popup-msg').textContent = data.mensagem || 'Verifique seu e-mail!';

        var vipLink = 'https://chat.whatsapp.com/DzOJHBZ2vECF1taXiRRv6g';
        var vipBtn = '<a href="' + vipLink + '" target="_blank" style="display:inline-block;background:#25D366;color:#fff;padding:10px 24px;border-radius:50px;text-decoration:none;font-size:13px;font-weight:600;margin-top:12px;font-family:Jost,sans-serif;">Entrar no Clube VIP \\uD83D\\uDCAC</a>';
        var shopBtn = '<div style="margin-top:10px;"><a href="javascript:void(0)" onclick="document.getElementById(\\'bibelo-popup-overlay\\').querySelector(\\'[id=bibelo-popup-close]\\').click()" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#e91e63);color:#fff;padding:10px 24px;border-radius:50px;text-decoration:none;font-size:13px;font-weight:600;font-family:Jost,sans-serif;">Continuar comprando \\uD83D\\uDECD\\uFE0F</a></div>';

        if (data.verificacao === 'cliente_existente') {
          document.getElementById('bibelo-popup-emoji').textContent = '\\uD83D\\uDC95';
          document.getElementById('bibelo-popup-submsg').innerHTML = 'Voc\\u00EA j\\u00E1 faz parte da fam\\u00EDlia!' + shopBtn + vipBtn;
        } else if (data.verificacao === 'ja_verificado') {
          document.getElementById('bibelo-popup-emoji').textContent = '\\u2705';
          document.getElementById('bibelo-popup-submsg').innerHTML = 'Seu desconto de 10% j\\u00E1 est\\u00E1 ativo!' + shopBtn + vipBtn;
        } else {
          document.getElementById('bibelo-popup-submsg').innerHTML = 'Verifique seu e-mail para ativar o desconto de 10%.<br><span style="font-size:11px;color:#999;">Verifique tamb\\u00E9m a pasta de spam.</span>' + shopBtn + vipBtn;
        }
        setCookie(COOKIE_NAME, '1', COOKIE_DAYS);
        setCookie('_bibelo_lead', '1', 365);
        trySet(COOKIE_NAME, '1');
        trySet('_bibelo_lead', '1');

        setTimeout(closePopup, 30000);
      })
      .catch(function() {
        btn.textContent = 'Tente novamente';
        btn.disabled = false;
      });
    };
  }
})();

// ── Auto-load tracking script (bibelo.js) ──
(function() {
  if (window.__bibelo_tracking_loaded) return;
  window.__bibelo_tracking_loaded = true;
  // Não carrega dentro de iframes (GTM preview)
  if (window.self !== window.top) return;
  var s = document.createElement('script');
  s.src = '${apiBase}/api/tracking/bibelo.js';
  s.defer = true;
  document.head.appendChild(s);
})();
`);
});
