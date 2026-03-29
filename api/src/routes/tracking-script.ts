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
    // NuvemShop injeta meta tags e LD+JSON com dados do produto
    var data = { pagina_tipo: 'product' };

    // Tenta extrair do LD+JSON (mais confiável)
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var json = JSON.parse(scripts[i].textContent || '');
        if (json['@type'] === 'Product') {
          data.resource_nome = json.name || undefined;
          data.resource_imagem = json.image || (json.images && json.images[0]) || undefined;
          if (json.offers) {
            var price = json.offers.price || (json.offers[0] && json.offers[0].price);
            if (price) data.resource_preco = parseFloat(price);
          }
          // ID do produto via URL ou SKU
          data.resource_id = json.sku || json.productID || undefined;
          break;
        }
      } catch(e) {}
    }

    // Fallback: meta tags Open Graph
    if (!data.resource_nome) {
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) data.resource_nome = ogTitle.getAttribute('content') || undefined;
    }
    if (!data.resource_imagem) {
      var ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) data.resource_imagem = ogImage.getAttribute('content') || undefined;
    }
    if (!data.resource_preco) {
      var ogPrice = document.querySelector('meta[property="product:price:amount"]');
      if (ogPrice) data.resource_preco = parseFloat(ogPrice.getAttribute('content') || '0');
    }
    if (!data.resource_id) {
      // NuvemShop: meta tag com product id
      var metaId = document.querySelector('meta[name="product:id"]') || document.querySelector('[data-product-id]');
      if (metaId) data.resource_id = metaId.getAttribute('content') || metaId.getAttribute('data-product-id') || undefined;
    }

    track('product_view', data);
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
          // Buscar dados do produto na página
          var productData = { pagina_tipo: 'product' };
          var scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (var j = 0; j < scripts.length; j++) {
            try {
              var json = JSON.parse(scripts[j].textContent || '');
              if (json['@type'] === 'Product') {
                productData.resource_nome = json.name;
                productData.resource_preco = json.offers ? parseFloat(json.offers.price || (json.offers[0] && json.offers[0].price) || 0) : undefined;
                productData.resource_id = json.sku || json.productID;
                productData.resource_imagem = json.image || undefined;
                break;
              }
            } catch(ex) {}
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
