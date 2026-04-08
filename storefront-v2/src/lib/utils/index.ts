import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Merge de classes Tailwind
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatar preço em BRL
export function formatPrice(amount: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

// Calcular porcentagem de desconto
export function getDiscountPercent(original: number, sale: number): number {
  if (!original || !sale || original <= sale) return 0
  return Math.round(((original - sale) / original) * 100)
}

// Formatar parcelamento
export function formatInstallments(amount: number, maxInstallments = 12): string {
  const minInstallment = 500 // R$ 5,00 em centavos
  let installments = maxInstallments

  while (installments > 1 && amount / installments < minInstallment) {
    installments--
  }

  if (installments <= 1) return formatPrice(amount)

  const installmentValue = amount / installments
  return `${installments}x de ${formatPrice(installmentValue)} sem juros`
}

// Truncar texto
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.substring(0, length) + "..."
}

// Gerar slug a partir de texto
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
}

// Verificar se produto está esgotado
export function isOutOfStock(variant?: { inventory_quantity?: number | null }): boolean {
  if (!variant) return false
  if (variant.inventory_quantity === null || variant.inventory_quantity === undefined) return false
  return variant.inventory_quantity <= 0
}
