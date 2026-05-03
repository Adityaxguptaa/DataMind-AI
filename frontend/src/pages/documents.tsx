import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SpeechButton } from "@/components/SpeechButton";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { ProcessingChain } from "@/components/ProcessingChain";
import {
  UploadCloud, FileText, Send, Loader2, BookOpen, ChevronRight, CheckCircle2,
  Clock, Sparkles, Brain, Target, Trophy, RotateCcw, Trash2, MessageSquare,
  FileSearch, ListChecks, AlertCircle, XCircle
} from "lucide-react";

type TabType = "chat" | "summary" | "mcq";

function DocItem({ doc, selected, onClick, onDelete }: any) {
  return (
    <div className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-2.5 group relative ${
      selected ? "border-indigo-500/40 bg-indigo-500/10" : "border-white/5 hover:border-white/12 hover:bg-white/3"
    }`}>
      <button className="flex-1 flex items-start gap-2.5 text-left" onClick={onClick}>
        <FileText className={`h-4 w-4 mt-0.5 flex-shrink-0 ${selected ? "text-indigo-400" : "text-muted-foreground"}`} />
        <div className="overflow-hidden flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{doc.filename}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="h-2.5 w-2.5" />{new Date(doc.uploaded_at).toLocaleDateString()}
          </p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full mt-1 inline-flex items-center gap-1 ${
            doc.status === "ready" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
          }`}>
            {doc.status === "ready" ? <><CheckCircle2 className="h-2.5 w-2.5" />ready</> : doc.status}
          </span>
        </div>
        {selected && <ChevronRight className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />}
      </button>
      <button onClick={e => { e.stopPropagation(); onDelete(doc.id); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TabBtn({ id, label, icon: Icon, active, onClick }: any) {
  return (
    <button onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active ? "bg-indigo-600 text-white shadow-[0_0_16px_rgba(99,102,241,0.25)]" : "text-muted-foreground hover:text-white hover:bg-white/5"
      }`}>
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  );
}

export default function Documents() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<TabType>("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Summary state
  const [summary, setSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryApproved, setSummaryApproved] = useState(false);

  // MCQ state
  const [mcqData, setMcqData] = useState<any>(null);
  const [mcqLoading, setMcqLoading] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [testDone, setTestDone] = useState(false);

  useEffect(() => { fetchDocuments(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (selectedDoc) {
      setMessages([{ role: "assistant", content: "Document loaded. Ask me anything about it — I'll use the exact text to answer." }]);
      setConversationId(null);
      setSummary(null); setSummaryApproved(false);
      setMcqData(null); setTestStarted(false); setTestDone(false); setCurrentQ(0); setAnswers({});
    }
  }, [selectedDoc]);

  const fetchDocuments = async () => {
    try { const d = await api.get<any[]>("/documents"); setDocuments(d || []); } catch {}
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post<any>("/documents/upload", fd);
      pollDocStatus(res.document_id);
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
      setUploading(false);
    }
  };

  const pollDocStatus = (id: string) => {
    const iv = setInterval(async () => {
      try {
        const res = await api.get<any>(`/documents/${id}/status`);
        if (res.status === "ready" || res.status === "failed") {
          clearInterval(iv); setUploading(false); fetchDocuments();
          if (res.status === "ready") {
            setSelectedDoc(id);
            toast({ title: "Ready!", description: "Document indexed. Chat, Summary & MCQ are available." });
          } else {
            toast({ title: "Indexing Failed", variant: "destructive" });
          }
        }
      } catch { clearInterval(iv); setUploading(false); }
    }, 2000);
  };

  const handleDelete = async (docId: string) => {
    try {
      await api.delete(`/documents/${docId}`);
      if (selectedDoc === docId) setSelectedDoc(null);
      fetchDocuments();
      toast({ title: "Document deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedDoc || loading) return;
    const userMsg = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setLoading(true);
    try {
      const payload: any = { message: userMsg.content };
      if (conversationId) payload.conversation_id = conversationId;
      const res = await api.post<any>(`/documents/${selectedDoc}/chat`, payload);
      if (res.conversation_id && !conversationId) setConversationId(res.conversation_id);
      setMessages(prev => [...prev, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleGenerateSummary = async () => {
    if (!selectedDoc) return;
    setSummaryLoading(true); setSummary(null); setSummaryApproved(false);
    try {
      const res = await api.post<any>(`/documents/${selectedDoc}/generate-summary`, {});
      setSummary(res);
    } catch (e: any) {
      toast({ title: "Summary Failed", description: e.message, variant: "destructive" });
    } finally { setSummaryLoading(false); }
  };

  const handleRegenerateSummary = async () => {
    if (!selectedDoc) return;
    setSummaryLoading(true); setSummary(null);
    try {
      const res = await api.post<any>(`/documents/${selectedDoc}/regenerate-summary`, {});
      setSummary(res);
      toast({ title: "Summary regenerated!" });
    } catch (e: any) {
      toast({ title: "Regeneration failed", description: e.message, variant: "destructive" });
    } finally { setSummaryLoading(false); }
  };

  const handleGenerateMCQ = async () => {
    if (!selectedDoc) return;
    setMcqLoading(true); setMcqData(null); setTestStarted(false); setTestDone(false); setCurrentQ(0); setAnswers({});
    try {
      const res = await api.post<any>(`/documents/${selectedDoc}/generate-mcq`, {});
      setMcqData(res);
    } catch (e: any) {
      toast({ title: "MCQ Generation Failed", description: e.message, variant: "destructive" });
    } finally { setMcqLoading(false); }
  };

  const handleAnswer = (qId: number, opt: string) => {
    if (testDone) return;
    setAnswers(prev => ({ ...prev, [qId]: opt }));
  };

  const handleSubmitTest = () => {
    setTestDone(true);
  };

  const getScore = () => {
    if (!mcqData?.questions) return 0;
    return mcqData.questions.filter((q: any) => answers[q.id] === q.correct_answer).length;
  };

  const selectedDocObj = documents.find(d => d.id === selectedDoc);
  const questions = mcqData?.questions || [];
  const score = getScore();

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
          <BookOpen className="h-4 w-4 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Document Intelligence</h1>
          <p className="text-xs text-muted-foreground">Chat · Summary · MCQ Test · Processing Pipeline</p>
        </div>
      </div>

      <div className="flex-1 grid md:grid-cols-3 gap-4 overflow-hidden min-h-0">
        {/* Sidebar */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Upload */}
          <div className="glass-card rounded-2xl p-4 flex-shrink-0">
            {uploading ? (
              <div className="py-2">
                <ProcessingChain active={uploading} />
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all border-white/8 hover:border-indigo-500/30 hover:bg-indigo-500/5">
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.txt,.md,.docx" />
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-white">Upload Document</p>
                  <p className="text-xs text-muted-foreground">PDF · TXT · DOCX · MD</p>
                </div>
              </label>
            )}
          </div>

          {/* Document list */}
          <div className="glass-card rounded-2xl flex flex-col flex-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex-shrink-0">
              <h3 className="text-sm font-semibold text-white">Knowledge Base</h3>
              <p className="text-xs text-muted-foreground">{documents.length} document{documents.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No documents yet</p>
                </div>
              ) : documents.map(doc => (
                <DocItem key={doc.id} doc={doc} selected={selectedDoc === doc.id}
                  onClick={() => { if (doc.status === "ready") setSelectedDoc(doc.id); else toast({ title: "Not ready", description: `Status: ${doc.status}` }); }}
                  onDelete={handleDelete} />
              ))}
            </div>
          </div>
        </div>

        {/* Main panel */}
        <div className="md:col-span-2 glass-card rounded-2xl flex flex-col overflow-hidden">
          {/* Header + tabs */}
          <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-3 flex-shrink-0 flex-wrap gap-y-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{selectedDocObj?.filename || "Document Intelligence"}</p>
              {selectedDocObj && <p className="text-xs text-muted-foreground">{selectedDocObj.chunk_count ? `${selectedDocObj.chunk_count} chunks` : "RAG enabled"}</p>}
            </div>
            {selectedDoc && (
              <div className="flex gap-1 flex-wrap">
                <TabBtn id="chat" label="Chat" icon={MessageSquare} active={tab === "chat"} onClick={setTab} />
                <TabBtn id="summary" label="Summary" icon={FileSearch} active={tab === "summary"} onClick={setTab} />
                <TabBtn id="mcq" label="MCQ Test" icon={ListChecks} active={tab === "mcq"} onClick={setTab} />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* ── CHAT TAB ── */}
            {(!selectedDoc || tab === "chat") && (
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {!selectedDoc ? (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <FileText className="h-7 w-7 text-indigo-400/50" />
                      </div>
                      <div>
                        <p className="text-white font-semibold mb-1">Select a document</p>
                        <p className="text-sm text-muted-foreground">Upload or select a document from the left to start chatting</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          {msg.role === "assistant" && (
                            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5">
                              <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                            </div>
                          )}
                          <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            msg.role === "user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white/5 border border-white/8 text-foreground/90 rounded-bl-sm"
                          }`}>
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                            {msg.sources?.length > 0 && (
                              <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">Sources</p>
                                {msg.sources.map((c: any, j: number) => (
                                  <div key={j} className="text-[11px] opacity-70 flex items-center gap-1.5">
                                    <span className="bg-white/10 px-1.5 rounded font-mono">p.{c.page}</span>
                                    <span className="truncate">{(c.chunk_text || "").substring(0, 70)}...</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {loading && (
                        <div className="flex justify-start">
                          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center mr-2.5">
                            <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                          </div>
                          <div className="bg-white/5 border border-white/8 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                            <span className="text-sm text-muted-foreground">Searching document...</span>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>
                <form onSubmit={handleSend} className="p-4 border-t border-white/5 flex gap-2 flex-shrink-0">
                  <SpeechButton onTranscript={t => setInput(t)} />
                  <ImageUploadButton onExtracted={t => setInput(prev => (prev ? prev + " " : "") + "[Image context: " + t.slice(0, 200) + "]")} question="Describe what you see in this image and extract all visible text. Be thorough." />
                  <Input placeholder={selectedDoc ? "Ask anything about the document..." : "Select a document first"}
                    value={input} onChange={e => setInput(e.target.value)}
                    disabled={!selectedDoc || loading}
                    className="flex-1 bg-white/5 border-white/10 focus:border-indigo-500/50" />
                  <Button type="submit" disabled={!selectedDoc || !input.trim() || loading}
                    className="bg-indigo-600 hover:bg-indigo-500 border-0 px-4">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            )}

            {/* ── SUMMARY TAB ── */}
            {selectedDoc && tab === "summary" && (
              <div className="p-5 space-y-5">
                {!summary && !summaryLoading && (
                  <div className="flex flex-col items-center justify-center gap-6 py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Brain className="h-8 w-8 text-indigo-400/60" />
                    </div>
                    <div>
                      <p className="font-semibold text-white mb-1">Generate AI Summary</p>
                      <p className="text-sm text-muted-foreground max-w-sm">The AI will read the entire document and create a comprehensive summary with key points, topics, and insights. You can approve or regenerate it.</p>
                    </div>
                    <Button onClick={handleGenerateSummary} className="bg-indigo-600 hover:bg-indigo-500 border-0 px-6">
                      <Sparkles className="h-4 w-4 mr-2" />Generate Summary
                    </Button>
                  </div>
                )}

                {summaryLoading && (
                  <div className="flex flex-col items-center gap-4 py-12">
                    <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                    <p className="text-white font-medium">Reading document and generating summary...</p>
                    <p className="text-sm text-muted-foreground">This may take 15-30 seconds</p>
                  </div>
                )}

                {summary && !summaryLoading && (
                  <div className="space-y-4">
                    {/* Status */}
                    <div className={`flex items-center gap-3 p-3 rounded-xl border ${summaryApproved ? "border-emerald-500/30 bg-emerald-500/8" : "border-indigo-500/20 bg-indigo-500/5"}`}>
                      {summaryApproved ? (
                        <><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span className="text-sm text-emerald-400 font-medium">Summary approved</span></>
                      ) : (
                        <><Sparkles className="h-4 w-4 text-indigo-400" /><span className="text-sm text-indigo-400 font-medium">Review and approve this summary</span></>
                      )}
                    </div>

                    {/* Title + Meta */}
                    <div className="glass-card rounded-2xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <h2 className="text-lg font-bold text-white">{summary.title || selectedDocObj?.filename}</h2>
                        <div className="flex gap-2 flex-wrap">
                          {summary.document_type && <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">{summary.document_type}</span>}
                          {summary.reading_level && <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-white/8 text-muted-foreground border border-white/10">{summary.reading_level}</span>}
                        </div>
                      </div>
                      <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">{summary.summary}</p>
                    </div>

                    {/* Key Points */}
                    {summary.key_points?.length > 0 && (
                      <div className="glass-card rounded-2xl p-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Key Points</p>
                        <div className="space-y-2">
                          {summary.key_points.map((pt: string, i: number) => (
                            <div key={i} className="flex items-start gap-2.5 text-sm">
                              <div className="w-5 h-5 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-[10px] font-bold text-indigo-400">{i + 1}</span>
                              </div>
                              <span className="text-foreground/85">{pt}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Topics */}
                    {summary.topics?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-muted-foreground">Topics:</span>
                        {summary.topics.map((t: string, i: number) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-foreground/70">{t}</span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    {!summaryApproved && (
                      <div className="flex gap-3 pt-2">
                        <Button onClick={() => setSummaryApproved(true)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 border-0">
                          <CheckCircle2 className="h-4 w-4 mr-2" />Approve Summary
                        </Button>
                        <Button onClick={handleRegenerateSummary} variant="outline" className="flex-1 border-white/10 hover:bg-white/5">
                          <RotateCcw className="h-4 w-4 mr-2" />Regenerate
                        </Button>
                      </div>
                    )}
                    {summaryApproved && (
                      <Button onClick={() => { setSummary(null); setSummaryApproved(false); }} variant="outline" className="w-full border-white/10 hover:bg-white/5 text-muted-foreground">
                        <RotateCcw className="h-4 w-4 mr-2" />Generate New Summary
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── MCQ TAB ── */}
            {selectedDoc && tab === "mcq" && (
              <div className="p-5 space-y-5">
                {/* Generate screen */}
                {!mcqData && !mcqLoading && (
                  <div className="flex flex-col items-center justify-center gap-6 py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <ListChecks className="h-8 w-8 text-indigo-400/60" />
                    </div>
                    <div>
                      <p className="font-semibold text-white mb-1">MCQ Practice Test</p>
                      <p className="text-sm text-muted-foreground max-w-sm">Generate 10 multiple-choice questions based on your document. Test your understanding and get scored with detailed explanations.</p>
                    </div>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {[
                        { icon: Brain, label: "AI-Generated Questions" },
                        { icon: Target, label: "Difficulty Varied" },
                        { icon: Trophy, label: "Instant Scoring" },
                      ].map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-white/4 border border-white/8 text-muted-foreground">
                          <f.icon className="h-3.5 w-3.5 text-indigo-400" />{f.label}
                        </div>
                      ))}
                    </div>
                    <Button onClick={handleGenerateMCQ} className="bg-indigo-600 hover:bg-indigo-500 border-0 px-6">
                      <Sparkles className="h-4 w-4 mr-2" />Generate MCQ Test
                    </Button>
                  </div>
                )}

                {mcqLoading && (
                  <div className="flex flex-col items-center gap-4 py-12">
                    <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                    <p className="text-white font-medium">Generating 10 questions from your document...</p>
                    <p className="text-sm text-muted-foreground">AI is reading the content and creating diverse questions</p>
                  </div>
                )}

                {/* Test ready but not started */}
                {mcqData && !testStarted && !testDone && (
                  <div className="flex flex-col items-center gap-6 py-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white mb-1">Test Ready!</p>
                      <p className="text-sm text-muted-foreground">{questions.length} questions generated from <span className="text-white">{selectedDocObj?.filename}</span></p>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">10 Questions</span>
                      <span className="text-xs px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400">Mixed Difficulty</span>
                      <span className="text-xs px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">Instant Score</span>
                    </div>
                    <div className="flex gap-3">
                      <Button onClick={() => { setTestStarted(true); setCurrentQ(0); setAnswers({}); setTestDone(false); }}
                        className="bg-indigo-600 hover:bg-indigo-500 border-0 px-8">
                        <Target className="h-4 w-4 mr-2" />Start Test
                      </Button>
                      <Button onClick={handleGenerateMCQ} variant="outline" className="border-white/10 hover:bg-white/5">
                        <RotateCcw className="h-4 w-4 mr-2" />Regenerate
                      </Button>
                    </div>
                  </div>
                )}

                {/* Active test */}
                {mcqData && testStarted && !testDone && (
                  <div className="space-y-5">
                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>Question {currentQ + 1} of {questions.length}</span>
                        <span>{Object.keys(answers).length} answered</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
                      </div>
                    </div>

                    {/* Question */}
                    {(() => {
                      const q = questions[currentQ];
                      const answered = answers[q.id];
                      const diffColor = q.difficulty === "hard" ? "text-red-400 bg-red-500/10 border-red-500/20" : q.difficulty === "medium" ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                      return (
                        <div className="glass-card rounded-2xl p-5 space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-base font-semibold text-white leading-relaxed">{q.question}</p>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border flex-shrink-0 ${diffColor}`}>{q.difficulty}</span>
                          </div>
                          <div className="space-y-2.5">
                            {Object.entries(q.options).map(([opt, text]) => (
                              <button key={opt} onClick={() => handleAnswer(q.id, opt)}
                                className={`w-full text-left flex items-center gap-3 p-3.5 rounded-xl border transition-all text-sm ${
                                  answered === opt ? "border-indigo-500/50 bg-indigo-500/15 text-white" : "border-white/8 bg-white/3 text-foreground/80 hover:border-indigo-500/30 hover:bg-indigo-500/5"
                                }`}>
                                <span className={`w-6 h-6 rounded-lg border flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                                  answered === opt ? "bg-indigo-600 border-indigo-500 text-white" : "bg-white/5 border-white/15"
                                }`}>{opt}</span>
                                <span>{text as string}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-3 pt-2">
                            <Button onClick={() => setCurrentQ(q => Math.max(0, q - 1))} disabled={currentQ === 0}
                              variant="outline" className="flex-1 border-white/10 hover:bg-white/5">← Previous</Button>
                            {currentQ < questions.length - 1 ? (
                              <Button onClick={() => setCurrentQ(q => q + 1)} disabled={!answered}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-500 border-0">Next →</Button>
                            ) : (
                              <Button onClick={handleSubmitTest} disabled={Object.keys(answers).length < questions.length}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 border-0">
                                <Trophy className="h-4 w-4 mr-2" />Submit Test
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Question navigator */}
                    <div className="flex flex-wrap gap-1.5">
                      {questions.map((q: any, i: number) => (
                        <button key={q.id} onClick={() => setCurrentQ(i)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all border ${
                            i === currentQ ? "bg-indigo-600 border-indigo-500 text-white" :
                            answers[q.id] ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" :
                            "bg-white/4 border-white/10 text-muted-foreground"
                          }`}>{i + 1}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Results screen */}
                {mcqData && testDone && (
                  <div className="space-y-5">
                    {/* Score */}
                    <div className="glass-card rounded-2xl p-6 text-center space-y-3">
                      <div className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center border"
                        style={{ background: score >= 8 ? "rgba(52,211,153,0.1)" : score >= 5 ? "rgba(234,179,8,0.1)" : "rgba(239,68,68,0.1)", borderColor: score >= 8 ? "rgba(52,211,153,0.3)" : score >= 5 ? "rgba(234,179,8,0.3)" : "rgba(239,68,68,0.3)" }}>
                        <Trophy className={`h-10 w-10 ${score >= 8 ? "text-emerald-400" : score >= 5 ? "text-yellow-400" : "text-red-400"}`} />
                      </div>
                      <div>
                        <p className={`text-5xl font-bold ${score >= 8 ? "text-emerald-400" : score >= 5 ? "text-yellow-400" : "text-red-400"}`}>{score}/{questions.length}</p>
                        <p className="text-lg font-semibold text-white mt-1">{score >= 8 ? "Excellent!" : score >= 5 ? "Good job!" : "Keep studying!"}</p>
                        <p className="text-sm text-muted-foreground">{Math.round((score / questions.length) * 100)}% score</p>
                      </div>
                    </div>

                    {/* Review */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Question Review</p>
                      {questions.map((q: any, i: number) => {
                        const userAns = answers[q.id];
                        const correct = q.correct_answer;
                        const isRight = userAns === correct;
                        return (
                          <div key={q.id} className={`glass-card rounded-2xl p-4 border ${isRight ? "border-emerald-500/20" : "border-red-500/20"}`}>
                            <div className="flex items-start gap-2.5 mb-3">
                              {isRight ? <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />}
                              <p className="text-sm font-medium text-white">{i + 1}. {q.question}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 ml-6 mb-3">
                              {Object.entries(q.options).map(([opt, text]) => (
                                <div key={opt} className={`text-xs p-2 rounded-lg border flex items-center gap-1.5 ${
                                  opt === correct ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" :
                                  opt === userAns && !isRight ? "border-red-500/40 bg-red-500/10 text-red-300" :
                                  "border-white/6 text-muted-foreground/60"
                                }`}>
                                  <span className="font-bold">{opt}.</span>{text as string}
                                </div>
                              ))}
                            </div>
                            {q.explanation && (
                              <div className="ml-6 p-2.5 rounded-lg bg-white/4 border border-white/8 text-xs text-foreground/70">
                                <span className="text-indigo-400 font-semibold">Explanation: </span>{q.explanation}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-3">
                      <Button onClick={() => { setTestStarted(true); setTestDone(false); setCurrentQ(0); setAnswers({}); }}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 border-0">
                        <RotateCcw className="h-4 w-4 mr-2" />Retake Test
                      </Button>
                      <Button onClick={handleGenerateMCQ} variant="outline" className="flex-1 border-white/10 hover:bg-white/5">
                        <Sparkles className="h-4 w-4 mr-2" />New Questions
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
