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
          cls.includes('add-to-cart') ||
          cls.includes('js-addtocart') ||
          cls.includes('btn-add') ||
          id.includes('addtocart') ||
          target.getAttribute('data-action') === 'add-to-cart';

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
    var bar = document.createElement('div');
    bar.id = 'bibelo-frete-bar';
    bar.innerHTML = '\\uD83D\\uDE9A <strong>FRETE GR\\u00C1TIS</strong> para Sul e Sudeste em compras acima de R$ 79,00 &nbsp;|&nbsp; Toda compra vai com mimo surpresa! \\uD83C\\uDF80';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;text-align:center;padding:8px 16px;font-size:12px;font-family:Jost,Arial,sans-serif;font-weight:500;letter-spacing:0.3px;box-shadow:0 2px 8px rgba(254,104,196,0.3);';
    document.body.prepend(bar);
    // Empurrar o conteúdo pra baixo
    document.body.style.paddingTop = (bar.offsetHeight) + 'px';
    // Fechar após 15s em mobile (ocupa espaço)
    if (window.innerWidth < 768) {
      setTimeout(function() { bar.style.display = 'none'; document.body.style.paddingTop = '0'; }, 15000);
    }
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
      btn.innerHTML = '\\uD83D\\uDCAC D\\u00FAvidas? Fale conosco';
      btn.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:99998;background:#25D366;color:#fff;padding:12px 20px;border-radius:50px;text-decoration:none;font-size:13px;font-weight:600;font-family:Jost,Arial,sans-serif;box-shadow:0 4px 15px rgba(37,211,102,0.4);display:flex;align-items:center;gap:6px;transition:transform 0.2s;';
      btn.onmouseover = function() { btn.style.transform = 'scale(1.05)'; };
      btn.onmouseout = function() { btn.style.transform = 'scale(1)'; };
      btn.onclick = function() { track('whatsapp_click', { resource_nome: nome }); };
      document.body.appendChild(btn);
    }

    setTimeout(render, 2000);
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
    });
  } else {
    detectPage();
    watchAddToCart();
    watchIdentify();
    injectFreteBar();
    injectCartProgress();
    injectWhatsApp();
  }

})();
`);
});
