import { LegalLayout } from "@/components/LegalLayout";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

const Termos = () => {
  return (
    <LegalLayout title="Termos & Condições" updatedAt="25 de Abril de 2026">
      <p className="text-base text-muted-foreground">
        Bem-vindo ao Edukamba. Estes Termos & Condições regulam o acesso e a utilização da
        plataforma de gestão escolar Edukamba ("plataforma", "serviço"). Ao usar o serviço,
        concorda em cumprir estes termos.
      </p>

      <Section title="1. Aceitação dos termos">
        <p>
          Ao criar uma conta ou utilizar a plataforma, declara ter lido, compreendido e aceite
          estes Termos & Condições. Se não concordar com qualquer parte, não deverá utilizar o
          serviço.
        </p>
      </Section>

      <Section title="2. Conta de utilizador">
        <p>
          O acesso ao Edukamba é feito por convite. As credenciais são pessoais e
          intransmissíveis. É responsável por manter a confidencialidade da sua password e por
          todas as actividades que ocorram na sua conta.
        </p>
      </Section>

      <Section title="3. Utilização aceitável">
        <p>Concorda em não utilizar a plataforma para:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Aceder a dados de outros utilizadores sem autorização;</li>
          <li>Carregar conteúdo ilegal, ofensivo ou que viole direitos de terceiros;</li>
          <li>Interferir com o funcionamento normal do serviço;</li>
          <li>Tentar contornar os mecanismos de segurança da plataforma.</li>
        </ul>
      </Section>

      <Section title="4. Subscrição e pagamentos">
        <p>
          O Edukamba opera por subscrição mensal por aluno activo. Os preços actuais estão
          publicados na página inicial. As facturas são emitidas mensalmente e o pagamento é
          devido na data indicada.
        </p>
      </Section>

      <Section title="5. Propriedade intelectual">
        <p>
          Todo o software, design, marca e conteúdo da plataforma são propriedade do Edukamba
          ou licenciados ao Edukamba. Os dados introduzidos pela escola permanecem propriedade
          da escola.
        </p>
      </Section>

      <Section title="6. Limitação de responsabilidade">
        <p>
          O serviço é fornecido "como está". O Edukamba envida os melhores esforços para
          assegurar a disponibilidade e segurança da plataforma, mas não garante operação
          ininterrupta nem livre de erros.
        </p>
      </Section>

      <Section title="7. Cancelamento">
        <p>
          Pode cancelar a subscrição a qualquer momento. Após o cancelamento, os dados ficarão
          disponíveis para exportação durante 30 dias e serão posteriormente eliminados.
        </p>
      </Section>

      <Section title="8. Alterações aos termos">
        <p>
          Podemos actualizar estes termos periodicamente. Alterações significativas serão
          comunicadas por email com pelo menos 30 dias de antecedência.
        </p>
      </Section>

      <Section title="9. Contacto">
        <p>
          Para questões relacionadas com estes termos, contacte-nos através de{" "}
          <a
            href="mailto:contacto@edukamba.ao"
            className="font-medium text-pastel-blue-foreground hover:underline"
          >
            contacto@edukamba.ao
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  );
};

export default Termos;