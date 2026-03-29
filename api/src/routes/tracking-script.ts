import { Router, Request, Response } from "express";

export const trackingScriptRouter = Router();

// ── GET /api/tracking/bibelo.js — script de tracking para NuvemShop ──

trackingScriptRouter.get("/bibelo.js", (_req: Request, res: Response) => {
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
      track('page_view', { pagina_tipo: 'cart' });
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

    // Categoria — NuvemShop usa /categorias/slug ou slug direto
    if (path.match(/^\\/(categorias|categories)\\/[^/]+\\/?$/)) {
      detectCategory();
      return;
    }

    // Outra página
    track('page_view', { pagina_tipo: 'other' });
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
          // Buscar dados do produto na página (DOM real)
          var productData = { pagina_tipo: 'product' };
          var ogT = document.querySelector('meta[property="og:title"]');
          if (ogT) productData.resource_nome = ogT.getAttribute('content');
          if (!productData.resource_nome) {
            var tParts = (document.title || '').split(/\\s*[-\\u2013|]\\s*/);
            if (tParts[0]) productData.resource_nome = tParts[0].trim();
          }
          var ogI = document.querySelector('meta[property="og:image"]');
          if (ogI) productData.resource_imagem = ogI.getAttribute('content');
          var ogP = document.querySelector('meta[property="product:price:amount"]');
          if (ogP) productData.resource_preco = parseFloat(ogP.getAttribute('content') || '0');
          var pIdEl = document.querySelector('[data-product-id]');
          if (pIdEl) productData.resource_id = pIdEl.getAttribute('data-product-id');
          if (!productData.resource_id) {
            var s = window.location.pathname.split('/').filter(Boolean).pop();
            productData.resource_id = s || undefined;
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

  // ── Inicializar ─────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      detectPage();
      watchAddToCart();
      watchIdentify();
    });
  } else {
    detectPage();
    watchAddToCart();
    watchIdentify();
  }

})();
`);
});
