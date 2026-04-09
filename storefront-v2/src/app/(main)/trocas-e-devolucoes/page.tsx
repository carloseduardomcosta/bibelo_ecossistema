import type { Metadata } from "next"
import LegalPage from "@/components/layout/LegalPage"

export const metadata: Metadata = { title: "Trocas e Devoluções" }

export default function TrocasPage() {
  return (
    <LegalPage title="Política de Troca e Devolução">
      <p>Na Papelaria Bibelô, queremos que sua experiência de compra seja incrível. Por isso, criamos uma política de troca e devolução que respeita seus direitos, de acordo com o Código de Defesa do Consumidor.</p>

      <h2>1. Prazo para Troca ou Devolução</h2>
      <p>Conforme o artigo 49 do Código de Defesa do Consumidor, o prazo para solicitar a troca ou devolução de um produto por arrependimento é de <strong>7 (sete) dias corridos</strong>, a contar da data de recebimento do pedido. Para produtos com defeito de fabricação, o prazo é de até <strong>30 (trinta) dias corridos</strong>.</p>

      <h2>2. Condições para Troca ou Devolução</h2>
      <ul>
        <li>Estar em sua embalagem original, sem indícios de uso, sem violação do lacre original do fabricante (se houver).</li>
        <li>Estar acompanhado de todos os acessórios que o compõem.</li>
        <li>Não realizaremos trocas de produtos que apresentem sinais de mau uso por parte do cliente.</li>
      </ul>

      <h2>3. Como Solicitar a Troca ou Devolução</h2>
      <p>Para iniciar o processo, entre em contato conosco através de um de nossos canais de atendimento dentro do prazo estipulado. Tenha em mãos o número do seu pedido e o motivo da troca ou devolução. Nossa equipe fornecerá as instruções necessárias para o envio do produto de volta para nós.</p>
      <p>O custo do frete para a primeira devolução por arrependimento é por nossa conta.</p>

      <h2>4. Análise do Produto</h2>
      <p>Após o recebimento do produto em nosso centro de distribuição, ele passará por uma análise para verificar se as condições para troca ou devolução foram atendidas. Este processo pode levar até <strong>5 (cinco) dias úteis</strong>.</p>

      <h2>5. Opções de Reembolso ou Troca</h2>
      <p>Após a aprovação da análise, você poderá optar por:</p>
      <ul>
        <li><strong>Troca por outro produto:</strong> Você pode escolher um novo produto de mesmo valor ou, caso o valor seja diferente, faremos o acerto da diferença.</li>
        <li><strong>Vale-compras:</strong> Um crédito no valor do produto devolvido para ser utilizado em futuras compras na Papelaria Bibelô.</li>
        <li><strong>Reembolso:</strong> A restituição do valor pago pelo produto, que será realizada na mesma modalidade de pagamento utilizada na compra.</li>
      </ul>

      <p className="mt-8 p-4 bg-gray-50 rounded-xl text-sm">
        <strong>Contato:</strong><br />
        E-mail: <a href="mailto:contato@papelariabibelo.com.br">contato@papelariabibelo.com.br</a><br />
        WhatsApp: <a href="https://wa.me/5547933862514">(47) 9 3386-2514</a>
      </p>
    </LegalPage>
  )
}
