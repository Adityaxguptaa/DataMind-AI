import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { SpeechButton } from "@/components/SpeechButton";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import {
  Code2, Shield, Lightbulb, AlertTriangle, CheckCircle2, Loader2,
  ChevronDown, ChevronRight, Copy, Sparkles, Zap, Brain, Clock,
  TestTube, BookOpen, GitCompare, BarChart3, ImageIcon
} from "lucide-react";

const LANGUAGES = ["python", "javascript", "typescript", "java", "c", "c++", "go", "rust", "php", "ruby", "swift", "kotlin", "sql", "bash", "other"];
const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  info: "text-gray-400 bg-gray-500/10 border-gray-500/30",
};

type AnalysisTab = "overview" | "security" | "quality" | "complexity" | "tests" | "explanation" | "improved";

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 32; const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-[72px] h-[72px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={circ - (score / 10) * circ} strokeLinecap="round"
            className={`transition-all duration-1000 ${color}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-base font-bold ${color}`}>{score}</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}

function CollapsibleCard({ title, count, color, defaultOpen = true, children }: any) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/3 transition-colors">
        <div className="flex items-center gap-2.5">
          <span className={`text-sm font-semibold ${color}`}>{title}</span>
          {count !== undefined && <span className="text-xs font-mono bg-white/8 px-2 py-0.5 rounded-full text-muted-foreground">{count}</span>}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function TabButton({ id, label, icon: Icon, active, onClick, count }: any) {
  return (
    <button onClick={() => onClick(id)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
      active ? "bg-orange-600/20 border border-orange-500/40 text-orange-300" : "text-muted-foreground hover:text-white hover:bg-white/5"
    }`}>
      <Icon className="h-3.5 w-3.5" />{label}
      {count !== undefined && <span className="bg-white/10 text-muted-foreground px-1.5 rounded-full text-[10px]">{count}</span>}
    </button>
  );
}

export default function CodeReview() {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");
  const [result, setResult] = useState<any>(null);
  const [complexity, setComplexity] = useState<any>(null);
  const [tests, setTests] = useState<any>(null);
  const [explanation, setExplanation] = useState<any>(null);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const [extractedFromImage, setExtractedFromImage] = useState(false);

  const handleAnalyze = async () => {
    if (!code.trim()) return;
    setLoading(true); setResult(null); setComplexity(null); setTests(null); setExplanation(null); setActiveTab("overview");
    try {
      const res = await api.post<any>("/codereview/analyze", { code, language });
      setResult(res);
    } catch (e: any) {
      toast({ title: "Analysis Failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const loadComplexity = async () => {
    if (complexity || !code.trim()) return;
    setTabLoading(p => ({ ...p, complexity: true }));
    try { const res = await api.post<any>("/codereview/complexity", { code, language }); setComplexity(res); }
    catch (e: any) { toast({ title: "Complexity analysis failed", description: e.message, variant: "destructive" }); }
    finally { setTabLoading(p => ({ ...p, complexity: false })); }
  };

  const loadTests = async () => {
    if (tests || !code.trim()) return;
    setTabLoading(p => ({ ...p, tests: true }));
    try { const res = await api.post<any>("/codereview/generate-tests", { code, language }); setTests(res); }
    catch (e: any) { toast({ title: "Test generation failed", description: e.message, variant: "destructive" }); }
    finally { setTabLoading(p => ({ ...p, tests: false })); }
  };

  const loadExplanation = async () => {
    if (explanation || !code.trim()) return;
    setTabLoading(p => ({ ...p, explanation: true }));
    try { const res = await api.post<any>("/codereview/explain", { code, language }); setExplanation(res); }
    catch (e: any) { toast({ title: "Explanation failed", description: e.message, variant: "destructive" }); }
    finally { setTabLoading(p => ({ ...p, explanation: false })); }
  };

  const switchTab = (tab: AnalysisTab) => {
    setActiveTab(tab);
    if (tab === "complexity") loadComplexity();
    if (tab === "tests") loadTests();
    if (tab === "explanation") loadExplanation();
  };

  const copyCode = (text: string) => { navigator.clipboard.writeText(text); toast({ title: "Copied!" }); };

  const handleImageCode = (text: string) => {
    setCode(text);
    setExtractedFromImage(true);
    toast({ title: "Code extracted from image!", description: "Ready to analyze." });
  };

  const qualScore = (s: number) => s >= 8 ? "text-emerald-400" : s >= 5 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
          <Code2 className="h-4 w-4 text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Code Review & Security Scanner</h1>
          <p className="text-xs text-muted-foreground">Vulnerability detection · Complexity analysis · Test generation · Explanation · Auto-fix · Image OCR</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Input panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-white">Code Input</label>
              <div className="flex items-center gap-2">
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="text-xs bg-white/5 border border-white/10 text-muted-foreground rounded-lg px-2 py-1 focus:outline-none focus:border-orange-500/50">
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {extractedFromImage && (
              <div className="flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
                <ImageIcon className="h-3.5 w-3.5" />Code extracted from image — ready to analyze!
              </div>
            )}

            <div className="relative">
              <textarea value={code} onChange={e => { setCode(e.target.value); setExtractedFromImage(false); }}
                rows={18}
                placeholder={`# Paste or type ${language} code here...\n# Or upload a code screenshot below\n\n# Features:\n# • Security vulnerability scan\n# • Complexity analysis (O notation)\n# • Unit test generation\n# • Code explanation\n# • Auto-fix with diff\n# • Plagiarism risk score`}
                className="w-full bg-black/30 border border-white/8 rounded-xl px-4 py-3 text-sm text-white font-mono resize-none focus:outline-none focus:border-orange-500/40 placeholder:text-muted-foreground/40 leading-relaxed" />
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <SpeechButton onTranscript={t => setCode(prev => prev + (prev ? "\n" : "") + t)} />
              </div>
            </div>

            {/* Image upload */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/3 border border-white/6">
              <ImageUploadButton
                onExtracted={handleImageCode}
                question="Extract ALL code from this image exactly as written. Preserve ALL indentation, spacing, brackets, and formatting. Return ONLY the raw code."
                className="flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white">Upload Code Screenshot</p>
                <p className="text-[10px] text-muted-foreground">OCR extracts code from any image, photo or whiteboard</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAnalyze} disabled={!code.trim() || loading}
                className="flex-1 bg-orange-600 hover:bg-orange-500 border-0 font-semibold">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing...</> : <><Sparkles className="h-4 w-4 mr-2" />Full Analysis</>}
              </Button>
              <button onClick={() => { setCode(""); setResult(null); setComplexity(null); setTests(null); setExplanation(null); setExtractedFromImage(false); }}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-white transition-all">Clear</button>
            </div>
          </div>

          {/* Quick examples */}
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Examples to Try</p>
            <div className="space-y-1.5">
              {[
                { label: "SQL Injection", code: `def get_user(username):\n    query = f"SELECT * FROM users WHERE name = '{username}'"\n    return db.execute(query)` },
                { label: "Race Condition", code: `import threading\nbalance = 1000\ndef withdraw(amount):\n    global balance\n    if balance >= amount:\n        balance -= amount\n        return amount\n    return 0` },
                { label: "O(n²) Bubble Sort", code: `def bubble_sort(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]\n    return arr` },
              ].map(t => (
                <button key={t.label} onClick={() => { setCode(t.code); setLanguage("python"); }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs border border-white/6 hover:border-orange-500/25 hover:bg-orange-500/5 text-muted-foreground hover:text-white transition-all">
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results panel */}
        <div className="lg:col-span-3 space-y-4">
          {loading && (
            <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Loader2 className="h-7 w-7 text-orange-400 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold">Deep analysis in progress...</p>
                <p className="text-sm text-muted-foreground mt-1">Security scan · Quality metrics · Vulnerability detection · Auto-fix generation</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {["Security Scan", "Code Quality", "Plagiarism Risk", "Auto-Fix"].map((s, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground animate-pulse" style={{ animationDelay: `${i * 200}ms` }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="glass-card rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/8 border border-orange-500/15 flex items-center justify-center">
                <Shield className="h-8 w-8 text-orange-400/40" />
              </div>
              <div>
                <p className="font-semibold text-white">Paste code or upload an image</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">Get security analysis, complexity, generated tests, code explanation, and an auto-fixed version</p>
              </div>
            </div>
          )}

          {result && (
            <>
              {/* Tab bar */}
              <div className="flex gap-1.5 flex-wrap p-1 bg-white/3 rounded-2xl border border-white/6">
                <TabButton id="overview" label="Overview" icon={BarChart3} active={activeTab === "overview"} onClick={switchTab} />
                <TabButton id="security" label="Security" icon={Shield} active={activeTab === "security"} onClick={switchTab} count={result.vulnerabilities?.length} />
                <TabButton id="quality" label="Quality" icon={Star2} active={activeTab === "quality"} onClick={switchTab} />
                <TabButton id="complexity" label="Complexity" icon={Clock} active={activeTab === "complexity"} onClick={switchTab} />
                <TabButton id="tests" label="Tests" icon={TestTube} active={activeTab === "tests"} onClick={switchTab} />
                <TabButton id="explanation" label="Explain" icon={BookOpen} active={activeTab === "explanation"} onClick={switchTab} />
                <TabButton id="improved" label="Fixed Code" icon={GitCompare} active={activeTab === "improved"} onClick={switchTab} />
              </div>

              {/* ── OVERVIEW TAB ── */}
              {activeTab === "overview" && (
                <div className="space-y-4">
                  <div className="glass-card rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="h-4 w-4 text-orange-400" />
                      <p className="text-sm font-semibold text-white">Analysis Summary</p>
                      <span className="ml-auto text-xs bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-muted-foreground">{result.language_detected} · {result.lines_of_code} lines</span>
                    </div>
                    <div className="flex flex-wrap gap-3 justify-center mb-4">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`text-4xl font-bold ${result.overall_score >= 70 ? "text-emerald-400" : result.overall_score >= 40 ? "text-yellow-400" : "text-red-400"}`}>{result.overall_score}</div>
                        <div className="text-xs text-muted-foreground">Overall Score</div>
                      </div>
                      {result.code_quality && (
                        <>
                          <ScoreRing score={result.code_quality.security} label="Security" color="text-red-400" />
                          <ScoreRing score={result.code_quality.readability} label="Readability" color="text-blue-400" />
                          <ScoreRing score={result.code_quality.performance} label="Performance" color="text-yellow-400" />
                          <ScoreRing score={result.code_quality.maintainability} label="Maintainability" color="text-violet-400" />
                          <ScoreRing score={result.code_quality.testability} label="Testability" color="text-cyan-400" />
                          <ScoreRing score={result.code_quality.documentation} label="Docs" color="text-indigo-400" />
                        </>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed bg-white/3 rounded-xl p-3 border border-white/6">{result.summary}</p>
                  </div>

                  {result.plagiarism_risk && (
                    <div className={`glass-card rounded-2xl p-4 border ${result.plagiarism_risk.risk_level === "high" ? "border-orange-500/30" : "border-white/8"}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-white mb-0.5">Originality Score: <span className="text-violet-400">{result.plagiarism_risk.originality_score}/100</span></p>
                          <p className="text-xs text-muted-foreground">{result.plagiarism_risk.explanation}</p>
                        </div>
                        <span className={`text-xs uppercase font-bold px-2.5 py-1.5 rounded-xl border ${result.plagiarism_risk.risk_level === "none" || result.plagiarism_risk.risk_level === "low" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-orange-500/30 bg-orange-500/10 text-orange-400"}`}>
                          {result.plagiarism_risk.risk_level} risk
                        </span>
                      </div>
                    </div>
                  )}

                  {result.positive_aspects?.length > 0 && (
                    <CollapsibleCard title="What's Done Well" color="text-emerald-400">
                      <div className="flex flex-wrap gap-2 mt-2">
                        {result.positive_aspects.map((p: string, i: number) => (
                          <span key={i} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />{p}
                          </span>
                        ))}
                      </div>
                    </CollapsibleCard>
                  )}

                  {result.anti_patterns?.length > 0 && (
                    <CollapsibleCard title="Anti-Patterns Detected" color="text-orange-400" defaultOpen={false}>
                      <div className="space-y-1.5 mt-2">
                        {result.anti_patterns.map((ap: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-foreground/75">
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-400 flex-shrink-0 mt-0.5" />{ap}
                          </div>
                        ))}
                      </div>
                    </CollapsibleCard>
                  )}
                </div>
              )}

              {/* ── SECURITY TAB ── */}
              {activeTab === "security" && (
                <div className="space-y-3">
                  {(!result.vulnerabilities || result.vulnerabilities.length === 0) ? (
                    <div className="glass-card rounded-2xl p-8 text-center">
                      <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
                      <p className="text-white font-semibold">No vulnerabilities detected</p>
                      <p className="text-sm text-muted-foreground mt-1">The code appears to be secure.</p>
                    </div>
                  ) : result.vulnerabilities.map((v: any, i: number) => (
                    <div key={i} className={`glass-card rounded-2xl border p-4 ${SEVERITY_COLORS[v.severity] || SEVERITY_COLORS.medium}`}>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wide">{v.severity}</span>
                        {v.cwe_id && <span className="text-[10px] opacity-60 font-mono">{v.cwe_id}</span>}
                        <span className="font-semibold text-sm">{v.title}</span>
                      </div>
                      <p className="text-xs opacity-80 mb-2">{v.description}</p>
                      {v.attack_vector && <div className="text-xs opacity-60 mb-2"><span className="font-semibold">Attack vector: </span>{v.attack_vector}</div>}
                      {v.line_hint && <div className="text-xs font-mono opacity-60 mb-2">Location: {v.line_hint}</div>}
                      {v.fix_example ? (
                        <div className="bg-black/20 rounded-lg p-2.5 text-xs font-mono mt-2 relative group">
                          <button onClick={() => copyCode(v.fix_example)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"><Copy className="h-3 w-3 text-muted-foreground" /></button>
                          <pre className="whitespace-pre-wrap text-emerald-300">{v.fix_example}</pre>
                        </div>
                      ) : v.fix && (
                        <div className="bg-black/20 rounded-lg p-2.5 text-xs font-mono mt-2 text-emerald-300">Fix: {v.fix}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── QUALITY TAB ── */}
              {activeTab === "quality" && (
                <div className="space-y-3">
                  {result.code_quality && (
                    <div className="glass-card rounded-2xl p-5">
                      <p className="text-sm font-semibold text-white mb-4">Quality Metrics</p>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(result.code_quality).filter(([k]) => k !== "comments").map(([key, val]) => (
                          <div key={key} className="flex items-center justify-between p-2.5 bg-white/3 rounded-xl border border-white/6">
                            <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                            <span className={`text-sm font-bold ${qualScore(val as number)}`}>{val as number}/10</span>
                          </div>
                        ))}
                      </div>
                      {result.code_quality.comments?.length > 0 && (
                        <div className="mt-4 space-y-1.5">
                          {result.code_quality.comments.map((c: string, i: number) => (
                            <p key={i} className="text-xs text-foreground/70 flex items-start gap-2"><Zap className="h-3 w-3 text-yellow-400 flex-shrink-0 mt-0.5" />{c}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {result.suggestions?.length > 0 && (
                    <CollapsibleCard title="Improvement Suggestions" count={result.suggestions.length} color="text-blue-400">
                      <div className="space-y-3 mt-2">
                        {result.suggestions.map((s: any, i: number) => (
                          <div key={i} className="bg-white/3 rounded-xl border border-white/6 p-3.5">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-lg border ${s.priority === "high" ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-blue-500/30 bg-blue-500/10 text-blue-400"}`}>{s.priority}</span>
                              <span className="text-xs text-muted-foreground uppercase">{s.type}</span>
                              <span className="font-semibold text-sm text-white">{s.title}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{s.description}</p>
                            {s.improved_snippet && (
                              <div className="bg-black/30 rounded-lg p-2.5 text-xs font-mono text-emerald-300 relative group">
                                <button onClick={() => copyCode(s.improved_snippet)} className="absolute top-1.5 right-2 opacity-0 group-hover:opacity-100"><Copy className="h-3 w-3 text-muted-foreground" /></button>
                                <pre className="whitespace-pre-wrap">{s.improved_snippet}</pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleCard>
                  )}
                  {result.documentation_gaps?.length > 0 && (
                    <CollapsibleCard title="Documentation Gaps" color="text-yellow-400" defaultOpen={false}>
                      <div className="space-y-1.5 mt-2">
                        {result.documentation_gaps.map((d: string, i: number) => (
                          <p key={i} className="text-xs text-foreground/75 flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />{d}</p>
                        ))}
                      </div>
                    </CollapsibleCard>
                  )}
                </div>
              )}

              {/* ── COMPLEXITY TAB ── */}
              {activeTab === "complexity" && (
                <div className="space-y-3">
                  {tabLoading.complexity ? (
                    <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-3">
                      <Loader2 className="h-7 w-7 text-orange-400 animate-spin" />
                      <p className="text-sm text-muted-foreground">Analyzing time & space complexity...</p>
                    </div>
                  ) : !complexity ? (
                    <div className="glass-card rounded-2xl p-8 text-center">
                      <Clock className="h-10 w-10 text-orange-400/40 mx-auto mb-3" />
                      <Button onClick={loadComplexity} className="bg-orange-600 hover:bg-orange-500 border-0"><Clock className="h-4 w-4 mr-2" />Analyze Complexity</Button>
                    </div>
                  ) : (
                    <>
                      <div className="glass-card rounded-2xl p-5">
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="text-center"><p className="text-2xl font-bold text-orange-400">{complexity.overall_time_complexity}</p><p className="text-xs text-muted-foreground">Time</p></div>
                          <div className="text-center"><p className="text-2xl font-bold text-violet-400">{complexity.overall_space_complexity}</p><p className="text-xs text-muted-foreground">Space</p></div>
                          <div className="text-center"><p className={`text-sm font-bold capitalize ${complexity.complexity_rating === "excellent" || complexity.complexity_rating === "good" ? "text-emerald-400" : complexity.complexity_rating === "acceptable" ? "text-yellow-400" : "text-red-400"}`}>{complexity.complexity_rating}</p><p className="text-xs text-muted-foreground">Rating</p></div>
                        </div>
                        {complexity.benchmark_estimate && <p className="text-xs text-foreground/70 bg-white/3 rounded-xl p-3 border border-white/6">{complexity.benchmark_estimate}</p>}
                      </div>
                      {complexity.functions?.length > 0 && (
                        <CollapsibleCard title="Function Breakdown" color="text-cyan-400">
                          <div className="space-y-2 mt-2">
                            {complexity.functions.map((f: any, i: number) => (
                              <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${f.bottleneck ? "border-red-500/25 bg-red-500/5" : "border-white/6 bg-white/3"}`}>
                                <div>
                                  <div className="flex items-center gap-2"><span className="text-sm font-mono text-white">{f.name}</span>{f.bottleneck && <span className="text-[10px] text-red-400 border border-red-500/30 bg-red-500/10 px-1.5 rounded-full">bottleneck</span>}</div>
                                  <p className="text-xs text-muted-foreground mt-0.5">{f.explanation}</p>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-mono text-orange-400">{f.time_complexity}</div>
                                  <div className="text-xs font-mono text-violet-400">{f.space_complexity}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CollapsibleCard>
                      )}
                      {complexity.optimizations?.length > 0 && (
                        <CollapsibleCard title="Optimization Opportunities" color="text-emerald-400">
                          <div className="space-y-3 mt-2">
                            {complexity.optimizations.map((opt: any, i: number) => (
                              <div key={i} className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3">
                                <p className="text-sm text-white font-medium mb-1">{opt.improvement}</p>
                                <p className="text-xs text-muted-foreground mb-2">{opt.description}</p>
                                {opt.code_example && <pre className="text-xs font-mono text-emerald-300 bg-black/20 rounded-lg p-2 whitespace-pre-wrap">{opt.code_example}</pre>}
                              </div>
                            ))}
                          </div>
                        </CollapsibleCard>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── TESTS TAB ── */}
              {activeTab === "tests" && (
                <div className="space-y-3">
                  {tabLoading.tests ? (
                    <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-3">
                      <Loader2 className="h-7 w-7 text-orange-400 animate-spin" />
                      <p className="text-sm text-muted-foreground">Generating comprehensive tests...</p>
                    </div>
                  ) : !tests ? (
                    <div className="glass-card rounded-2xl p-8 text-center">
                      <TestTube className="h-10 w-10 text-orange-400/40 mx-auto mb-3" />
                      <Button onClick={loadTests} className="bg-orange-600 hover:bg-orange-500 border-0"><TestTube className="h-4 w-4 mr-2" />Generate Tests</Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between glass-card rounded-2xl p-4">
                        <div>
                          <p className="text-sm font-semibold text-white">{tests.test_framework} Test Suite</p>
                          <p className="text-xs text-muted-foreground">{tests.test_cases?.length} test cases · Est. coverage: {tests.coverage_estimate}</p>
                        </div>
                        <button onClick={() => copyCode(tests.test_file)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-orange-600/15 border border-orange-500/25 text-orange-300 hover:bg-orange-600/25 transition-all">
                          <Copy className="h-3.5 w-3.5" />Copy Tests
                        </button>
                      </div>
                      <div className="glass-card rounded-2xl overflow-hidden">
                        <pre className="p-4 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap max-h-72 overflow-y-auto">{tests.test_file}</pre>
                      </div>
                      {tests.setup_instructions && (
                        <div className="glass-card rounded-2xl p-4">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">How to run</p>
                          <p className="text-xs font-mono text-foreground/80">{tests.setup_instructions}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── EXPLANATION TAB ── */}
              {activeTab === "explanation" && (
                <div className="space-y-3">
                  {tabLoading.explanation ? (
                    <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-3">
                      <Loader2 className="h-7 w-7 text-orange-400 animate-spin" />
                      <p className="text-sm text-muted-foreground">AI is explaining your code...</p>
                    </div>
                  ) : !explanation ? (
                    <div className="glass-card rounded-2xl p-8 text-center">
                      <BookOpen className="h-10 w-10 text-orange-400/40 mx-auto mb-3" />
                      <Button onClick={loadExplanation} className="bg-orange-600 hover:bg-orange-500 border-0"><BookOpen className="h-4 w-4 mr-2" />Explain Code</Button>
                    </div>
                  ) : (
                    <>
                      <div className="glass-card rounded-2xl p-5">
                        <p className="text-xl font-bold text-white mb-2">{explanation.tldr}</p>
                        <p className="text-sm text-foreground/80 leading-relaxed">{explanation.purpose}</p>
                        {explanation.analogies && <div className="mt-3 p-3 bg-white/4 border border-white/8 rounded-xl text-sm text-foreground/75 italic">💡 {explanation.analogies}</div>}
                      </div>
                      <CollapsibleCard title="How It Works (Step by Step)" color="text-blue-400">
                        <p className="text-sm text-foreground/80 leading-relaxed mt-2 whitespace-pre-line">{explanation.how_it_works}</p>
                      </CollapsibleCard>
                      {explanation.line_by_line?.length > 0 && (
                        <CollapsibleCard title="Line-by-Line Breakdown" color="text-violet-400" defaultOpen={false}>
                          <div className="space-y-2 mt-2">
                            {explanation.line_by_line.map((lb: any, i: number) => (
                              <div key={i} className="flex gap-3 text-xs p-2 bg-white/3 rounded-lg">
                                <span className="font-mono text-muted-foreground flex-shrink-0">{lb.lines}</span>
                                <span className="text-foreground/80">{lb.explanation}</span>
                              </div>
                            ))}
                          </div>
                        </CollapsibleCard>
                      )}
                      {explanation.edge_cases?.length > 0 && (
                        <CollapsibleCard title="Edge Cases" color="text-yellow-400" defaultOpen={false}>
                          <div className="space-y-1.5 mt-2">
                            {explanation.edge_cases.map((ec: string, i: number) => (
                              <p key={i} className="text-xs text-foreground/75 flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />{ec}</p>
                            ))}
                          </div>
                        </CollapsibleCard>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── IMPROVED CODE TAB ── */}
              {activeTab === "improved" && result.improved_code && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between glass-card rounded-2xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Auto-Fixed Version</p>
                      <p className="text-xs text-muted-foreground">{result.diff_summary?.length || 0} improvements applied</p>
                    </div>
                    <button onClick={() => copyCode(result.improved_code)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-emerald-600/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-600/25 transition-all">
                      <Copy className="h-3.5 w-3.5" />Copy Fixed Code
                    </button>
                  </div>
                  {result.diff_summary?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {result.diff_summary.map((d: string, i: number) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5" />{d}</span>
                      ))}
                    </div>
                  )}
                  <div className="glass-card rounded-2xl overflow-hidden">
                    <pre className="p-4 text-xs font-mono text-foreground/90 overflow-x-auto whitespace-pre-wrap max-h-[60vh] overflow-y-auto leading-relaxed">{result.improved_code}</pre>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Star2({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>;
}
