#!/bin/bash
# ============================================================
# Setup do Storefront V2 — Papelaria Bibelô
# Executar como: bash setup.sh
# ============================================================

set -e

echo "================================================"
echo "  Papelaria Bibelô — Storefront V2 Setup"
echo "================================================"

# Verificar Node.js
if ! command -v node &> /dev/null; then
  echo "[ERRO] Node.js não encontrado. Instale o Node.js 20+ antes de continuar."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "[ERRO] Node.js 18+ é necessário. Versão atual: $(node -v)"
  exit 1
fi

echo "[OK] Node.js $(node -v) encontrado"

# Verificar pnpm
if ! command -v pnpm &> /dev/null; then
  echo "[INFO] Instalando pnpm..."
  npm install -g pnpm
fi

echo "[OK] pnpm $(pnpm -v) encontrado"

# Instalar dependências
echo ""
echo "[1/3] Instalando dependências..."
pnpm install --no-frozen-lockfile

# Criar .env.local se não existir
if [ ! -f ".env.local" ]; then
  echo ""
  echo "[2/3] Criando arquivo .env.local..."
  cat > .env.local << 'ENVEOF'
# Medusa Backend — Instância ISOLADA (não mexer no backend de produção)
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9001
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_demo_bibelo_v2

# Região padrão
NEXT_PUBLIC_DEFAULT_REGION=br

# Loja
NEXT_PUBLIC_STORE_NAME=Papelaria Bibelô
NEXT_PUBLIC_STORE_URL=http://localhost:8001

# Contato
NEXT_PUBLIC_WHATSAPP=5547933862514

# Revalidação de cache (segundos)
NEXT_PUBLIC_REVALIDATE_INTERVAL=300
ENVEOF
  echo "[OK] .env.local criado"
else
  echo "[2/3] .env.local já existe, pulando..."
fi

# Build
echo ""
echo "[3/3] Fazendo build de produção..."
pnpm run build

echo ""
echo "================================================"
echo "  Setup concluído com sucesso!"
echo "================================================"
echo ""
echo "Para iniciar em desenvolvimento:"
echo "  pnpm dev          → http://localhost:8001"
echo ""
echo "Para iniciar em produção:"
echo "  pnpm start        → http://localhost:8001"
echo ""
echo "Para rodar com PM2:"
echo "  pm2 start 'pnpm start' --name storefront-v2"
echo ""
echo "IMPORTANTE: Este frontend usa um Medusa ISOLADO"
echo "na porta 9001. Não interfere no backend atual."
echo "================================================"
