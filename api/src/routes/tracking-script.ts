import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";

export const trackingScriptRouter = Router();

const scriptLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, message: "// rate limited" });

// ── GET /api/tracking/bibelo.js — script de tracking para NuvemShop ──

trackingScriptRouter.get("/bibelo.js", scriptLimiter, (_req: Request, res: Response) => {
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

  // Não rodar dentro de iframes (GTM preview, etc)
  if (window.self !== window.top) return;
  // Bloquear bots/crawlers (Facebook, Google, Bing, etc)
  var ua = (navigator.userAgent || '').toLowerCase();
  if (/facebookexternalhit|facebot|facebookbot|metainspector|googlebot|bingbot|yandexbot|baiduspider|twitterbot|linkedinbot|slurp|duckduckbot|ia_archiver|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider/.test(ua)) return;
  // Não rodar duplicado
  if (window.__bibelo_tracking_init) return;
  window.__bibelo_tracking_init = true;

  var API = '${apiBase}/api/tracking';
  var VID_COOKIE = '_bibelo_vid';
  var DEBOUNCE_MS = 3000;
  var lastEvent = 0;

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

  // ── Visitor ID ──────────────────────────────────────────
  var vid = getCookie(VID_COOKIE);
  if (!vid) {
    vid = uuid();
    setCookie(VID_COOKIE, vid, 365);
  }

  // ── UTM params — captura da URL e persiste na sessão ────
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var UTM_COOKIE = '_bibelo_utm';

  function captureUtm() {
    var params = new URLSearchParams(window.location.search);
    var utm = {};
    var found = false;
    UTM_KEYS.forEach(function(k) {
      var v = params.get(k);
      if (v) { utm[k] = v; found = true; }
    });
    if (found) {
      setCookie(UTM_COOKIE, JSON.stringify(utm), 30);
      return utm;
    }
    // Recupera da sessão (navegação interna perde query string)
    var saved = getCookie(UTM_COOKIE);
    if (saved) {
      try { return JSON.parse(saved); } catch(e) { return {}; }
    }
    return {};
  }

  var utmData = captureUtm();

  // ── Enviar evento (com debounce) ────────────────────────
  function track(evento, data) {
    var now = Date.now();
    if (now - lastEvent < DEBOUNCE_MS && evento === 'page_view') return;
    lastEvent = now;

    var payload = {
      visitor_id: vid,
      evento: evento,
      pagina: window.location.href,
      referrer: document.referrer || undefined
    };

    // Merge UTM data
    for (var u in utmData) {
      if (utmData.hasOwnProperty(u)) payload[u] = utmData[u];
    }

    // Merge data
    if (data) {
      for (var k in data) {
        if (data.hasOwnProperty(k)) payload[k] = data[k];
      }
    }

    // Usar sendBeacon se disponível (não bloqueia navegação)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API + '/event', JSON.stringify(payload));
    } else {
      fetch(API + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function() {});
    }
  }

  // ── Helpers de detecção NuvemShop ─────────────────────────
  // Caminhos NuvemShop que NÃO são categorias
  var KNOWN_PATHS = ['account', 'checkout', 'cart', 'carrinho', 'carrito', 'search', 'busca', 'produtos', 'products', 'faq', 'pages', 'paginas', 'nocache', 'comprar', 'post-purchase'];

  function isKnownPath(firstSegment) {
    return KNOWN_PATHS.indexOf(firstSegment) !== -1;
  }

  // Extrai título limpo da página (remove " - Papelaria Bibelô" etc.)
  function cleanTitle() {
    var t = document.title || '';
    return t.split(/\\s*[-–|]\\s*/).slice(0, -1).join(' - ').trim() || t.trim();
  }

  // ── Detectar tipo de página NuvemShop ───────────────────
  function detectPage() {
    var path = window.location.pathname;
    var url = window.location.href;

    // Home
    if (path === '/' || path === '') {
      track('page_view', { pagina_tipo: 'home' });
      return;
    }

    // Checkout
    if (path.includes('/checkout') || url.includes('checkout')) {
      track('checkout_start', { pagina_tipo: 'checkout' });
      return;
    }

    // Carrinho
    if (path.includes('/cart') || path.includes('/carrito') || path.includes('/carrinho')) {
      track('page_view', { pagina_tipo: 'cart', resource_nome: cleanTitle() });
      return;
    }

    // Busca
    if (path.includes('/search') || path.includes('/busca') || url.includes('q=')) {
      var searchParams = new URLSearchParams(window.location.search);
      var query = searchParams.get('q') || searchParams.get('search') || '';
      track('search', { pagina_tipo: 'search', metadata: { query: query } });
      return;
    }

    // Produto — NuvemShop usa /produtos/slug ou /products/slug
    if (path.match(/^\\/(produtos|products)\\/[^/]+\\/?$/)) {
      detectProduct();
      return;
    }

    // Categoria — NuvemShop usa /categorias/slug OU slug direto
    if (path.match(/^\\/(categorias|categories)\\/[^/]+\\/?$/)) {
      detectCategory();
      return;
    }

    // Conta — login, cadastro, reset de senha
    if (path.match(/^\\/account\\//)) {
      var accName = cleanTitle() || path.split('/').filter(Boolean).pop() || 'Conta';
      track('page_view', { pagina_tipo: 'other', resource_nome: accName, metadata: { secao: 'conta' } });
      return;
    }

    // NuvemShop: slug direto pode ser categoria (ex: /novidades/, /caderno/, /caneta/)
    // Detecta se é listagem de produtos (categoria) ou página estática
    var segments = path.replace(/^\\/|\\/$|\\?.*$/g, '').split('/');
    var firstSeg = segments[0];

    if (firstSeg && !isKnownPath(firstSeg)) {
      // Aguarda DOM e verifica se tem listagem de produtos (= categoria NuvemShop)
      function checkCategory() {
        var hasList = document.querySelector('.js-product-table, .js-product-list, [data-store=product-list-container], .category-body, .product-grid, .js-category-products, .product-list');
        if (hasList) {
          var catName = cleanTitle();
          var catSlug = segments.join('/');
          track('category_view', {
            pagina_tipo: 'category',
            resource_nome: catName || catSlug,
            resource_id: catSlug
          });
        } else {
          // Página estática (FAQ, institucional) ou categoria sem produtos visíveis ainda
          // Checa og:type para ter certeza
          var ogType = document.querySelector('meta[property="og:type"]');
          var ogVal = ogType ? (ogType.getAttribute('content') || '').toLowerCase() : '';
          if (ogVal === 'product.group' || ogVal === 'product') {
            var catName2 = cleanTitle();
            track('category_view', {
              pagina_tipo: 'category',
              resource_nome: catName2 || firstSeg,
              resource_id: segments.join('/')
            });
          } else {
            track('page_view', { pagina_tipo: 'other', resource_nome: cleanTitle() });
          }
        }
      }

      if (document.readyState === 'complete') {
        checkCategory();
      } else {
        // NuvemShop renderiza via JS — esperar conteúdo carregar
        setTimeout(checkCategory, 1500);
      }
      return;
    }

    // Outra página — envia título para contexto
    track('page_view', { pagina_tipo: 'other', resource_nome: cleanTitle() });
  }

  // ── Detectar dados do produto ───────────────────────────
  function detectProduct() {
    var data = { pagina_tipo: 'product' };

    // Aguarda o DOM da NuvemShop renderizar (SPA)
    function extract() {
      // 1. Título da página (sempre correto) — "PRODUTO - Papelaria Bibelô"
      var pageTitle = document.title || '';
      var titleParts = pageTitle.split(/\\s*[-–|]\\s*/);
      if (titleParts.length > 0 && titleParts[0].trim()) {
        data.resource_nome = titleParts[0].trim();
      }

      // 2. Meta tags (NuvemShop renderiza via JS)
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.getAttribute('content')) {
        data.resource_nome = ogTitle.getAttribute('content');
      }

      var ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.getAttribute('content')) {
        data.resource_imagem = ogImage.getAttribute('content');
      }

      var ogPrice = document.querySelector('meta[property="product:price:amount"]');
      if (ogPrice) {
        data.resource_preco = parseFloat(ogPrice.getAttribute('content') || '0');
      }

      // 3. Preço no DOM — NuvemShop usa .js-price-display ou [data-product-price]
      if (!data.resource_preco) {
        var priceEl = document.querySelector('[data-product-price], .js-price-display, .product-price, #price_display, .js-product-price');
        if (priceEl) {
          var priceText = (priceEl.textContent || '').replace(/[^0-9,.]/g, '').replace('.', '').replace(',', '.');
          var parsed = parseFloat(priceText);
          if (parsed > 0) data.resource_preco = parsed;
        }
      }

      // 4. Imagem principal do produto
      if (!data.resource_imagem) {
        var imgEl = document.querySelector('.js-product-slide-img, .product-image img, [data-zoom-url], .js-product-image-modal img, .swiper-slide img');
        if (imgEl) {
          data.resource_imagem = imgEl.getAttribute('data-zoom-url') || imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || undefined;
        }
      }

      // 5. ID do produto via NuvemShop data attributes
      var prodIdEl = document.querySelector('[data-product-id], [data-product]');
      if (prodIdEl) {
        data.resource_id = prodIdEl.getAttribute('data-product-id') || prodIdEl.getAttribute('data-product') || undefined;
      }
      // Fallback: extrair slug da URL como ID
      if (!data.resource_id) {
        var slug = window.location.pathname.split('/').filter(Boolean).pop();
        data.resource_id = slug || undefined;
      }

      track('product_view', data);
    }

    // NuvemShop renderiza via JS — esperar conteúdo carregar
    if (document.querySelector('meta[property="og:title"]')) {
      extract();
    } else {
      setTimeout(extract, 1500);
    }
  }

  // ── Detectar dados da categoria ─────────────────────────
  function detectCategory() {
    var data = { pagina_tipo: 'category' };
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) data.resource_nome = ogTitle.getAttribute('content') || undefined;

    // Extrair ID da categoria se possível
    var path = window.location.pathname;
    var slug = path.split('/').filter(Boolean).pop();
    data.resource_id = slug || undefined;

    track('category_view', data);
  }

  // ── Detectar "Adicionar ao carrinho" ────────────────────
  function watchAddToCart() {
    // NuvemShop: interceptar cliques em botões de compra
    document.addEventListener('click', function(e) {
      var target = e.target;
      // Percorre até 5 níveis de parent procurando botão de comprar
      for (var i = 0; i < 5; i++) {
        if (!target || target === document.body) break;

        var text = (target.textContent || '').toLowerCase().trim();
        var cls = (target.className || '').toLowerCase();
        var id = (target.id || '').toLowerCase();

        var isCartButton =
          text.includes('comprar') ||
          text.includes('adicionar') ||
          text.includes('add to cart') ||
          text.includes('agregar') ||
          text.includes('buy') ||
          cls.includes('add-to-cart') ||
          cls.includes('js-addtocart') ||
          cls.includes('js-add-to-cart') ||
          cls.includes('btn-add') ||
          cls.includes('js-prod-submit') ||
          cls.includes('product-buy-btn') ||
          cls.includes('js-buy-btn') ||
          cls.includes('js-product-buy') ||
          id.includes('addtocart') ||
          id.includes('buy-btn') ||
          target.getAttribute('data-action') === 'add-to-cart' ||
          (target.type === 'submit' && target.closest('form[action*=\"/cart\"], form.js-product-form, form[data-product-form]'));

        if (isCartButton && (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'INPUT')) {
          var productData = { pagina_tipo: 'product' };

          // Tenta extrair dados do produto PRÓXIMO ao botão clicado (funciona em listagens/home)
          var card = target.closest('[data-product-id], .js-product-container, .product-card, .item-product, article, .js-item-product');
          if (card) {
            var cardName = card.querySelector('.js-item-name, .item-name, .product-name, h2 a, h3 a, .js-product-name');
            if (cardName) productData.resource_nome = cardName.textContent.trim();
            var cardImg = card.querySelector('img');
            if (cardImg) productData.resource_imagem = cardImg.getAttribute('data-srcset') || cardImg.getAttribute('data-src') || cardImg.getAttribute('src');
            var cardPrice = card.querySelector('[data-product-price], .js-price-display, .item-price, .price');
            if (cardPrice) {
              var cp = (cardPrice.textContent || '').replace(/[^0-9,.]/g, '').replace('.', '').replace(',', '.');
              var cpn = parseFloat(cp);
              if (cpn > 0) productData.resource_preco = cpn;
            }
            var cardId = card.getAttribute('data-product-id') || card.getAttribute('data-product');
            if (cardId) productData.resource_id = cardId;
            // Link do produto no card
            if (!productData.resource_id) {
              var cardLink = card.querySelector('a[href*="/produtos/"], a[href*="/products/"]');
              if (cardLink) {
                var href = cardLink.getAttribute('href') || '';
                var slug = href.split('/').filter(Boolean).pop();
                productData.resource_id = slug || undefined;
              }
            }
          }

          // Fallback: página de produto individual (og:title = nome do produto)
          if (!productData.resource_nome) {
            var isProductPage = window.location.pathname.match(/^\\/(produtos|products)\\/[^/]+\\/?$/);
            var ogT = document.querySelector('meta[property="og:title"]');
            if (ogT && isProductPage) {
              productData.resource_nome = ogT.getAttribute('content');
            }
            if (!productData.resource_nome) {
              var tParts = (document.title || '').split(/\\s*[-\\u2013|]\\s*/);
              if (tParts[0] && isProductPage) productData.resource_nome = tParts[0].trim();
            }
          }
          if (!productData.resource_imagem) {
            var ogI = document.querySelector('meta[property="og:image"]');
            if (ogI) productData.resource_imagem = ogI.getAttribute('content');
          }
          if (!productData.resource_preco) {
            var ogP = document.querySelector('meta[property="product:price:amount"]');
            if (ogP) productData.resource_preco = parseFloat(ogP.getAttribute('content') || '0');
          }
          if (!productData.resource_id) {
            var pIdEl = document.querySelector('[data-product-id]');
            if (pIdEl) productData.resource_id = pIdEl.getAttribute('data-product-id');
          }
          if (!productData.resource_id) {
            var s = window.location.pathname.split('/').filter(Boolean).pop();
            if (window.location.pathname.match(/^\\/(produtos|products)\\//)) productData.resource_id = s || undefined;
          }
          track('add_to_cart', productData);
          return;
        }

        target = target.parentElement;
      }
    }, true);

    // Fallback: interceptar submit de forms de produto (NuvemShop Amazonas e outros temas)
    document.addEventListener('submit', function(e) {
      var form = e.target;
      if (!form || !form.tagName || form.tagName !== 'FORM') return;
      var action = (form.action || '').toLowerCase();
      var cls = (form.className || '').toLowerCase();
      var isProductForm = action.includes('/cart') || action.includes('agregar') ||
        cls.includes('js-product-form') || cls.includes('product-form') ||
        form.getAttribute('data-product-form') !== null ||
        form.querySelector('input[name="add_to_cart"], input[name="quantity"]');
      if (!isProductForm) return;

      var pd = { pagina_tipo: 'product' };
      var ogT = document.querySelector('meta[property="og:title"]');
      if (ogT) pd.resource_nome = ogT.getAttribute('content');
      var ogI = document.querySelector('meta[property="og:image"]');
      if (ogI) pd.resource_imagem = ogI.getAttribute('content');
      var ogP = document.querySelector('meta[property="product:price:amount"]');
      if (ogP) pd.resource_preco = parseFloat(ogP.getAttribute('content') || '0');
      var pIdEl = form.querySelector('input[name="product_id"], [data-product-id]') || document.querySelector('[data-product-id]');
      if (pIdEl) pd.resource_id = pIdEl.value || pIdEl.getAttribute('data-product-id');
      if (!pd.resource_id) {
        var slug = window.location.pathname.split('/').filter(Boolean).pop();
        if (window.location.pathname.match(/^\\/(produtos|products)\\//)) pd.resource_id = slug;
      }
      track('add_to_cart', pd);
    }, true);
  }

  // ── Identificar visitante no checkout ───────────────────
  function watchIdentify() {
    // Se estiver no checkout, tenta capturar email
    if (!window.location.pathname.includes('/checkout')) return;

    // Observar mudanças no DOM para capturar email preenchido
    var identified = false;
    var observer = new MutationObserver(function() {
      if (identified) return;
      var emailInputs = document.querySelectorAll('input[type="email"], input[name="email"], input[name*="email"]');
      emailInputs.forEach(function(input) {
        input.addEventListener('blur', function() {
          var email = input.value.trim();
          if (email && email.includes('@') && !identified) {
            identified = true;
            fetch(API + '/identify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ visitor_id: vid, email: email })
            }).catch(function() {});
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Também verifica inputs já existentes
    setTimeout(function() {
      var emailInputs = document.querySelectorAll('input[type="email"], input[name="email"]');
      emailInputs.forEach(function(input) {
        input.addEventListener('blur', function() {
          var email = input.value.trim();
          if (email && email.includes('@') && !identified) {
            identified = true;
            fetch(API + '/identify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ visitor_id: vid, email: email })
            }).catch(function() {});
          }
        });
      });
    }, 2000);
  }

  // ══════════════════════════════════════════════════════════
  // BARRA DE FRETE GRÁTIS NO TOPO
  // ══════════════════════════════════════════════════════════

  function injectFreteBar() {
    if (document.getElementById('bibelo-frete-bar')) return;

    // Usa a barra nativa do tema (.js-topbar) — desktop: ícones + frete | mobile: só frete
    var topbar = document.querySelector('.js-topbar.section-topbar');
    if (topbar) {
      // Garante que a topbar aparece em todas as telas
      topbar.classList.remove('d-none', 'd-md-block');
      topbar.style.display = 'block';
      var row = topbar.querySelector('.row');
      if (row) {
        // Remove todos os col.text-right vazios/duplicados
        var rightCols = row.querySelectorAll('.col.text-right');
        for (var rc = 0; rc < rightCols.length; rc++) rightCols[rc].remove();
        // Ícones sociais: só desktop (col-auto + d-none d-md-block)
        var leftCol = row.querySelector('.col.text-left');
        if (leftCol) { leftCol.classList.remove('col'); leftCol.classList.add('col-auto'); }
        // Frete: aparece em todas as telas, centralizado
        var freteCol = document.createElement('div');
        freteCol.className = 'col text-center';
        freteCol.innerHTML = '<a id="bibelo-frete-bar" href="https://www.papelariabibelo.com.br/politica-de-frete/" style="color:#fe68c4;text-decoration:none;font-size:12px;font-family:Jost,Arial,sans-serif;font-weight:600;letter-spacing:0.3px;">' +
          '\\uD83D\\uDE9A <strong>FRETE GR\\u00C1TIS</strong> - Leia as Pol\\u00EDticas de Frete \\uD83D\\uDE9A' +
          '</a>';
        row.appendChild(freteCol);
      }
      return;
    }

    // Fallback: barra injetada no topo (caso tema mude)
    var bar = document.createElement('div');
    bar.id = 'bibelo-frete-bar';
    bar.innerHTML = '\\uD83D\\uDE9A <a href="https://www.papelariabibelo.com.br/politica-de-frete/" style="color:#fff;text-decoration:none;"><strong>FRETE GR\\u00C1TIS</strong> - Leia as Pol\\u00EDticas de Frete \\uD83D\\uDE9A</a>';
    bar.style.cssText = 'position:relative;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;text-align:center;padding:8px 16px;font-size:12px;font-family:Jost,Arial,sans-serif;font-weight:500;letter-spacing:0.3px;cursor:pointer;';
    bar.onclick = function(e) { if (e.target.tagName !== 'A') window.location.href = 'https://www.papelariabibelo.com.br/politica-de-frete/'; };
    document.body.prepend(bar);
  }

  // ══════════════════════════════════════════════════════════
  // BARRA DE PROGRESSO + UP-SELL NO CARRINHO
  // ══════════════════════════════════════════════════════════

  function injectCartProgress() {
    var path = window.location.pathname;
    if (!path.includes('/cart') && !path.includes('/carrito') && !path.includes('/carrinho')) return;

    function renderProgress() {
      if (document.getElementById('bibelo-cart-progress')) return;

      // Detectar valor total do carrinho
      var totalEl = document.querySelector('.js-cart-total, .cart-total, [data-cart-total], .total-price, .subtotal-price, .js-total-price');
      var totalText = totalEl ? (totalEl.textContent || '') : '';
      var total = parseFloat(totalText.replace(/[^0-9,.]/g, '').replace('.', '').replace(',', '.')) || 0;

      if (total <= 0) return;

      var FRETE_GRATIS = 79;
      var falta = Math.max(0, FRETE_GRATIS - total);
      var pct = Math.min(100, (total / FRETE_GRATIS) * 100);

      var container = document.createElement('div');
      container.id = 'bibelo-cart-progress';
      container.style.cssText = 'background:#fff;border:2px solid #fe68c4;border-radius:12px;padding:16px;margin:12px 0;font-family:Jost,Arial,sans-serif;';

      if (falta <= 0) {
        container.innerHTML = '<div style="text-align:center;"><span style="font-size:20px;">\\uD83C\\uDF89</span><p style="color:#fe68c4;font-weight:700;font-size:14px;margin:4px 0 0;">Parab\\u00E9ns! Voc\\u00EA ganhou FRETE GR\\u00C1TIS!</p></div>';
      } else {
        container.innerHTML = '<p style="color:#333;font-size:13px;margin:0 0 8px;text-align:center;font-weight:600;">Faltam <span style="color:#fe68c4;font-size:16px;">R$ ' + falta.toFixed(2).replace('.', ',') + '</span> para <strong>FRETE GR\\u00C1TIS!</strong></p>' +
          '<div style="background:#ffe5ec;border-radius:20px;height:10px;overflow:hidden;"><div style="background:linear-gradient(90deg,#fe68c4,#f472b6);height:100%;border-radius:20px;width:' + pct + '%;transition:width 0.5s;"></div></div>' +
          '<p style="color:#999;font-size:10px;text-align:center;margin:6px 0 0;">R$ ' + total.toFixed(2).replace('.', ',') + ' / R$ ' + FRETE_GRATIS + ',00</p>';

        // Up-sell: sugestões de produtos baratos para completar
        if (falta > 0 && falta < 50) {
          var upSell = '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #ffe5ec;">' +
            '<p style="color:#333;font-size:12px;margin:0 0 8px;font-weight:600;">\\u2728 Adicione e ganhe frete gr\\u00E1tis:</p>' +
            '<div style="display:flex;gap:8px;overflow-x:auto;">';

          var sugestoes = [
            { nome: 'Caneta Gel Ursinhos', preco: 'R$ 6,90', url: '/produtos/caneta-leonora-0-7-gel-ursinhos-colors-apagavel-premium/' },
            { nome: 'Marca Texto Fini', preco: 'R$ 7,90', url: '/produtos/marca-texto-leonora-aroma-fini-ponta-fina-premium/' },
            { nome: 'Clips Love Tris', preco: 'R$ 3,64', url: '/produtos/clips-prendedor-25mm-love-tris/' },
            { nome: 'Borracha Food Trends', preco: 'R$ 5,40', url: '/produtos/borracha-leonora-formas-food-trends-premium/' },
          ];

          sugestoes.forEach(function(p) {
            upSell += '<a href="' + p.url + '?utm_source=cart_upsell&utm_medium=progress_bar" style="flex-shrink:0;background:#fff7c1;border-radius:10px;padding:8px 12px;text-decoration:none;text-align:center;min-width:100px;border:1px solid #fee;">' +
              '<p style="font-size:11px;color:#333;margin:0;line-height:1.2;">' + p.nome + '</p>' +
              '<p style="font-size:12px;color:#fe68c4;font-weight:700;margin:2px 0 0;">' + p.preco + '</p>' +
              '</a>';
          });

          upSell += '</div></div>';
          container.innerHTML += upSell;
        }
      }

      // Inserir antes da tabela do carrinho
      var cartTable = document.querySelector('.js-cart-table, .cart-table, .cart-body, [data-store=cart-table], form[action*=cart], .cart-item-list, main');
      if (cartTable) {
        cartTable.parentNode.insertBefore(container, cartTable);
      } else {
        var main = document.querySelector('main, .page-content, #content, .container');
        if (main) main.prepend(container);
      }
    }

    // NuvemShop renderiza via JS — aguardar
    if (document.readyState === 'complete') {
      setTimeout(renderProgress, 1500);
    } else {
      window.addEventListener('load', function() { setTimeout(renderProgress, 1500); });
    }
  }

  // ══════════════════════════════════════════════════════════
  // BOTÃO WHATSAPP FLUTUANTE NA PÁGINA DE PRODUTO
  // ══════════════════════════════════════════════════════════

  function injectWhatsApp() {
    var path = window.location.pathname;
    if (!path.match(/^\\/(produtos|products)\\/[^/]+\\/?$/)) return;

    function render() {
      if (document.getElementById('bibelo-wa-btn')) return;

      var nome = '';
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) nome = ogTitle.getAttribute('content') || '';
      if (!nome) nome = (document.title || '').split(/\\s*[-\\u2013|]\\s*/)[0] || 'este produto';

      var msg = encodeURIComponent('Oi! Estou vendo o produto ' + nome + ' no site e gostaria de mais informa\\u00E7\\u00F5es!');
      var btn = document.createElement('a');
      btn.id = 'bibelo-wa-btn';
      btn.href = 'https://wa.me/5547933862514?text=' + msg;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" style="flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg><span id="bibelo-wa-text"> D\\u00FAvidas? Fale conosco</span>';
      btn.style.cssText = 'position:fixed;bottom:20px;right:16px;z-index:99998;background:#25D366;color:#fff;padding:12px 18px;border-radius:50px;text-decoration:none;font-size:13px;font-weight:600;font-family:Jost,Arial,sans-serif;box-shadow:0 4px 15px rgba(37,211,102,0.4);display:flex;align-items:center;gap:6px;transition:all 0.4s ease;overflow:hidden;white-space:nowrap;';
      btn.onmouseover = function() { btn.style.transform = 'scale(1.05)'; };
      btn.onmouseout = function() { btn.style.transform = 'scale(1)'; };
      btn.onclick = function() { track('whatsapp_click', { resource_nome: nome }); };
      document.body.appendChild(btn);

      // Encolher após 5s — só ícone do WhatsApp
      setTimeout(function() {
        var txt = document.getElementById('bibelo-wa-text');
        if (txt) txt.style.display = 'none';
        btn.style.padding = '14px';
        btn.style.borderRadius = '50%';
        btn.style.width = '50px';
        btn.style.height = '50px';
        btn.style.justifyContent = 'center';
      }, 5000);

      // Expandir ao passar o mouse
      btn.onmouseover = function() {
        var txt = document.getElementById('bibelo-wa-text');
        if (txt) txt.style.display = 'inline';
        btn.style.padding = '12px 18px';
        btn.style.borderRadius = '50px';
        btn.style.width = 'auto';
        btn.style.height = 'auto';
        btn.style.transform = 'scale(1.05)';
      };
      btn.onmouseout = function() {
        var txt = document.getElementById('bibelo-wa-text');
        if (txt) txt.style.display = 'none';
        btn.style.padding = '14px';
        btn.style.borderRadius = '50%';
        btn.style.width = '50px';
        btn.style.height = '50px';
        btn.style.transform = 'scale(1)';
      };
    }

    setTimeout(render, 2000);
  }

  // ══════════════════════════════════════════════════════════
  // BOTÃO RASTREAR PEDIDO NO HEADER
  // ══════════════════════════════════════════════════════════

  var _rCores = { blue: '#3b82f6', yellow: '#d97706', orange: '#f97316', green: '#16a34a', red: '#dc2626', purple: '#9333ea', gray: '#6b7280' };
  var _rIcones = { blue: '\\uD83D\\uDCE6', yellow: '\\uD83D\\uDE9A', orange: '\\uD83D\\uDEF5', green: '\\u2705', red: '\\u21A9', purple: '\\uD83C\\uDFEA', gray: '\\u23F3' };

  function injectRastreioBtn() {
    if (window.location.pathname.includes('/checkout')) return;

    if (!document.getElementById('bibelo-rastreio-modal')) _buildRastreioModal();

    // Tenta injetar em múltiplos momentos — NuvemShop re-renderiza
    // o .utilities-container após inicializar componentes (cart, account)
    _tryInjectRastreio();
    setTimeout(_tryInjectRastreio, 1000);
    setTimeout(_tryInjectRastreio, 2500);
  }

  function _tryInjectRastreio() {
    // === DESKTOP: ícone-only antes do carrinho, sem texto para não quebrar linha ===
    if (!document.getElementById('bibelo-rastreio-item')) {
      var uc = document.querySelector('.utilities-container');
      if (uc) {
        // Força uma única linha no container (evita wrap para 2ª linha)
        uc.style.cssText = (uc.style.cssText || '') + ';white-space:nowrap!important;';

        var btn = document.createElement('div');
        btn.id = 'bibelo-rastreio-item';
        // d-none d-md-inline-block = oculto no mobile, visível no desktop
        btn.className = 'utilities-item transition-soft d-none d-md-inline-block';
        btn.title = 'Rastrear pedido';
        btn.style.cssText = 'cursor:pointer;vertical-align:middle;';
        btn.innerHTML =
          '<div class="utility-head text-center">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/>' +
            '</svg>' +
            '<span class="utility-name transition-soft d-block" style="white-space:nowrap;">Rastrear</span>' +
          '</div>';
        btn.onclick = _openRastreio;

        var cartEl = document.getElementById('ajax-cart');
        var cartItem = cartEl ? cartEl.closest('.utilities-item') : null;
        if (cartItem && cartItem.parentNode === uc) { uc.insertBefore(btn, cartItem); } else { uc.appendChild(btn); }

        // MutationObserver: re-injetar se o tema remover o botão
        var obs = new MutationObserver(function() {
          if (!document.getElementById('bibelo-rastreio-item') && document.querySelector('.utilities-container')) {
            obs.disconnect();
            setTimeout(_tryInjectRastreio, 100);
          }
        });
        obs.observe(uc, { childList: true });
      }
    }

    // === MOBILE: link abaixo da barra de busca (d-md-none = só no mobile) ===
    // Abordagem mais robusta que tentar encontrar o nav-hamburger
    if (!document.getElementById('bibelo-rastreio-mobile')) {
      var searchEl = document.querySelector('.js-search-container, .search-container, form[action*="search"]');
      var searchParent = searchEl ? searchEl.parentElement : null;
      if (searchParent) {
        var mob = document.createElement('div');
        mob.id = 'bibelo-rastreio-mobile';
        mob.className = 'd-block d-md-none';
        mob.style.cssText = 'text-align:center;padding:5px 0 2px;';
        mob.innerHTML =
          '<a href="#" style="font-size:12px;font-family:Jost,Arial,sans-serif;font-weight:600;' +
            'color:#fe68c4;text-decoration:none;display:inline-flex;align-items:center;gap:5px;">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fe68c4" stroke-width="2" style="flex-shrink:0;">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/>' +
            '</svg>' +
            'Rastrear pedido' +
          '</a>';
        mob.querySelector('a').onclick = function(e) { e.preventDefault(); _openRastreio(); };
        searchParent.appendChild(mob);
      }
    }
  }

  function _buildRastreioModal() {
    if (document.getElementById('bibelo-rastreio-modal')) return;
    if (!document.getElementById('bibelo-rastreio-css')) {
      var s = document.createElement('style');
      s.id = 'bibelo-rastreio-css';
      s.textContent = '@keyframes br-spin{to{transform:rotate(360deg)}} #bibelo-rastreio-input:focus{border-color:#fe68c4!important;box-shadow:0 0 0 3px rgba(254,104,196,.15)!important;}';
      document.head.appendChild(s);
    }
    var ov = document.createElement('div');
    ov.id = 'bibelo-rastreio-modal';
    ov.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;background:rgba(0,0,0,.55);align-items:center;justify-content:center;padding:16px;font-family:Jost,Arial,sans-serif;box-sizing:border-box;';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.2);overflow:hidden;">' +
        '<div style="background:linear-gradient(135deg,#fe68c4,#f472b6);padding:18px 20px;display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" style="flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>' +
            '<span style="color:#fff;font-size:15px;font-weight:700;">Rastrear Pedido</span>' +
          '</div>' +
          '<button id="bibelo-rastreio-close" style="background:rgba(255,255,255,.25);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;color:#fff;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;" aria-label="Fechar">&times;</button>' +
        '</div>' +
        '<div style="padding:20px;">' +
          '<p style="color:#666;font-size:13px;margin:0 0 14px;line-height:1.5;">Digite o c\\u00F3digo de rastreio (ex: AN817294331BR) ou o n\\u00FAmero do pedido.</p>' +
          '<div style="display:flex;gap:8px;">' +
            '<input id="bibelo-rastreio-input" type="text" placeholder="C\\u00F3digo ou n\\u00BA do pedido" autocomplete="off" style="flex:1;border:2px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:14px;font-family:Jost,Arial,sans-serif;outline:none;transition:border-color .2s;min-width:0;box-sizing:border-box;" />' +
            '<button id="bibelo-rastreio-search" style="background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:Jost,Arial,sans-serif;white-space:nowrap;flex-shrink:0;">Rastrear</button>' +
          '</div>' +
          '<div id="bibelo-rastreio-result" style="margin-top:14px;min-height:0;"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.getElementById('bibelo-rastreio-close').onclick = _closeRastreio;
    document.getElementById('bibelo-rastreio-search').onclick = _doRastreio;
    document.getElementById('bibelo-rastreio-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') _doRastreio(); });
    ov.addEventListener('click', function(e) { if (e.target === ov) _closeRastreio(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && ov.style.display !== 'none') _closeRastreio(); });
  }

  function _openRastreio() {
    var m = document.getElementById('bibelo-rastreio-modal');
    if (!m) { _buildRastreioModal(); m = document.getElementById('bibelo-rastreio-modal'); }
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    var inp = document.getElementById('bibelo-rastreio-input');
    if (inp) { inp.value = ''; setTimeout(function() { inp.focus(); }, 80); }
    var res = document.getElementById('bibelo-rastreio-result');
    if (res) res.innerHTML = '';
  }

  function _closeRastreio() {
    var m = document.getElementById('bibelo-rastreio-modal');
    if (m) m.style.display = 'none';
    document.body.style.overflow = '';
  }

  function _doRastreio() {
    var inp = document.getElementById('bibelo-rastreio-input');
    var res = document.getElementById('bibelo-rastreio-result');
    if (!inp || !res) return;
    var val = inp.value.trim().toUpperCase().replace(/\\s+/g, '');
    if (!val) {
      res.innerHTML = '<p style="color:#dc2626;font-size:13px;margin:0;">Informe o c\\u00F3digo ou n\\u00FAmero do pedido.</p>';
      return;
    }
    res.innerHTML =
      '<div style="text-align:center;padding:20px 0;">' +
        '<div style="width:26px;height:26px;border:3px solid #ffe5ec;border-top-color:#fe68c4;border-radius:50%;animation:br-spin .7s linear infinite;margin:0 auto 8px;"></div>' +
        '<p style="color:#aaa;font-size:13px;margin:0;">Buscando...</p>' +
      '</div>';
    // Código Correios: AA000000000BR. Número de pedido: apenas dígitos.
    var isCode = /^[A-Z]{2}[0-9]{8,11}[A-Z]{2}$/.test(val) || (!/^[0-9]+$/.test(val) && val.length > 4);
    var qs = isCode ? ('codigo=' + encodeURIComponent(val)) : ('pedido=' + encodeURIComponent(val));
    fetch('${apiBase}/api/public/rastreio?' + qs)
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .then(function(resp) {
        if (!resp.ok) {
          if (resp.status === 404 && isCode) {
            res.innerHTML = _rFallback(val, 'Envio n\\u00E3o encontrado em nossa base.');
          } else {
            res.innerHTML = '<p style="color:#dc2626;font-size:13px;margin:0;">' + (resp.data.error || 'N\\u00E3o encontrado.') + '</p>';
          }
          return;
        }
        var d = resp.data;
        var cor = _rCores[d.status.cor] || '#6b7280';
        var ico = _rIcones[d.status.cor] || '\\uD83D\\uDCE6';
        var h =
          '<div style="border:2px solid ' + cor + ';border-radius:12px;padding:14px;background:#fafafa;">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
              '<span style="font-size:26px;line-height:1;">' + ico + '</span>' +
              '<div style="min-width:0;">' +
                '<div style="font-size:15px;font-weight:700;color:' + cor + ';">' + d.status.label + '</div>' +
                '<div style="font-size:11px;color:#999;margin-top:2px;">' + d.servico + ' &middot; ' + d.tracking_code + '</div>' +
              '</div>' +
            '</div>';
        var items = [];
        if (d.ultima_atualizacao) {
          try {
            var dt = new Date(d.ultima_atualizacao);
            items.push(['\\u00DAlt. atualiza\\u00E7\\u00E3o', dt.toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})]);
          } catch(ignored) {}
        }
        if (d.previsao_entrega && !d.status.entregue) items.push(['Previs\\u00E3o', d.previsao_entrega]);
        if (d.prazo_entrega_dias && !d.status.entregue) items.push(['Prazo', d.prazo_entrega_dias + ' dias \\u00FAteis']);
        if (d.origem) items.push(['Origem', d.origem]);
        if (d.destino) items.push(['Destino', d.destino]);
        if (d.pedido && d.pedido.numero) items.push(['Pedido', '#' + d.pedido.numero + (d.pedido.cliente ? ' &middot; ' + d.pedido.cliente : '')]);
        if (items.length) {
          h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">';
          items.forEach(function(it) {
            h += '<div style="background:#fff;border-radius:8px;padding:8px 10px;">' +
              '<div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.4px;">' + it[0] + '</div>' +
              '<div style="font-size:12px;color:#333;font-weight:600;margin-top:2px;word-break:break-word;">' + it[1] + '</div>' +
              '</div>';
          });
          h += '</div>';
        }
        var url = d.url_rastreio || ('https://melhorrastreio.com.br/rastreio/' + encodeURIComponent(d.tracking_code));
        h += '<a href="' + url + '" target="_blank" rel="noopener" style="display:block;text-align:center;background:' + cor + ';color:#fff;padding:10px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Ver detalhes completos \\u2192</a>';
        h += '</div>';
        res.innerHTML = h;
      })
      .catch(function() { res.innerHTML = _rFallback(val, 'N\\u00E3o foi poss\\u00EDvel consultar agora.'); });
  }

  function _rFallback(codigo, msg) {
    return '<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;text-align:center;">' +
      '<p style="color:#ea580c;font-size:13px;margin:0 0 10px;">' + msg + '</p>' +
      '<a href="https://melhorrastreio.com.br/rastreio/' + encodeURIComponent(codigo) + '" target="_blank" rel="noopener" ' +
        'style="display:inline-block;background:#ea580c;color:#fff;padding:9px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">' +
        'Rastrear no Melhor Envio \\u2192' +
      '</a>' +
      '</div>';
  }

  // ── Inicializar ─────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      detectPage();
      watchAddToCart();
      watchIdentify();
      injectFreteBar();
      injectCartProgress();
      injectWhatsApp();
      injectRastreioBtn();
    });
  } else {
    detectPage();
    watchAddToCart();
    watchIdentify();
    injectFreteBar();
    injectCartProgress();
    injectWhatsApp();
    injectRastreioBtn();
  }

})();
`);
});
