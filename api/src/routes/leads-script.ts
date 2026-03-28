import { Router, Request, Response } from "express";

export const leadsScriptRouter = Router();

// ── GET /api/leads/popup.js — script JS servido para a NuvemShop ──

leadsScriptRouter.get("/popup.js", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300"); // cache 5min

  const apiBase = process.env.LEADS_API_URL || "https://webhook.papelariabibelo.com.br";

  res.send(`
(function() {
  'use strict';

  // ── Config ──────────────────────────────────────────────
  var API = '${apiBase}/api/leads';
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

  // ── Já mostrou popup? ───────────────────────────────────
  if (getCookie(COOKIE_NAME)) return;

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

      var popup = null;
      for (var i = 0; i < data.popups.length; i++) {
        if (data.popups[i].tipo === 'timer' && data.popups[i].delay_segundos >= 0) {
          popup = data.popups[i];
          break;
        }
      }
      if (!popup) return;

      setTimeout(function() { showPopup(popup, vid); }, (popup.delay_segundos || 8) * 1000);
    })
    .catch(function() {});

  // ── Renderizar popup ────────────────────────────────────
  function showPopup(config, visitorId) {
    // Registrar exibição
    fetch(API + '/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ popup_id: config.id })
    }).catch(function() {});

    // Google Font
    var link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    var campos = config.campos || ['email'];
    var temNome = campos.indexOf('nome') !== -1;

    // Overlay
    var overlay = document.createElement('div');
    overlay.id = 'bibelo-popup-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999998;opacity:0;transition:opacity 0.3s ease;display:flex;align-items:center;justify-content:center;padding:16px;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:20px;max-width:420px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(254,104,196,0.25);transform:translateY(20px);transition:transform 0.4s ease;font-family:Jost,Arial,sans-serif;';

    card.innerHTML =
      '<div style="background:#fff7c1;padding:28px 24px 20px;text-align:center;border-bottom:3px solid #fe68c4;position:relative;">' +
        '<button id="bibelo-popup-close" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:22px;cursor:pointer;color:#999;line-height:1;">&times;</button>' +
        '<div style="background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;display:inline-block;padding:8px 20px;border-radius:50px;font-size:20px;font-weight:700;margin-bottom:12px;">' + (config.desconto_texto || '7% OFF') + '</div>' +
        '<h2 style="color:#333;margin:0 0 6px;font-size:20px;font-weight:700;">' + (config.titulo || 'Ganhe 7% na primeira compra!') + '</h2>' +
        '<p style="color:#777;margin:0;font-size:14px;line-height:1.5;">' + (config.subtitulo || 'Cadastre seu e-mail e receba um cupom exclusivo.') + '</p>' +
      '</div>' +
      '<div style="padding:24px;">' +
        '<form id="bibelo-popup-form">' +
          (temNome ? '<input type="text" name="nome" placeholder="Seu nome" style="width:100%;padding:12px 16px;border:2px solid #ffe5ec;border-radius:12px;font-size:15px;margin-bottom:10px;outline:none;font-family:Jost,Arial,sans-serif;box-sizing:border-box;transition:border-color 0.2s;" onfocus="this.style.borderColor=\\'#fe68c4\\'" onblur="this.style.borderColor=\\'#ffe5ec\\'" />' : '') +
          '<input type="email" name="email" placeholder="Seu melhor e-mail" required style="width:100%;padding:12px 16px;border:2px solid #ffe5ec;border-radius:12px;font-size:15px;margin-bottom:14px;outline:none;font-family:Jost,Arial,sans-serif;box-sizing:border-box;transition:border-color 0.2s;" onfocus="this.style.borderColor=\\'#fe68c4\\'" onblur="this.style.borderColor=\\'#ffe5ec\\'" />' +
          '<button type="submit" id="bibelo-popup-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;font-family:Jost,Arial,sans-serif;box-shadow:0 4px 15px rgba(254,104,196,0.3);transition:transform 0.2s,box-shadow 0.2s;" onmouseover="this.style.transform=\\'translateY(-1px)\\';this.style.boxShadow=\\'0 6px 20px rgba(254,104,196,0.4)\\'" onmouseout="this.style.transform=\\'none\\';this.style.boxShadow=\\'0 4px 15px rgba(254,104,196,0.3)\\'">' +
            'Quero meu cupom! \\uD83C\\uDF89' +
          '</button>' +
        '</form>' +
        '<div id="bibelo-popup-success" style="display:none;text-align:center;padding:10px 0;">' +
          '<p style="font-size:36px;margin:0 0 12px;">\\uD83C\\uDF89</p>' +
          '<p style="font-size:18px;font-weight:700;color:#333;margin:0 0 8px;">Cupom: <span style="color:#fe68c4;" id="bibelo-cupom-code"></span></p>' +
          '<p style="font-size:14px;color:#777;margin:0;" id="bibelo-popup-msg"></p>' +
        '</div>' +
        '<p style="text-align:center;margin:14px 0 0;font-size:11px;color:#bbb;">Papelaria Bibelô · papelariabibelo.com.br</p>' +
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
    }

    document.getElementById('bibelo-popup-close').onclick = closePopup;
    overlay.onclick = function(e) { if (e.target === overlay) closePopup(); };

    // Submit
    document.getElementById('bibelo-popup-form').onsubmit = function(e) {
      e.preventDefault();
      var btn = document.getElementById('bibelo-popup-btn');
      var form = e.target;
      var email = form.email.value.trim();
      var nome = form.nome ? form.nome.value.trim() : '';

      if (!email) return;
      btn.textContent = 'Enviando...';
      btn.disabled = true;

      fetch(API + '/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          nome: nome || undefined,
          popup_id: config.id,
          visitor_id: visitorId,
          pagina: window.location.href
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        form.style.display = 'none';
        var success = document.getElementById('bibelo-popup-success');
        success.style.display = 'block';
        document.getElementById('bibelo-cupom-code').textContent = data.cupom || 'BIBELO7';
        document.getElementById('bibelo-popup-msg').textContent = data.mensagem || 'Use no checkout!';
        setCookie(COOKIE_NAME, '1', COOKIE_DAYS);

        // Fecha sozinho após 5 segundos
        setTimeout(closePopup, 5000);
      })
      .catch(function() {
        btn.textContent = 'Tente novamente';
        btn.disabled = false;
      });
    };
  }
})();
`);
});
