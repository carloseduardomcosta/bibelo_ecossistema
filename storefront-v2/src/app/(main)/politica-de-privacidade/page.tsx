import type { Metadata } from "next"
import LegalPage from "@/components/layout/LegalPage"

export const metadata: Metadata = { title: "Política de Privacidade" }

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de Privacidade">
      <p><em>Última atualização: 12 de fevereiro de 2026</em></p>

      <p>A sua privacidade é importante para nós. Esta Política de Privacidade explica como a Papelaria Bibelô coleta, usa, compartilha e protege as informações pessoais dos usuários da nossa loja virtual.</p>

      <p><strong>Responsável:</strong> Carlos Eduardo De Macedo Costa — CNPJ 63.961.764/0001-63<br />
      Rua Marechal Floriano Peixoto, 941 — Bairro Padre Martinho Stein — Timbó/SC</p>

      <h2>1. Dados Coletados</h2>
      <p>Coletamos os seguintes dados pessoais quando você utiliza nossa loja:</p>
      <ul>
        <li><strong>Dados de contato:</strong> nome, sobrenome, telefone, cidade, estado, e-mail</li>
        <li><strong>Dados de formulários:</strong> informações preenchidas em cadastros e pedidos</li>
        <li><strong>Dados de navegação:</strong> tipo de navegador, tempo na loja, páginas visitadas, preferências</li>
        <li><strong>Dados de localização:</strong> cidade e estado (para cálculo de frete)</li>
      </ul>
      <p>Não coletamos dados pessoais sensíveis (origem racial, convicção religiosa, opinião política, dados de saúde, dados genéticos ou biométricos).</p>

      <h2>2. Uso dos Dados Pessoais</h2>
      <p>Utilizamos seus dados para:</p>
      <ul>
        <li>Viabilizar e processar suas compras</li>
        <li>Confirmar suas informações cadastrais</li>
        <li>Enviar comunicações sobre pedidos, entregas e atualizações</li>
        <li>Personalizar sua experiência de compra</li>
        <li>Enviar ofertas e promoções (com seu consentimento)</li>
        <li>Entrar em contato quando necessário</li>
      </ul>

      <h2>3. Compartilhamento com Terceiros</h2>
      <p>Seus dados podem ser compartilhados com:</p>
      <ul>
        <li><strong>Parceiros selecionados:</strong> para viabilizar a entrega dos produtos</li>
        <li><strong>Provedores de serviços:</strong> processamento de pagamentos, envio de e-mails</li>
        <li>Em caso de reorganização, fusão ou venda da empresa</li>
      </ul>

      <h2>4. Cookies e Tecnologias de Rastreamento</h2>
      <p>Utilizamos cookies para melhorar sua experiência, identificar seu navegador e coletar informações como tempo na loja, páginas visitadas e preferências de idioma.</p>

      <h2>5. Seus Direitos (LGPD)</h2>
      <p>De acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a:</p>
      <ul>
        <li>Confirmação da existência de tratamento de dados</li>
        <li>Acesso aos seus dados pessoais</li>
        <li>Correção de dados incompletos ou desatualizados</li>
        <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
        <li>Portabilidade dos dados</li>
        <li>Eliminação dos dados tratados com consentimento</li>
        <li>Informação sobre entidades com as quais compartilhamos dados</li>
        <li>Revogação do consentimento</li>
      </ul>

      <h2>6. Segurança dos Dados</h2>
      <p>Adotamos medidas técnicas e organizacionais para proteger seus dados pessoais contra acesso não autorizado, destruição, perda, alteração ou qualquer forma de tratamento inadequado.</p>

      <h2>7. Atualizações desta Política</h2>
      <p>Esta política pode ser atualizada periodicamente. Recomendamos que você a consulte regularmente para estar ciente de quaisquer alterações.</p>

      <p className="mt-8 p-4 bg-gray-50 rounded-xl text-sm">
        <strong>Pessoa Responsável:</strong> Carlos Eduardo De Macedo Costa<br />
        <strong>E-mail:</strong> <a href="mailto:contato@papelariabibelo.com.br">contato@papelariabibelo.com.br</a><br />
        <strong>WhatsApp:</strong> <a href="https://wa.me/5547933862514">(47) 9 3386-2514</a>
      </p>
    </LegalPage>
  )
}
