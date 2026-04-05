import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";

export const leadsScriptRouter = Router();

const scriptLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, message: "// rate limited" });

// ── GET /api/leads/popup.js — script JS servido para a NuvemShop ──

leadsScriptRouter.get("/popup.js", scriptLimiter, (_req: Request, res: Response) => {
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
    document.cookie = name + '=' + value + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
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

  // ── Já é lead cadastrado? Não mostrar popup de captura ──
  if (!forceOpen && (getCookie('_bibelo_lead') || tryGet('_bibelo_lead'))) return;

  // ── Já mostrou popup nesta sessão? ─────────────────────
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
        // Seleciona popup certo: desconto=1 → popup com % OFF, clube=1 → popup Clube Bibelô
        var targetPopup = null;
        if (forceDesconto) {
          for (var j = 0; j < data.popups.length; j++) {
            if (data.popups[j].id === 'desconto_primeira_compra') { targetPopup = data.popups[j]; break; }
          }
        }
        if (!targetPopup) targetPopup = timerPopup;
        if (targetPopup) {
          shown = true;
          var bannerNome = forceDesconto ? '7% OFF' : '7% OFF';
          trackEvent(vid, 'banner_click', { banner: bannerNome, popup_id: targetPopup.id });
          showPopup(targetPopup, vid);
          // Limpa params da URL sem recarregar
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
        }, (timerPopup.delay_segundos || 8) * 1000);
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
    // Registrar exibição
    // Marca cookie + localStorage imediatamente ao exibir (evita mostrar 2x)
    setCookie(COOKIE_NAME, '1', COOKIE_DAYS);
    trySet(COOKIE_NAME, '1');

    fetch(API + '/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ popup_id: config.id })
    }).catch(function() {});

    // Tracking: popup exibido
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
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999998;opacity:0;transition:opacity 0.3s ease;display:flex;align-items:center;justify-content:center;padding:16px;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:20px;max-width:420px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(254,104,196,0.25);transform:translateY(20px);transition:transform 0.4s ease;font-family:Jost,Arial,sans-serif;';

    var isClube = config.id === 'clube_bibelo';
    var btnText = isClube ? 'Quero fazer parte \\uD83C\\uDF80' : 'Quero meu cupom \\uD83C\\uDF89';
    var inputStyle = 'width:100%;padding:13px 16px 13px 42px;border:2px solid #ffe5ec;border-radius:12px;font-size:15px;margin-bottom:10px;outline:none;font-family:Jost,Arial,sans-serif;box-sizing:border-box;transition:border-color 0.2s;background:#fff;';

    card.innerHTML =
      // ── Header premium com Cormorant Garamond ──
      '<div style="background:linear-gradient(160deg,#ffe5ec 0%,#fff7c1 50%,#ffe5ec 100%);padding:32px 28px 24px;text-align:center;position:relative;overflow:hidden;">' +
        // Decoração sutil de fundo
        '<div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;background:rgba(254,104,196,0.08);border-radius:50%;"></div>' +
        '<div style="position:absolute;bottom:-10px;left:-10px;width:50px;height:50px;background:rgba(254,104,196,0.06);border-radius:50%;"></div>' +
        '<button id="bibelo-popup-close" style="position:absolute;top:10px;right:12px;background:rgba(255,255,255,0.7);border:none;width:28px;height:28px;border-radius:50%;font-size:18px;cursor:pointer;color:#999;line-height:1;display:flex;align-items:center;justify-content:center;">&times;</button>' +
        // Badge
        '<div style="background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;display:inline-block;padding:6px 18px;border-radius:50px;font-size:12px;font-weight:600;margin-bottom:14px;letter-spacing:1.5px;text-transform:uppercase;font-family:Jost,sans-serif;">' + esc(config.desconto_texto || '7% OFF') + '</div>' +
        // T\\u00EDtulo em Cormorant Garamond
        '<h2 style="color:#2d2d2d;margin:0 0 8px;font-size:28px;font-weight:600;font-family:Cormorant Garamond,Georgia,serif;line-height:1.2;">' + esc(config.titulo || 'Entre pro Clube Bibel\\u00F4!') + '</h2>' +
        '<p style="color:#888;margin:0;font-size:13px;line-height:1.5;font-family:Jost,sans-serif;max-width:320px;display:inline-block;">' + esc(config.subtitulo || '7% de desconto na 1\\u00AA compra + novidades em primeira m\\u00E3o!') + '</p>' +
      '</div>' +
      // ── Divider rosa ──
      '<div style="height:3px;background:linear-gradient(90deg,#fe68c4,#f472b6,#fe68c4);"></div>' +
      // ── Form ──
      '<div style="padding:24px 24px 20px;">' +
        '<form id="bibelo-popup-form">' +
          // Input nome com \\u00EDcone
          (temNome ? '<div style="position:relative;margin-bottom:10px;"><span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;opacity:0.4;">\\uD83D\\uDC64</span><input type="text" name="nome" placeholder="Seu nome" required style="' + inputStyle + '" onfocus="this.style.borderColor=\\'#fe68c4\\'" onblur="this.style.borderColor=\\'#ffe5ec\\'" /></div>' : '') +
          // Input email com \\u00EDcone
          '<div style="position:relative;margin-bottom:10px;"><span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;opacity:0.4;">\\u2709\\uFE0F</span><input type="email" name="email" placeholder="Seu melhor e-mail" required style="' + inputStyle + '" onfocus="this.style.borderColor=\\'#fe68c4\\'" onblur="this.style.borderColor=\\'#ffe5ec\\'" /></div>' +
          // Input WhatsApp com \\u00EDcone
          (temTelefone ? '<div style="position:relative;margin-bottom:14px;"><span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;opacity:0.4;">\\uD83D\\uDCF1</span><input type="tel" name="telefone" placeholder="WhatsApp (47 999999999)" required style="' + inputStyle + '" onfocus="this.style.borderColor=\\'#fe68c4\\'" onblur="this.style.borderColor=\\'#ffe5ec\\'" /></div>' : '') +
          // Bot\\u00E3o
          '<button type="submit" id="bibelo-popup-btn" style="width:100%;padding:15px;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;font-family:Jost,Arial,sans-serif;box-shadow:0 4px 15px rgba(254,104,196,0.3);transition:transform 0.2s,box-shadow 0.2s;letter-spacing:0.3px;" onmouseover="this.style.transform=\\'translateY(-2px)\\';this.style.boxShadow=\\'0 8px 25px rgba(254,104,196,0.4)\\'" onmouseout="this.style.transform=\\'none\\';this.style.boxShadow=\\'0 4px 15px rgba(254,104,196,0.3)\\'">' +
            btnText +
          '</button>' +
        '</form>' +
        // Mimo surpresa
        (isClube ? '<div style="text-align:center;margin:14px 0 0;padding:8px 12px;background:#fff7c1;border-radius:8px;"><span style="font-size:12px;color:#2d2d2d;font-family:Jost,sans-serif;">\\uD83C\\uDF81 Toda compra vai com <strong>mimo surpresa</strong> na caixa!</span></div>' : '') +
        // Success
        '<div id="bibelo-popup-success" style="display:none;text-align:center;padding:16px 0;">' +
          '<p style="font-size:40px;margin:0 0 12px;" id="bibelo-popup-emoji">\\u2709\\uFE0F</p>' +
          '<p style="font-size:20px;font-weight:600;color:#2d2d2d;margin:0 0 8px;font-family:Cormorant Garamond,Georgia,serif;" id="bibelo-popup-msg"></p>' +
          '<p style="font-size:13px;color:#999;margin:0;font-family:Jost,sans-serif;" id="bibelo-popup-submsg">Verifique tamb\\u00E9m a pasta de spam.</p>' +
        '</div>' +
      '</div>' +
      // ── Footer ──
      '<div style="padding:12px 24px;background:#fafafa;text-align:center;border-top:1px solid #ffe5ec;">' +
        '<p style="margin:0;font-size:11px;color:#bbb;font-family:Jost,sans-serif;">Papelaria Bibel\\u00F4 \\u00B7 <span style="color:#fe68c4;">papelariabibelo.com.br</span></p>' +
      '</div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Animação de entrada
    requestAnimationFrame(function() {
      overlay.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });

    // Fechar
    function closePopup() {
      overlay.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      setTimeout(function() { overlay.remove(); }, 300);
      setCookie(COOKIE_NAME, '1', COOKIE_DAYS);
      trySet(COOKIE_NAME, '1');
    }

    document.getElementById('bibelo-popup-close').onclick = closePopup;
    // Não fecha ao clicar fora — só pelo X ou preenchendo

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
        // Tracking: lead preencheu popup
        trackEvent(visitorId, 'popup_submit', { popup_id: config.id, desconto: config.desconto_texto, verificacao: data.verificacao });
        form.style.display = 'none';
        var success = document.getElementById('bibelo-popup-success');
        success.style.display = 'block';
        document.getElementById('bibelo-popup-msg').textContent = data.mensagem || 'Verifique seu e-mail!';

        var vipLink = 'https://boasvindas.papelariabibelo.com.br/api/links/grupo-vip';
        var vipBtn = '<a href="' + vipLink + '" target="_blank" style="display:inline-block;background:#25D366;color:#fff;padding:10px 24px;border-radius:50px;text-decoration:none;font-size:13px;font-weight:600;margin-top:12px;font-family:Jost,sans-serif;">Entrar no Clube VIP \\uD83D\\uDCAC</a>';
        var shopBtn = '<div style="margin-top:10px;"><a href="javascript:void(0)" onclick="document.getElementById(\\'bibelo-popup-overlay\\').querySelector(\\'[id=bibelo-popup-close]\\').click()" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:10px 24px;border-radius:50px;text-decoration:none;font-size:13px;font-weight:600;font-family:Jost,sans-serif;">Continuar comprando \\uD83D\\uDECD\\uFE0F</a></div>';

        if (data.verificacao === 'cliente_existente') {
          document.getElementById('bibelo-popup-emoji').textContent = '\\uD83D\\uDC95';
          document.getElementById('bibelo-popup-submsg').innerHTML = 'Voc\\u00EA j\\u00E1 faz parte da fam\\u00EDlia!' + shopBtn + vipBtn;
        } else if (data.verificacao === 'ja_verificado') {
          document.getElementById('bibelo-popup-emoji').textContent = '\\u2705';
          document.getElementById('bibelo-popup-submsg').innerHTML = 'Seu desconto de 7% j\\u00E1 est\\u00E1 ativo!' + shopBtn + vipBtn;
        } else {
          document.getElementById('bibelo-popup-submsg').innerHTML = 'Verifique seu e-mail para ativar o desconto de 7%.<br><span style="font-size:11px;color:#999;">Verifique tamb\\u00E9m a pasta de spam.</span>' + shopBtn + vipBtn;
        }
        setCookie(COOKIE_NAME, '1', COOKIE_DAYS);
        setCookie('_bibelo_lead', '1', 365);
        trySet(COOKIE_NAME, '1');
        trySet('_bibelo_lead', '1');

        // Não fecha sozinho — tem link VIP pra clicar
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
