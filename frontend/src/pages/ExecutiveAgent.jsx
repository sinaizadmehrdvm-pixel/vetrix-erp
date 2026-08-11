import { useEffect, useRef, useState } from "react";
import { MessagesSquare, Send, RotateCcw, ChevronDown, ChevronUp, Info, AlertTriangle, Ban, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import {
  askExecutiveAgent, listExecutiveAgentConversations, getExecutiveAgentConversation,
  resetExecutiveAgentConversation, getExecutiveAgentSuggestions, getExecutiveAgentStatus,
} from "../services/api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

const STATUS_TONE = {
  ok: "success",
  needs_clarification: "info",
  confirmation_required: "warning",
  permission_denied: "danger",
  category_blocked: "danger",
  error: "danger",
  disabled: "danger",
};

export default function ExecutiveAgent() {
  const { language, dir, n, date } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState({});
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [expandedEvidence, setExpandedEvidence] = useState({});
  const threadEndRef = useRef(null);

  async function loadSuggestions() {
    try {
      setSuggestions(await getExecutiveAgentSuggestions(language));
    } catch {
      setSuggestions({});
    }
  }

  async function loadStatus() {
    try {
      setStatus(await getExecutiveAgentStatus());
    } catch {
      setStatus(null);
    }
  }

  async function loadHistory() {
    try {
      const data = await listExecutiveAgentConversations();
      setHistory(data.items || []);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSuggestions();
      void loadStatus();
      void loadHistory();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function openConversation(id) {
    try {
      const data = await getExecutiveAgentConversation(id);
      setConversationId(id);
      setMessages(data.messages.map((m) => ({
        role: m.role, text: m.text, status: m.role === "agent" ? "ok" : undefined,
        evidence: m.evidence, createdAt: m.created_at,
      })));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
  }

  async function resetCurrentConversation() {
    if (!conversationId) {
      startNewConversation();
      return;
    }
    try {
      await resetExecutiveAgentConversation(conversationId);
      startNewConversation();
      await loadHistory();
      toast.success(tr("گفتگو بازنشانی شد.", "تم إعادة تعيين المحادثة.", "Görüşme sıfırlandı.", "Conversation reset."));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function sendQuestion(text) {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setSending(true);
    try {
      const result = await askExecutiveAgent(question, conversationId, language);
      setConversationId(result.conversation_id);
      setMessages((prev) => [...prev, {
        role: "agent", text: result.text, status: result.status,
        evidence: result.evidence, data: result.data, period: result.period,
        changeRequestId: result.change_request_id,
      }]);
      await loadHistory();
    } catch (err) {
      setMessages((prev) => [...prev, { role: "agent", text: err.message || tr("خطایی رخ داد.", "حدث خطأ.", "Bir hata oluştu.", "Something went wrong."), status: "error" }]);
    } finally {
      setSending(false);
    }
  }

  function toggleEvidence(index) {
    setExpandedEvidence((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  const statusPill = (label, configured) => (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
      style={{
        background: configured ? "var(--erp-success-soft)" : "var(--erp-panel-solid)",
        color: configured ? "var(--erp-success)" : "var(--erp-muted)",
        border: "1px solid var(--erp-border)",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: configured ? "currentColor" : "var(--erp-muted)" }} />
      {label}: {configured ? tr("فعال", "مفعّل", "Aktif", "On") : tr("غیرفعال", "غير مفعّل", "Kapalı", "Off")}
    </span>
  );

  return (
    <div className="flex flex-col gap-4 h-full" dir={dir}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center shrink-0"
            style={{ width: 40, height: 40, borderRadius: "var(--erp-radius-sm)", background: "var(--erp-glow)", color: "var(--erp-accent)" }}
          >
            <MessagesSquare size={20} />
          </span>
          <div>
            <h1 className="text-lg font-black text-[var(--erp-text)]">
              {tr("دستیار مدیریتی", "المساعد التنفيذي", "Yönetici Asistanı", "Executive Agent")}
            </h1>
            <p className="text-sm text-[var(--erp-muted)]">
              {tr("سوال کسب‌وکاری خود را بپرسید؛ پاسخ‌ها همیشه بر پایه داده واقعی است.", "اطرح سؤالك التجاري؛ الإجابات دائمًا مبنية على بيانات حقيقية.", "İş sorunuzu sorun; yanıtlar her zaman gerçek verilere dayanır.", "Ask a business question; answers are always grounded in real data.")}
            </p>
          </div>
        </div>
        {status ? (
          <div className="flex flex-wrap items-center gap-2">
            {statusPill(tr("گفتار به متن", "الصوت إلى نص", "Ses-metin", "STT"), status.stt?.configured)}
            {statusPill(tr("متن به گفتار", "نص إلى صوت", "Metin-ses", "TTS"), status.tts?.configured)}
            {statusPill(tr("هوش مصنوعی زبانی", "الذكاء اللغوي", "Dil yapay zekası", "LLM"), status.llm?.configured)}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[260px_1fr]">
        <div className="flex flex-col gap-4">
          <Card title={tr("گفتگوها", "المحادثات", "Görüşmeler", "Conversations")} padding={false}>
            <div className="p-3">
              <Button variant="secondary" size="sm" className="w-full" icon={RotateCcw} onClick={startNewConversation}>
                {tr("گفتگوی جدید", "محادثة جديدة", "Yeni görüşme", "New conversation")}
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {history.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-[var(--erp-muted)]">{tr("گفتگویی وجود ندارد.", "لا توجد محادثات.", "Görüşme yok.", "No conversations yet.")}</p>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openConversation(item.id)}
                    className={`w-full text-start px-4 py-2.5 text-sm border-t border-[var(--erp-border)] hover:bg-[var(--erp-glow)] ${conversationId === item.id ? "bg-[var(--erp-glow)] text-[var(--erp-accent)] font-bold" : "text-[var(--erp-text)]"}`}
                  >
                    {date ? date(item.updated_at) : item.updated_at}
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card title={tr("پیشنهادها", "اقتراحات", "Öneriler", "Suggestions")} padding>
            <div className="flex flex-col gap-3">
              {Object.entries(suggestions).map(([group, items]) => (
                <div key={group}>
                  <div className="flex flex-wrap gap-1.5">
                    {(items || []).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendQuestion(q)}
                        className="text-xs rounded-full px-2.5 py-1.5 border border-[var(--erp-border)] bg-[var(--erp-panel-solid)] hover:border-[var(--erp-accent)] hover:text-[var(--erp-accent)]"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div
          className="erp-surface flex flex-col h-[620px]"
          style={{ borderRadius: "var(--erp-radius-lg)", boxShadow: "var(--erp-shadow)", overflow: "hidden" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--erp-border)] shrink-0">
            <span className="text-sm text-[var(--erp-muted)]">
              {tr("همه پاسخ‌ها بر اساس سطح دسترسی و شرکت فعال شما محدود می‌شوند.", "تقتصر جميع الإجابات على صلاحياتك وشركتك الحالية.", "Tüm yanıtlar yetkinize ve aktif şirketinize göre sınırlıdır.", "All answers are scoped to your role and active company.")}
            </span>
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={resetCurrentConversation}>
              {tr("بازنشانی", "إعادة تعيين", "Sıfırla", "Reset")}
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-[var(--erp-muted)]">
                <Sparkles size={28} />
                <p className="text-sm">{tr("یک سوال کسب‌وکاری بپرسید یا از پیشنهادها انتخاب کنید.", "اطرح سؤالاً تجارياً أو اختر من الاقتراحات.", "Bir iş sorusu sorun veya önerilerden seçin.", "Ask a business question or pick a suggestion.")}</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <MessageBubble
                  key={index}
                  message={message}
                  tr={tr}
                  n={n}
                  expanded={Boolean(expandedEvidence[index])}
                  onToggleEvidence={() => toggleEvidence(index)}
                />
              ))
            )}
            <div ref={threadEndRef} />
          </div>

          <form
            className="flex items-center gap-2 p-3 border-t border-[var(--erp-border)] shrink-0"
            onSubmit={(event) => { event.preventDefault(); sendQuestion(); }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={tr("سوال خود را بنویسید...", "اكتب سؤالك...", "Sorunuzu yazın...", "Type your question...")}
              className="flex-1 p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <Button type="submit" icon={Send} loading={sending} disabled={!input.trim()}>
              {tr("ارسال", "إرسال", "Gönder", "Send")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, tr, n, expanded, onToggleEvidence }) {
  const isUser = message.role === "user";
  const tone = STATUS_TONE[message.status] || "default";
  const toneIcon = tone === "danger" ? Ban : tone === "warning" ? AlertTriangle : tone === "info" ? Info : null;
  const ToneIcon = toneIcon;

  const bubbleStyle = isUser
    ? { background: "var(--erp-accent)", color: "#04121b" }
    : {
        background: tone === "danger" ? "var(--erp-danger-soft)" : "var(--erp-panel-solid)",
        color: tone === "danger" ? "var(--erp-danger)" : "var(--erp-text)",
        border: "1px solid var(--erp-border)",
      };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%] flex flex-col gap-1.5" style={{ alignItems: isUser ? "flex-end" : "flex-start" }}>
        <div className="rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap" style={{ ...bubbleStyle, borderRadius: "var(--erp-radius-lg)" }}>
          {ToneIcon ? <ToneIcon size={14} className="inline-block me-1.5 -mt-0.5" /> : null}
          {message.text}
        </div>

        {message.changeRequestId ? (
          <a
            href="/change-requests"
            className="text-xs font-bold text-[var(--erp-accent)] hover:underline"
          >
            {tr("مشاهده در مرکز درخواست‌های تغییر", "عرض في مركز طلبات التغيير", "Değişiklik İsteği Merkezi'nde görüntüle", "View in Change Request Center")} →
          </a>
        ) : null}

        {message.evidence ? (
          <div className="w-full">
            <button
              type="button"
              onClick={onToggleEvidence}
              className="flex items-center gap-1 text-xs text-[var(--erp-muted)] hover:text-[var(--erp-accent)]"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {tr("جزئیات و منبع", "التفاصيل والمصدر", "Ayrıntılar ve kaynak", "Details & source")}
            </button>
            {expanded ? (
              <div className="mt-1.5 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-3 text-xs space-y-1">
                <EvidenceRow label={tr("ابزار", "الأداة", "Araç", "Tool")} value={message.evidence.tool} />
                <EvidenceRow label={tr("بازه زمانی", "الفترة الزمنية", "Zaman aralığı", "Period")} value={message.evidence.period} />
                <EvidenceRow label={tr("منبع", "المصدر", "Kaynak", "Source module")} value={message.evidence.source_module} />
                <EvidenceRow label={tr("زمان تولید", "وقت الإنشاء", "Oluşturulma zamanı", "Generated at")} value={message.evidence.generated_at} />
                {message.data && typeof message.data === "object" ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1.5 border-t border-[var(--erp-border)]">
                    {Object.entries(message.data)
                      .filter(([key, value]) => key !== "source_module" && (typeof value === "number" || typeof value === "string") && value !== "")
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <span className="text-[var(--erp-muted)]">{key}</span>
                          <span className="font-bold">{typeof value === "number" ? n(value) : String(value)}</span>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EvidenceRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[var(--erp-muted)]">{label}</span>
      <span className="font-bold">{String(value)}</span>
    </div>
  );
}
