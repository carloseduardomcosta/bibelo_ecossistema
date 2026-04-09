#!/usr/bin/env bash
# Smoke Tests — Storefront v2 (Papelaria Bibelô)

BASE_URL="${STOREFRONT_URL:-http://localhost:8001}"
MEDUSA_URL="${MEDUSA_URL:-http://localhost:9000}"
API_KEY="pk_042f8180dfdbe6168d60806151daaf71a16f54691a9981201a8f3c298d325735"

GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
TOTAL=0; PASSED=0; FAILED=0

pass() { TOTAL=$((TOTAL+1)); PASSED=$((PASSED+1)); echo -e "  ${GREEN}PASS${NC}  $1"; }
fail() { TOTAL=$((TOTAL+1)); FAILED=$((FAILED+1)); echo -e "  ${RED}FAIL${NC}  $1"; }

check_status() {
  local desc="$1" url="$2" expected="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
  [ "$status" = "$expected" ] && pass "$desc ($status)" || fail "$desc (esperado $expected, recebeu $status)"
}

check_not_500() {
  local desc="$1" url="$2"
  shift 2
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" "$url" 2>/dev/null || echo "000")
  [ "$status" != "500" ] && [ "$status" != "000" ] && pass "$desc ($status)" || fail "$desc (recebeu $status)"
}

check_contains() {
  local desc="$1" url="$2" pattern="$3"
  local body
  body=$(curl -s --max-time 10 "$url" 2>/dev/null)
  echo "$body" | grep -qi "$pattern" && pass "$desc" || fail "$desc (não contém '$pattern')"
}

check_not_contains() {
  local desc="$1" url="$2" pattern="$3"
  local body
  body=$(curl -s --max-time 10 "$url" 2>/dev/null)
  echo "$body" | grep -qi "$pattern" && fail "$desc (contém '$pattern')" || pass "$desc"
}

check_header() {
  local desc="$1" url="$2" header="$3"
  local headers
  headers=$(curl -sI --max-time 10 "$url" 2>/dev/null)
  echo "$headers" | grep -qi "$header" && pass "$desc" || fail "$desc (header '$header' ausente)"
}

echo -e "\n${BOLD}=== Smoke Tests — Storefront v2 ===${NC}"
echo -e "Base: ${CYAN}$BASE_URL${NC}  Medusa: ${CYAN}$MEDUSA_URL${NC}  Data: $(date '+%Y-%m-%d %H:%M')\n"

# ── Rotas ──
echo -e "${CYAN}${BOLD}── Rotas (HTTP 200) ──${NC}"
for route in "/" "/produtos" "/busca?q=caneta" "/carrinho" "/checkout" "/conta" "/conta/callback"; do
  check_status "GET $route" "$BASE_URL$route"
done

# ── Conta subpages ──
echo -e "\n${CYAN}${BOLD}── Conta (subpáginas) ──${NC}"
check_status "GET /conta/pedidos" "$BASE_URL/conta/pedidos"
check_status "GET /conta/enderecos" "$BASE_URL/conta/enderecos"
check_status "GET /checkout/confirmacao" "$BASE_URL/checkout/confirmacao"

# ── Páginas legais ──
echo -e "\n${CYAN}${BOLD}── Páginas legais ──${NC}"
check_status "GET /sobre" "$BASE_URL/sobre"
check_status "GET /politica-de-privacidade" "$BASE_URL/politica-de-privacidade"
check_status "GET /termos-de-uso" "$BASE_URL/termos-de-uso"
check_status "GET /politica-de-frete" "$BASE_URL/politica-de-frete"
check_status "GET /trocas-e-devolucoes" "$BASE_URL/trocas-e-devolucoes"
check_status "GET /faq" "$BASE_URL/faq"

# ── Assets ──
echo -e "\n${CYAN}${BOLD}── Assets estáticos ──${NC}"
for asset in "/logo-bibelo.png" "/titulo-bibelo.png" "/carousel/pc/fretegratis.webp" "/carousel/pc/7off.webp" "/carousel/pc/grupo_vip.webp" "/carousel/mobile/fretegratis_mobile.webp" "/carousel/mobile/grupovip_mobile.webp"; do
  check_status "GET $asset" "$BASE_URL$asset"
done

# ── Medusa API ──
echo -e "\n${CYAN}${BOLD}── Medusa API ──${NC}"
check_status "Health" "$MEDUSA_URL/health"
check_not_500 "Products (com API key)" "$MEDUSA_URL/store/products?limit=1" -H "x-publishable-api-key: $API_KEY"
check_not_500 "Categories (com API key)" "$MEDUSA_URL/store/product-categories" -H "x-publishable-api-key: $API_KEY"

# ── Auth ──
echo -e "\n${CYAN}${BOLD}── Auth endpoints ──${NC}"
check_not_500 "POST emailpass (invalid)" "$MEDUSA_URL/auth/customer/emailpass" -X POST -H "Content-Type: application/json" -d '{"email":"bad","password":"x"}'
check_not_500 "POST register (empty)" "$MEDUSA_URL/auth/customer/emailpass/register" -X POST -H "Content-Type: application/json" -d '{}'

# ── HTML content ──
echo -e "\n${CYAN}${BOLD}── Conteúdo HTML ──${NC}"
check_contains "Homepage contém 'Bibelô'" "$BASE_URL/" "bibel"
# Verifica fonte no CSS (importada via @import, não no HTML)
CSS_PATH=$(curl -s --max-time 10 "$BASE_URL/" 2>/dev/null | grep -oP '/_next/static/css/[a-f0-9]+\.css' | head -1)
check_contains "Fonte Cormorant no CSS" "$BASE_URL$CSS_PATH" "Cormorant"
check_contains "Cor #fe68c4" "$BASE_URL/" "fe68c4"
check_not_contains "Sem fonte Kanit" "$BASE_URL/" "Kanit"

# ── Headers segurança (via Nginx) ──
echo -e "\n${CYAN}${BOLD}── Headers de segurança ──${NC}"
check_header "X-Robots-Tag noindex" "https://homolog.papelariabibelo.com.br/" "x-robots-tag"
check_header "X-Frame-Options" "https://homolog.papelariabibelo.com.br/" "x-frame-options"
check_header "X-Content-Type-Options" "https://homolog.papelariabibelo.com.br/" "x-content-type-options"

# ── Resultado ──
echo -e "\n${BOLD}═══════════════════════════════════${NC}"
echo -e "Total: $TOTAL  ${GREEN}Passed: $PASSED${NC}  ${RED}Failed: $FAILED${NC}"
echo -e "${BOLD}═══════════════════════════════════${NC}"

[ "$FAILED" -eq 0 ] && exit 0 || exit 1
