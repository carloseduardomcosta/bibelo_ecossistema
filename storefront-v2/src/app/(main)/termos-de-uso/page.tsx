import type { Metadata } from "next"
import LegalPage from "@/components/layout/LegalPage"

export const metadata: Metadata = { title: "Termos de Uso" }

export default function TermosPage() {
  return (
    <LegalPage title="Termos de Uso">
      <p><em>Última atualização: 18 de fevereiro de 2026</em></p>

      <p><strong>Responsável:</strong> Carlos Eduardo De Macedo Costa — CNPJ 63.961.764/0001-63<br />
      Rua Marechal Floriano Peixoto, 941 — Timbó/SC</p>

      <h2>1. Objeto</h2>
      <p>Os presentes Termos de Uso regulam o acesso e a utilização da loja virtual Papelaria Bibelô, disponibilizada por Carlos Eduardo De Macedo Costa.</p>

      <h2>2. Aceitação dos Termos</h2>
      <p>Ao acessar e utilizar a Loja, o Usuário declara ter lido, compreendido e aceito integralmente estes Termos. O acesso à Loja é destinado a pessoas com capacidade legal para contratar, não sendo destinado a menores de 18 anos desacompanhados de responsável legal.</p>

      <h2>3. Cadastro e Conta do Usuário</h2>
      <p>Para realizar compras, o Usuário deverá fornecer informações verdadeiras e manter a confidencialidade de sua senha. O Usuário é responsável por todas as atividades realizadas em sua conta.</p>

      <h2>4. Produtos e Preços</h2>
      <ul>
        <li>Os preços e disponibilidade dos produtos estão sujeitos a alterações sem aviso prévio.</li>
        <li>Eventuais erros de precificação serão comunicados ao cliente.</li>
        <li>As imagens dos produtos são ilustrativas e podem variar levemente.</li>
        <li>O estoque está sujeito à disponibilidade.</li>
      </ul>

      <h2>5. Pedidos e Pagamentos</h2>
      <p>A confirmação do pedido ocorre após a aprovação do pagamento. Reservamo-nos o direito de recusar pedidos suspeitos de fraude. Os prazos de entrega contam a partir da confirmação do pagamento.</p>

      <h2>6. Entrega e Frete</h2>
      <ul>
        <li>Os prazos de entrega são estimativas e podem variar.</li>
        <li>O frete é calculado com base no CEP de destino.</li>
        <li>Não nos responsabilizamos por atrasos causados por fatores externos (greves, intempéries, etc.).</li>
        <li>Em caso de extravio, o cliente deve nos contatar em até 7 dias.</li>
      </ul>

      <h2>7. Trocas, Devoluções e Cancelamentos</h2>
      <ul>
        <li><strong>Arrependimento:</strong> 7 dias corridos após o recebimento</li>
        <li><strong>Defeito (produtos não duráveis):</strong> 30 dias corridos</li>
        <li><strong>Defeito (produtos duráveis):</strong> 90 dias corridos</li>
        <li><strong>Produto errado:</strong> 7 dias corridos</li>
      </ul>

      <h2>8. Propriedade Intelectual</h2>
      <p>Todo o conteúdo da Loja, incluindo textos, imagens, logotipos, marcas e layout, é protegido por direitos autorais e de propriedade intelectual. É proibida a reprodução sem autorização expressa.</p>

      <h2>9. Conduta do Usuário</h2>
      <p>É proibido ao Usuário:</p>
      <ul>
        <li>Utilizar a Loja para fins ilegais</li>
        <li>Publicar conteúdo ofensivo ou difamatório</li>
        <li>Acessar áreas restritas sem autorização</li>
        <li>Interferir no funcionamento da Loja</li>
        <li>Coletar dados de outros usuários</li>
        <li>Utilizar robôs, scrapers ou ferramentas automatizadas</li>
      </ul>

      <h2>10. Limitação de Responsabilidade</h2>
      <p>A Papelaria Bibelô não se responsabiliza por danos indiretos, incidentais ou consequenciais decorrentes do uso da Loja, exceto nos casos previstos em lei.</p>

      <h2>11. Privacidade e Proteção de Dados</h2>
      <p>O tratamento de dados pessoais é regido pela nossa <a href="/politica-de-privacidade">Política de Privacidade</a>, em conformidade com a Lei Geral de Proteção de Dados (LGPD).</p>

      <h2>12. Alterações nos Termos de Uso</h2>
      <p>Estes Termos podem ser atualizados a qualquer momento. Recomendamos a consulta periódica desta página.</p>

      <h2>13. Lei Aplicável e Foro</h2>
      <p>Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca de Timbó/SC para dirimir quaisquer questões.</p>

      <p className="mt-8 p-4 bg-gray-50 rounded-xl text-sm">
        <strong>Contato:</strong><br />
        E-mail: <a href="mailto:contato@papelariabibelo.com.br">contato@papelariabibelo.com.br</a><br />
        WhatsApp: <a href="https://wa.me/5547933862514">(47) 9 3386-2514</a>
      </p>
    </LegalPage>
  )
}
