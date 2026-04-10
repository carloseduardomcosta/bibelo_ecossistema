import type { Metadata } from "next"
import LegalPage from "@/components/layout/LegalPage"

export const metadata: Metadata = { title: "Política de Frete" }

export default function FretePage() {
  return (
    <LegalPage title="Política de Frete">
      <p>Confira abaixo as condições de frete para envios da Papelaria Bibelô.</p>

      <h2>Frete Grátis — Regiões Sul e Sudeste</h2>
      <p>Para pedidos acima de <strong>R$ 79,00</strong>, o frete é grátis para as regiões Sul e Sudeste do Brasil, na opção de envio mais econômica disponível.</p>

      <h2>Frete Grátis — Demais Regiões</h2>
      <p>Para as regiões Norte, Nordeste e Centro-Oeste, o frete é grátis em pedidos acima de <strong>R$ 199,00</strong>, na opção de envio mais econômica disponível.</p>

      <h2>Resumo por Região</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse mt-2">
          <thead>
            <tr className="bg-bibelo-rosa/50">
              <th className="text-left p-3 font-semibold text-bibelo-dark">Região</th>
              <th className="text-left p-3 font-semibold text-bibelo-dark">Frete Grátis acima de</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="p-3">Sul e Sudeste</td>
              <td className="p-3 font-semibold text-bibelo-pink">R$ 79,00</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="p-3">Norte, Nordeste e Centro-Oeste</td>
              <td className="p-3 font-semibold text-bibelo-pink">R$ 199,00</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Prazo de Entrega</h2>
      <ul>
        <li>O prazo de entrega varia conforme a região e a modalidade de envio escolhida.</li>
        <li>A contagem do prazo inicia após a confirmação do pagamento.</li>
        <li>Pedidos realizados após as 14h serão processados no próximo dia útil.</li>
        <li>O código de rastreamento será enviado por e-mail após a postagem.</li>
      </ul>

      <h2>Clube Bibelô — Vantagens Exclusivas</h2>
      <ul>
        <li>Grupo VIP no WhatsApp com ofertas exclusivas</li>
        <li>Cupom <strong>10% OFF</strong> na primeira compra com o código <strong>BIBELO10</strong></li>
        <li>Acesso antecipado a promoções</li>
        <li>Ofertas exclusivas para membros</li>
      </ul>

      <p className="mt-8 p-4 bg-gray-50 rounded-xl text-sm">
        <strong>Contato:</strong><br />
        E-mail: <a href="mailto:contato@papelariabibelo.com.br">contato@papelariabibelo.com.br</a><br />
        WhatsApp: <a href="https://wa.me/5547933862514">(47) 9 3386-2514</a>
      </p>
    </LegalPage>
  )
}
