import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "pt-BR",
}: ConvertToLocaleParams) => {
  // Medusa v2 retorna valores em centavos (menor unidade da moeda)
  // Intl.NumberFormat espera valor em unidade principal (reais, não centavos)
  const divisor = currency_code?.toUpperCase() === "JPY" ? 1 : 100
  const amountInMajorUnits = amount / divisor

  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amountInMajorUnits)
    : amountInMajorUnits.toString()
}
