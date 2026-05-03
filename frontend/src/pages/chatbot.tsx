import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SpeechButton } from "@/components/SpeechButton";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { Bot, Send, Loader2, Plus, Terminal, Search, Calculator, FileText, ChevronDown, ChevronRight, Sparkles, Zap } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const toolIcons: Record<string, any> = {
  web_search: Search,
  wikipedia: FileText,
  calculator: Calculator,
  url_summarizer: Terminal,
};

const toolColors: Record<string, string> = {
  web_search: "text-blue-400 bg-blue-500/10 border-blue-500/25",
  wikipedia: "text-indigo-400 bg-indigo-500/10 border-indigo-500/25",
  calculator: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  url_summarizer: "text-orange-400 bg-orange-500/10 border-orange-500/25",
};

function ToolBadge({ name, input, result }: any) {
  const Icon = toolIcons[name] || Terminal;
  const [open, setOpen] = useState(false);
  const cls = toolColors[name] || "text-violet-400 bg-violet-500/10 border-violet-500/25";
  return (
    <Collapsible open={open} onOpenChange={setOpen}
      className={`my-2 rounded-lg border text-xs font-mono overflow-hidden ${cls}`}>
      <CollapsibleTrigger className="flex items-center gap-2 p-2.5 w-full hover:bg-white/5 transition-colors">
        {open ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
        <Icon className="h-3 w-3 flex-shrink-0" />
        <span className="font-bold uppercase tracking-wider text-[10px]">{name.replace(/_/g, " ")}</span>
        <span className="text-white/40 truncate flex-1 text-left text-[10px]">
          {typeof input === "object" ? JSON.stringify(input) : String(input).slice(0, 60)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="p-3 border-t border-white/10 bg-black/20 text-white/60 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
        {result}
      </CollapsibleContent>
    </Collapsible>
  );
}

const SUGGESTED = [
  "What's the latest in AI research?",
  "Calculate 15% tip on $87.50",
  "Search: best practices for Python security",
  "Summarize https://en.wikipedia.org/wiki/Machine_learning",
];

export default function Chatbot() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchSessions(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchSessions = async () => {
    try {
      const data = await api.get<any[]>("/chat/sessions");
      setSessions(data || []);
      if (data?.length > 0 && !currentSession) {
        setCurrentSession(data[0].id);
        fetchMessages(data[0].id);
      }
    } catch {}
  };

  const fetchMessages = async (id: string) => {
    try { const d = await api.get<any[]>(`/chat/sessions/${id}/messages`); setMessages(d || []); } catch {}
  };

  const handleNewSession = async () => {
    try {
      const res = await api.post<any>("/chat/sessions", { title: "New Conversation" });
      const obj = { id: res.session_id, title: res.title };
      setSessions(prev => [obj, ...prev]);
      setCurrentSession(res.session_id);
      setMessages([]);
    } catch {}
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentSession || loading) return;
    const userMsg = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setLoading(true);
    try {
      const res = await api.post<any>(`/chat/sessions/${currentSession}/messages`, { message: userMsg.content });
      const toolCalls = (res.tool_calls || []).map((tc: any) => ({ name: tc.tool_name, input: tc.input, result: tc.output }));
      setMessages(prev => [...prev, { role: "assistant", content: res.response, tool_calls: toolCalls }]);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
          <Bot className="h-4 w-4 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Agentic AI Chatbot</h1>
          <p className="text-xs text-muted-foreground">Web search · Calculator · Wikipedia · URL summarizer · Voice input</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-violet-400 font-mono bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-full">
          <Sparkles className="h-3 w-3" /> AI Assistant
        </div>
      </div>

      <div className="flex-1 grid md:grid-cols-4 gap-4 overflow-hidden min-h-0">
        {/* Session sidebar */}
        <div className="glass-card rounded-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3.5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
            <h3 className="text-sm font-semibold text-white">Conversations</h3>
            <button onClick={handleNewSession}
              className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-violet-400 hover:bg-violet-500/25 transition-all">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">No conversations yet</p>
                <button onClick={handleNewSession} className="mt-2 text-xs text-violet-400 hover:text-violet-300">Start one</button>
              </div>
            ) : sessions.map(s => (
              <button key={s.id} onClick={() => { setCurrentSession(s.id); fetchMessages(s.id); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                  currentSession === s.id ? "bg-violet-500/15 border border-violet-500/25 text-white" : "text-muted-foreground hover:text-white hover:bg-white/5"
                }`}>
                <div className="flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                  <span className="truncate">{s.title}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="md:col-span-3 glass-card rounded-2xl flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {!currentSession ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Bot className="h-8 w-8 text-violet-400/50" />
                </div>
                <div>
                  <p className="font-semibold text-white mb-1">Start a conversation</p>
                  <p className="text-sm text-muted-foreground">Click + to create a new chat session</p>
                </div>
                <button onClick={handleNewSession} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" /> New Conversation
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Zap className="h-7 w-7 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">What can I help with?</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">I'm an agentic AI with real-time tools. I can search the web, do math, look up Wikipedia, and summarize URLs. You can also use the mic to speak.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 max-w-md w-full">
                  {SUGGESTED.map(s => (
                    <button key={s} onClick={() => setInput(s)}
                      className="text-left text-xs p-2.5 rounded-xl border border-white/8 bg-white/3 hover:bg-violet-500/10 hover:border-violet-500/25 text-muted-foreground hover:text-white transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5">
                        <Bot className="h-3.5 w-3.5 text-violet-400" />
                      </div>
                    )}
                    <div className={`max-w-[80%] ${msg.role === "user" ? "bg-violet-600 text-white rounded-2xl rounded-br-sm" : "bg-white/5 border border-white/8 rounded-2xl rounded-bl-sm"} px-4 py-3`}>
                      {msg.tool_calls?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] uppercase tracking-wider text-violet-400/70 font-semibold mb-1.5 flex items-center gap-1">
                            <Zap className="h-2.5 w-2.5" /> Tool calls
                          </p>
                          {msg.tool_calls.map((tool: any, j: number) => (
                            <ToolBadge key={j} name={tool.name} input={tool.input} result={tool.result} />
                          ))}
                        </div>
                      )}
                      <div className={`text-sm whitespace-pre-wrap leading-relaxed ${msg.tool_calls?.length > 0 ? "pt-2 border-t border-white/10" : ""} ${msg.role === "user" ? "text-white" : "text-foreground/90"}`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mr-2.5">
                      <Bot className="h-3.5 w-3.5 text-violet-400" />
                    </div>
                    <div className="bg-white/5 border border-white/8 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-3">
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                        ))}
                      </div>
                      <span className="text-sm text-violet-400 font-mono">Agent thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <form onSubmit={handleSend} className="p-4 border-t border-white/5 flex gap-2 flex-shrink-0">
            <SpeechButton onTranscript={t => setInput(t)} />
            <ImageUploadButton onExtracted={t => setInput(prev => (prev ? prev + " " : "") + "[Image shows: " + t.slice(0, 300) + "]")} question="Describe this image in detail and extract all text visible in it." />
            <Input
              placeholder={currentSession ? "Message the agent... (mic, image, or type)" : "Create a session first"}
              value={input} onChange={e => setInput(e.target.value)}
              disabled={!currentSession || loading}
              className="flex-1 bg-white/5 border-white/10 focus:border-violet-500/50" />
            <Button type="submit" disabled={!currentSession || !input.trim() || loading}
              className="bg-violet-600 hover:bg-violet-500 border-0 px-4">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
