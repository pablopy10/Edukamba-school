import { LegalLayout } from "@/components/LegalLayout";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

const Privacidade = () => {
  return (
    <LegalLayout title="Política de Privacidade" updatedAt="25 de Abril de 2026">
      <p className="text-base text-muted-foreground">
        A sua privacidade é importante para nós. Esta política descreve que dados recolhemos,
        para que os usamos e os direitos que tem sobre eles enquanto utilizador do Edukamba.
      </p>

      <Section title="1. Dados que recolhemos">
        <p>Para o funcionamento da plataforma, recolhemos os seguintes dados:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li><strong>Conta:</strong> nome completo, email, telefone, fotografia de perfil;</li>
          <li><strong>Académicos:</strong> turma, presenças, notas, relatórios;</li>
          <li><strong>Financeiros:</strong> propinas, comprovativos de pagamento;</li>
          <li><strong>Técnicos:</strong> endereço IP, tipo de browser, registos de acesso.</li>
        </ul>
      </Section>

      <Section title="2. Como utilizamos os seus dados">
        <p>Os dados são utilizados para:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Fornecer as funcionalidades da plataforma;</li>
          <li>Comunicar com utilizadores (notificações, mensagens, alertas);</li>
          <li>Garantir a segurança e prevenir fraudes;</li>
          <li>Cumprir obrigações legais.</li>
        </ul>
      </Section>

      <Section title="3. Partilha de dados">
        <p>
          Não vendemos os seus dados. Apenas partilhamos informação com fornecedores de
          serviços essenciais (alojamento, processamento de pagamentos) sob acordos estritos
          de confidencialidade, ou quando exigido por lei.
        </p>
      </Section>

      <Section title="4. Segurança">
        <p>
          Aplicamos medidas técnicas e organizativas para proteger os seus dados, incluindo
          encriptação em trânsito (HTTPS), controlo de acessos por perfil e cópias de
          segurança regulares.
        </p>
      </Section>

      <Section title="5. Retenção">
        <p>
          Os dados são conservados enquanto a conta da escola estiver activa. Após o
          cancelamento, os dados são mantidos por 30 dias para permitir exportação e depois
          eliminados de forma segura.
        </p>
      </Section>

      <Section title="6. Os seus direitos">
        <p>Tem o direito de:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Aceder aos seus dados pessoais;</li>
          <li>Corrigir dados incorrectos;</li>
          <li>Solicitar a eliminação dos seus dados;</li>
          <li>Opor-se ou limitar determinados tratamentos;</li>
          <li>Portar os seus dados para outro serviço.</li>
        </ul>
      </Section>

      <Section title="7. Cookies">
        <p>
          Utilizamos cookies essenciais para manter a sessão iniciada e cookies analíticos
          para compreender a utilização da plataforma e melhorá-la. Pode controlar cookies
          através das definições do seu browser.
        </p>
      </Section>

      <Section title="8. Menores de idade">
        <p>
          Quando o Edukamba processa dados de alunos menores, fá-lo a pedido da escola, que é
          a entidade responsável pelo tratamento. Os encarregados de educação podem solicitar
          informações através da escola.
        </p>
      </Section>

      <Section title="9. Alterações a esta política">
        <p>
          Podemos actualizar esta política periodicamente. Notificaremos os utilizadores
          quando ocorrerem alterações significativas.
        </p>
      </Section>

      <Section title="10. Contacto">
        <p>
          Para exercer os seus direitos ou esclarecer dúvidas sobre privacidade, contacte-nos
          em{" "}
          <a
            href="mailto:privacidade@edukamba.ao"
            className="font-medium text-pastel-blue-foreground hover:underline"
          >
            privacidade@edukamba.ao
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  );
};

export default Privacidade;