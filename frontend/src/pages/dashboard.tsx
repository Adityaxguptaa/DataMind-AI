import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { BarChart2, FileText, Bot, Cpu, Activity, ArrowRight, Sparkles, Zap, LineChart, Send, Loader2, Code2, Briefcase, Trash2, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Link } from "wouter";
import { SpeechButton } from "@/components/SpeechButton";

function StatCard({ label, value, icon: Icon, color, glowClass, loading }: any) {
  return (
    <div className={`glass-card rounded-2xl p-5 group hover:scale-[1.02] transition-all duration-300 ${glowClass}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.bg}`}>
          <Icon className={`h-5 w-5 ${color.text}`} />
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">All time</span>
      </div>
      <div className={`text-4xl font-bold mb-1 ${color.text} transition-all`}>
        {loading ? <span className="text-muted-foreground/40 text-2xl animate-pulse">—</span> : value}
      </div>
      <p className="text-sm text-muted-foreground font-medium">{label}</p>
      <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color.bar} animate-shimmer`} style={{ width: `${Math.min(100, (value || 0) * 15 + 20)}%` }} />
      </div>
    </div>
  );
}

function ModuleCard({ name, icon: Icon, href, color, desc, tag }: any) {
  return (
    <Link href={href}>
      <div className="glass-card rounded-2xl p-5 cursor-pointer group hover:scale-[1.03] transition-all duration-300 border-white/5 hover:border-white/10 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color.bg} group-hover:scale-110 transition-transform duration-300`}
            style={{ boxShadow: color.shadow }}>
            <Icon className={`h-5 w-5 ${color.text}`} />
          </div>
          {tag && <span className="text-[10px] font-mono bg-white/5 px-2 py-0.5 rounded-full text-muted-foreground border border-white/8">{tag}</span>}
        </div>
        <div>
          <p className="font-semibold text-white mb-0.5">{name}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${color.text} opacity-0 group-hover:opacity-100 transition-opacity mt-auto`}>
          Open <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

interface AgentMsg { role: "user" | "assistant"; content: string; data?: any; action?: any; }

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ analyses: 0, documents: 0, sessions: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
  const [agentMsgs, setAgentMsgs] = useState<AgentMsg[]>([
    { role: "assistant", content: "Hi! I'm your platform assistant. I can help you manage documents, check stats, or answer questions about your data. Try:\n• \"List my documents\"\n• \"How many analyses have I run?\"\n• \"Delete document [name]\"" }
  ]);
  const [agentLoading, setAgentLoading] = useState(false);
  const agentEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.allSettled([
      api.get<any[]>("/analyses"),
      api.get<any[]>("/documents"),
      api.get<any[]>("/chat/sessions"),
    ]).then(([analyses, documents, sessions]) => {
      setStats({
        analyses: analyses.status === "fulfilled" ? (analyses.value?.length ?? 0) : 0,
        documents: documents.status === "fulfilled" ? (documents.value?.length ?? 0) : 0,
        sessions: sessions.status === "fulfilled" ? (sessions.value?.length ?? 0) : 0,
      });
    }).finally(() => setLoadingStats(false));
  }, []);

  useEffect(() => { agentEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [agentMsgs]);

  const handleAgentSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentInput.trim() || agentLoading) return;
    const cmd = agentInput.trim();
    setAgentMsgs(prev => [...prev, { role: "user", content: cmd }]);
    setAgentInput(""); setAgentLoading(true);
    try {
      const res = await api.post<any>("/agent/command", { command: cmd });
      setAgentMsgs(prev => [...prev, {
        role: "assistant",
        content: res.message,
        data: res.data,
        action: res.action_taken,
      }]);
      if (res.action_taken?.type === "delete") {
        const newDocs = await api.get<any[]>("/documents").catch(() => null);
        if (newDocs !== null) setStats(s => ({ ...s, documents: newDocs.length }));
      }
    } catch (e: any) {
      setAgentMsgs(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process that command. Please try again." }]);
    } finally { setAgentLoading(false); }
  };

  const statCards = [
    { label: "Analyses Run", value: stats.analyses, icon: BarChart2, color: { text: "text-blue-400", bg: "bg-blue-500/12", bar: "bg-blue-500" }, glowClass: "hover:glow-blue" },
    { label: "Documents Indexed", value: stats.documents, icon: FileText, color: { text: "text-indigo-400", bg: "bg-indigo-500/12", bar: "bg-indigo-500" }, glowClass: "hover:glow-purple" },
    { label: "Chat Sessions", value: stats.sessions, icon: Bot, color: { text: "text-violet-400", bg: "bg-violet-500/12", bar: "bg-violet-500" }, glowClass: "hover:glow-purple" },
  ];

  const modules = [
    { name: "Data Analyst", icon: BarChart2, href: "/analyst", desc: "Upload CSV/Excel and run AI-powered analysis with smart charts", color: { text: "text-blue-400", bg: "bg-blue-500/12", shadow: "0 0 20px rgba(59,130,246,0.2)" }, tag: "Charts" },
    { name: "Document Chat", icon: FileText, href: "/documents", desc: "Index PDFs, chat with RAG, generate summaries and MCQ tests", color: { text: "text-indigo-400", bg: "bg-indigo-500/12", shadow: "0 0 20px rgba(99,102,241,0.2)" }, tag: "RAG + MCQ" },
    { name: "AI Chatbot", icon: Bot, href: "/chatbot", desc: "Agentic chatbot with web search, calculator and code tools", color: { text: "text-violet-400", bg: "bg-violet-500/12", shadow: "0 0 20px rgba(139,92,246,0.2)" }, tag: "Agentic" },
    { name: "HF Playground", icon: Cpu, href: "/playground", desc: "Run classification, NER, summarization and translation models", color: { text: "text-emerald-400", bg: "bg-emerald-500/12", shadow: "0 0 20px rgba(52,211,153,0.2)" }, tag: "Free" },
    { name: "Code Review", icon: Code2, href: "/code-review", desc: "Security scanning, vulnerability detection and auto-fix suggestions", color: { text: "text-orange-400", bg: "bg-orange-500/12", shadow: "0 0 20px rgba(249,115,22,0.2)" }, tag: "Security" },
    { name: "Resume Scanner", icon: Briefcase, href: "/resume", desc: "ATS score, JD matching, shortlisting probability and career tips", color: { text: "text-pink-400", bg: "bg-pink-500/12", shadow: "0 0 20px rgba(236,72,153,0.2)" }, tag: "Career" },
  ];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1 font-mono">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />{greeting}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            {user?.full_name || user?.username}
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">Your AI intelligence workspace is ready.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
          <Activity className="w-3.5 h-3.5 animate-pulse-glow" />All systems operational
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {statCards.map(s => <StatCard key={s.label} {...s} loading={loadingStats} />)}
      </div>

      {/* Agent Bot */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button onClick={() => setAgentOpen(!agentOpen)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/3 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
            <Bot className="h-4 w-4 text-violet-400" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-semibold text-white">Platform Assistant</p>
            <p className="text-xs text-muted-foreground">Ask me to manage documents, check stats, or perform actions</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400">Agent</span>
            <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${agentOpen ? "rotate-90" : ""}`} />
          </div>
        </button>
        {agentOpen && (
          <div className="border-t border-white/5">
            <div className="h-52 overflow-y-auto p-4 space-y-3">
              {agentMsgs.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                      <Bot className="h-3 w-3 text-violet-400" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.role === "user" ? "bg-violet-600 text-white" : "bg-white/5 border border-white/8 text-foreground/85"}`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.action?.type === "delete" && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
                        <Trash2 className="h-3 w-3" />Deleted: {msg.action.document}
                      </div>
                    )}
                    {msg.data && Array.isArray(msg.data) && msg.data.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {msg.data.slice(0, 5).map((d: any, j: number) => (
                          <div key={j} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3" />{d.filename}
                            <span className={`ml-auto ${d.status === "ready" ? "text-emerald-400" : "text-yellow-400"}`}>{d.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {agentLoading && (
                <div className="flex justify-start">
                  <div className="w-6 h-6 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mr-2">
                    <Bot className="h-3 w-3 text-violet-400" />
                  </div>
                  <div className="bg-white/5 border border-white/8 rounded-xl px-3 py-2 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
                    <span className="text-xs text-muted-foreground">Processing...</span>
                  </div>
                </div>
              )}
              <div ref={agentEndRef} />
            </div>
            <form onSubmit={handleAgentSend} className="flex gap-2 p-3 border-t border-white/5">
              <SpeechButton onTranscript={t => setAgentInput(t)} />
              <input value={agentInput} onChange={e => setAgentInput(e.target.value)}
                placeholder='Try: "list my documents" or "how many analyses?"'
                disabled={agentLoading}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/40 placeholder:text-muted-foreground/50" />
              <button type="submit" disabled={!agentInput.trim() || agentLoading}
                className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition-all disabled:opacity-40">
                <Send className="h-4 w-4 text-white" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-blue-400" />
          <h2 className="font-semibold text-white text-sm">Quick Start</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Upload & Analyze CSV", href: "/analyst", color: "text-blue-400 border-blue-500/20 hover:bg-blue-500/10" },
            { label: "Chat with a PDF", href: "/documents", color: "text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/10" },
            { label: "Generate MCQ Test", href: "/documents", color: "text-violet-400 border-violet-500/20 hover:bg-violet-500/10" },
            { label: "Review My Code", href: "/code-review", color: "text-orange-400 border-orange-500/20 hover:bg-orange-500/10" },
            { label: "Scan My Resume", href: "/resume", color: "text-pink-400 border-pink-500/20 hover:bg-pink-500/10" },
            { label: "Run HF Model", href: "/playground", color: "text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10" },
          ].map((q, i) => (
            <Link key={i} href={q.href}>
              <button className={`text-xs font-medium px-3 py-1.5 rounded-lg border bg-white/3 transition-all ${q.color} flex items-center gap-1.5`}>
                <ArrowRight className="h-3 w-3" />{q.label}
              </button>
            </Link>
          ))}
        </div>
      </div>

      {/* Modules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <LineChart className="h-5 w-5 text-blue-400" /> AI Modules
          </h2>
          <span className="text-xs text-muted-foreground font-mono">6 active modules</span>
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(m => <ModuleCard key={m.name} {...m} />)}
        </div>
      </div>
    </div>
  );
}
