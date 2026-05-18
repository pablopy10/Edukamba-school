import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const palette = [
  "bg-pastel-pink text-pastel-pink-foreground",
  "bg-pastel-lilac text-pastel-lilac-foreground",
  "bg-pastel-blue text-pastel-blue-foreground",
  "bg-pastel-yellow text-pastel-yellow-foreground",
  "bg-pastel-green text-pastel-green-foreground",
];

interface MessagesCardProps {
  messages: { id: string; name: string; initials: string; text: string; time: string; unread: boolean; contactId: string | null }[];
}

export const MessagesCard = ({ messages }: MessagesCardProps) => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const openChat = (contactId: string | null) => {
    if (contactId) navigate(`/chat?to=${contactId}`);
    else navigate("/chat");
  };
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{t("dashboard.messages.title")}</h3>
        <button
          type="button"
          onClick={() => navigate("/chat")}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {t("dashboard.messages.view_all")}
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {messages.length === 0 && (
          <p className="rounded-xl bg-muted/50 p-4 text-center text-xs text-muted-foreground">
            {t("dashboard.messages.empty")}
          </p>
        )}
        {messages.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => openChat(m.contactId)}
            className="flex items-start gap-3 rounded-xl p-1 -m-1 text-left transition-colors hover:bg-muted/60"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${palette[i % palette.length]}`}>
              {m.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{m.name}</p>
                <span className="shrink-0 text-[11px] text-muted-foreground">{m.time}</span>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{m.text}</p>
            </div>
            {m.unread && (
              <span className="ml-1 mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={t("dashboard.messages.unread_aria")} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
