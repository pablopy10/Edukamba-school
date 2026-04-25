const messages = [
  { name: "Dra. Lila Ramirez", time: "09:00", text: "Confira o relatório mensal de frequência antes do prazo de 30 de abril.", initials: "LR", color: "bg-pastel-pink text-pastel-pink-foreground" },
  { name: "Sra. Heather Morris", time: "10:15", text: "Não esqueça do treinamento da equipe sobre ferramentas digitais agendado para 5/05.", initials: "HM", color: "bg-pastel-lilac text-pastel-lilac-foreground", badge: 4 },
  { name: "Sr. Carl Jenkins", time: "14:00", text: "Reunião de revisão orçamentária para o próximo ano fiscal em 28 de abril.", initials: "CJ", color: "bg-pastel-blue text-pastel-blue-foreground" },
  { name: "Oficial Dan Brooks", time: "15:10", text: "Revise os protocolos de segurança atualizados em vigor a partir de 1º de maio.", initials: "DB", color: "bg-pastel-yellow text-pastel-yellow-foreground", badge: 2 },
  { name: "Sra. Tina Goldberg", time: "17:00", text: "Lembrete: atualização importante do sistema de TI em 8/05 das 13h às 16h.", initials: "TG", color: "bg-pastel-green text-pastel-green-foreground", badge: 6 },
];

export const MessagesCard = () => {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Mensagens</h3>
        <button className="text-xs font-semibold text-primary hover:underline">Ver todas</button>
      </div>
      <div className="flex flex-col gap-4">
        {messages.map((m) => (
          <div key={m.name} className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.color}`}>
              {m.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{m.name}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground">{m.time}</span>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{m.text}</p>
            </div>
            {m.badge && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-pastel-lilac px-1.5 text-[10px] font-bold text-pastel-lilac-foreground">
                {m.badge}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};