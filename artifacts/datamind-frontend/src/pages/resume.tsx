import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import {
  Briefcase, Upload, CheckCircle2, XCircle, Loader2, Sparkles, Target,
  Trophy, Zap, ChevronDown, ChevronRight, ChevronLeft, Pencil, Plus,
  Trash2, RotateCcw, Copy, Download, FileText, Star, AlertTriangle,
  ArrowRight, Brain, Shield
} from "lucide-react";

type Step = "input" | "scanning" | "review" | "builder" | "export";
type Priority = "high" | "medium" | "low";

interface Checkpoint { id: string; priority: Priority; section: string; type: string; title: string; description: string; current: string; suggested: string; reason: string; ats_impact: string; status: "pending" | "approved" | "rejected"; }
interface Contact { name: string; email: string; phone: string; location: string; linkedin: string; github: string; portfolio: string; }
interface Experience { id: string; title: string; company: string; duration: string; location: string; bullets: string[]; }
interface Education { id: string; degree: string; institution: string; year: string; gpa: string; }
interface Project { id: string; name: string; description: string; technologies: string[]; link: string; }
interface Structure { contact: Contact; summary: string; skills: { technical: string[]; soft: string[]; tools: string[]; languages: string[]; }; experience: Experience[]; education: Education[]; projects: Project[]; certifications: string[]; awards: string[]; }

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "border-red-500/30 bg-red-500/8 text-red-400",
  medium: "border-yellow-500/30 bg-yellow-500/8 text-yellow-400",
  low: "border-blue-500/30 bg-blue-500/8 text-blue-400",
};
const PRIORITY_BADGE: Record<Priority, string> = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 36; const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle cx="44" cy="44" r={r} fill="none" stroke="currentColor" strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={circ - (score / 100) * circ} strokeLinecap="round"
            className={`transition-all duration-1000 ${color}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold ${color}`}>{score}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function EditableField({ value, onChange, multiline = false, placeholder = "Click to edit..." }: any) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    const cls = "w-full bg-black/30 border border-violet-500/40 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none resize-none";
    return multiline
      ? <textarea value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} rows={3} className={cls} autoFocus />
      : <input value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setEditing(false); }} onKeyDown={e => e.key === "Enter" && (onChange(draft), setEditing(false))} className={cls} autoFocus />;
  }
  return (
    <div onClick={() => { setDraft(value); setEditing(true); }} className="cursor-text min-h-[28px] text-sm text-foreground/85 hover:bg-white/5 rounded-lg px-2 py-1 transition-colors group relative">
      {value || <span className="text-muted-foreground/40 italic text-xs">{placeholder}</span>}
      <Pencil className="h-3 w-3 absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-30 text-muted-foreground" />
    </div>
  );
}

function SuggestBtn({ section, currentValue, role, jd, onApply }: any) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  const handle = async () => {
    setLoading(true); setSuggestion(null);
    try {
      const res = await api.post<any>("/resume/suggest-section", { section, current_value: currentValue, role, job_description: jd });
      setSuggestion(res);
    } catch {} finally { setLoading(false); }
  };
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={handle} disabled={loading}
        className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg px-2.5 py-1.5 transition-all hover:bg-violet-500/15 disabled:opacity-50">
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        AI Suggest
      </button>
      {suggestion && (
        <div className="bg-violet-500/8 border border-violet-500/20 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-violet-400">AI Suggestion</p>
          <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{suggestion.suggestion}</p>
          {suggestion.reason && <p className="text-[10px] text-muted-foreground italic">{suggestion.reason}</p>}
          <div className="flex gap-2">
            <button onClick={() => { onApply(suggestion.suggestion); setSuggestion(null); }} className="text-xs bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-2.5 py-1 rounded-lg hover:bg-emerald-500/25 transition-all">Apply</button>
            <button onClick={() => setSuggestion(null)} className="text-xs bg-white/5 border border-white/10 text-muted-foreground px-2.5 py-1 rounded-lg">Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Resume() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("input");
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [resumeText, setResumeText] = useState("");
  const [jd, setJd] = useState("");
  const [role, setRole] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [analysis, setAnalysis] = useState<any>(null);
  const [structure, setStructure] = useState<Structure | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [editedStructure, setEditedStructure] = useState<Structure | null>(null);
  const [atsResult, setAtsResult] = useState<any>(null);
  const [generatingATS, setGeneratingATS] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["contact", "summary", "skills", "experience"]));

  const scoreColor = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-yellow-400" : "text-red-400";

  const handleScan = async () => {
    setStep("scanning");
    try {
      let res: any;
      if (mode === "upload" && file) {
        const fd = new FormData();
        fd.append("file", file);
        if (jd) fd.append("job_description", jd);
        if (role) fd.append("role", role);
        res = await api.post<any>("/resume/upload-scan", fd);
      } else {
        if (!resumeText.trim()) { toast({ title: "Please paste your resume", variant: "destructive" }); setStep("input"); return; }
        res = await api.post<any>("/resume/full-scan", { resume_text: resumeText, job_description: jd || undefined, role: role || undefined });
      }
      setAnalysis(res.analysis);
      setStructure(res.structure);
      setEditedStructure(JSON.parse(JSON.stringify(res.structure)));
      setCheckpoints((res.checkpoints || []).map((cp: any) => ({ ...cp, status: "pending" })));
      setStep("review");
    } catch (e: any) {
      toast({ title: "Scan Failed", description: e.message, variant: "destructive" });
      setStep("input");
    }
  };

  const approveCheckpoint = (id: string) => setCheckpoints(prev => prev.map(cp => cp.id === id ? { ...cp, status: "approved" } : cp));
  const rejectCheckpoint = (id: string) => setCheckpoints(prev => prev.map(cp => cp.id === id ? { ...cp, status: "rejected" } : cp));

  const applyApprovedCheckpoints = () => {
    const approved = checkpoints.filter(cp => cp.status === "approved");
    const updated = JSON.parse(JSON.stringify(editedStructure)) as Structure;
    approved.forEach(cp => {
      if (cp.section === "summary" && cp.suggested) updated.summary = cp.suggested;
    });
    setEditedStructure(updated);
    setStep("builder");
  };

  const updateContact = (field: keyof Contact, value: string) => {
    setEditedStructure(prev => prev ? { ...prev, contact: { ...prev.contact, [field]: value } } : prev);
  };

  const updateSummary = (value: string) => setEditedStructure(prev => prev ? { ...prev, summary: value } : prev);

  const updateExpBullet = (expId: string, bIdx: number, value: string) => {
    setEditedStructure(prev => {
      if (!prev) return prev;
      return { ...prev, experience: prev.experience.map(e => e.id === expId ? { ...e, bullets: e.bullets.map((b, i) => i === bIdx ? value : b) } : e) };
    });
  };

  const addExpBullet = (expId: string) => setEditedStructure(prev => {
    if (!prev) return prev;
    return { ...prev, experience: prev.experience.map(e => e.id === expId ? { ...e, bullets: [...e.bullets, ""] } : e) };
  });

  const removeExpBullet = (expId: string, bIdx: number) => setEditedStructure(prev => {
    if (!prev) return prev;
    return { ...prev, experience: prev.experience.map(e => e.id === expId ? { ...e, bullets: e.bullets.filter((_, i) => i !== bIdx) } : e) };
  });

  const updateExp = (expId: string, field: string, value: string) => setEditedStructure(prev => {
    if (!prev) return prev;
    return { ...prev, experience: prev.experience.map(e => e.id === expId ? { ...e, [field]: value } : e) };
  });

  const removeExp = (expId: string) => setEditedStructure(prev => prev ? { ...prev, experience: prev.experience.filter(e => e.id !== expId) } : prev);

  const updateSkill = (cat: "technical" | "soft" | "tools" | "languages", idx: number, value: string) => {
    setEditedStructure(prev => prev ? { ...prev, skills: { ...prev.skills, [cat]: prev.skills[cat].map((s, i) => i === idx ? value : s) } } : prev);
  };

  const addSkill = (cat: "technical" | "soft" | "tools" | "languages") => {
    setEditedStructure(prev => prev ? { ...prev, skills: { ...prev.skills, [cat]: [...prev.skills[cat], ""] } } : prev);
  };

  const removeSkill = (cat: "technical" | "soft" | "tools" | "languages", idx: number) => {
    setEditedStructure(prev => prev ? { ...prev, skills: { ...prev.skills, [cat]: prev.skills[cat].filter((_, i) => i !== idx) } } : prev);
  };

  const handleGenerateATS = async () => {
    if (!editedStructure) return;
    setGeneratingATS(true);
    try {
      const res = await api.post<any>("/resume/generate-ats", { structure: editedStructure, one_page: true, job_description: jd || undefined });
      setAtsResult(res);
      setStep("export");
    } catch (e: any) {
      toast({ title: "ATS Generation Failed", description: e.message, variant: "destructive" });
    } finally { setGeneratingATS(false); }
  };

  const toggleSection = (s: string) => setOpenSections(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const downloadResume = () => {
    const text = atsResult?.ats_resume || "";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ATS_Resume.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  const steps = ["Input", "Scan", "Review", "Builder", "Export"];
  const stepIdx = { input: 0, scanning: 1, review: 2, builder: 3, export: 4 }[step];

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
          <Briefcase className="h-4 w-4 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Resume Builder & Scanner</h1>
          <p className="text-xs text-muted-foreground">ATS optimization · Checkpoint review · In-place editing · AI suggestions · One-page export</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 glass-card rounded-2xl px-5 py-3">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              i === stepIdx ? "bg-violet-600/20 text-violet-300 border border-violet-500/30" :
              i < stepIdx ? "text-emerald-400" : "text-muted-foreground/40"
            }`}>
              {i < stepIdx ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">{i + 1}</span>}
              {s}
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 mx-0.5" />}
          </div>
        ))}
      </div>

      {/* ── STEP: INPUT ── */}
      {step === "input" && (
        <div className="grid lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 space-y-4">
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <div className="flex gap-2">
                {(["paste", "upload"] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${mode === m ? "bg-violet-600 text-white" : "bg-white/5 text-muted-foreground hover:text-white"}`}>
                    {m === "paste" ? "Paste Text" : "Upload File"}
                  </button>
                ))}
              </div>
              {mode === "paste" ? (
                <div className="relative">
                  <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} rows={14}
                    placeholder="Paste your resume text here..."
                    className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:border-violet-500/40 placeholder:text-muted-foreground/50" />
                  <div className="absolute bottom-3 right-3">
                    <ImageUploadButton onExtracted={t => setResumeText(prev => prev + "\n" + t)} question="Extract all resume text from this image exactly as written." />
                  </div>
                </div>
              ) : (
                <div>
                  <input type="file" ref={fileRef} className="hidden" accept=".pdf,.docx,.txt" onChange={e => setFile(e.target.files?.[0] || null)} />
                  <button onClick={() => fileRef.current?.click()} className={`w-full p-8 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-3 ${file ? "border-violet-500/40 bg-violet-500/5" : "border-white/10 hover:border-violet-500/30 hover:bg-violet-500/5"}`}>
                    <Upload className={`h-8 w-8 ${file ? "text-violet-400" : "text-muted-foreground"}`} />
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">{file ? file.name : "Upload Resume"}</p>
                      <p className="text-xs text-muted-foreground">PDF · DOCX · TXT</p>
                    </div>
                  </button>
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Target Role <span className="text-white/25">(optional)</span></label>
                  <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior Software Engineer"
                    className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/40 placeholder:text-muted-foreground/50" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Job Description <span className="text-white/25">(for JD match + tailoring)</span></label>
                  <textarea value={jd} onChange={e => setJd(e.target.value)} rows={4} placeholder="Paste the job description here..."
                    className="w-full bg-white/3 border border-white/8 rounded-xl px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-violet-500/40 placeholder:text-muted-foreground/50" />
                </div>
              </div>
              <Button onClick={handleScan} disabled={(mode === "paste" && !resumeText.trim()) || (mode === "upload" && !file)}
                className="w-full bg-violet-600 hover:bg-violet-500 border-0 font-semibold">
                <Brain className="h-4 w-4 mr-2" />Deep Scan & Analyze
              </Button>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-card rounded-2xl p-5">
              <p className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-400" />What you'll get</p>
              {[
                { icon: Target, color: "text-blue-400", text: "ATS compatibility score & analysis" },
                { icon: Brain, color: "text-violet-400", text: "Structured extraction of all resume data" },
                { icon: CheckCircle2, color: "text-emerald-400", text: "10+ actionable improvement checkpoints" },
                { icon: Pencil, color: "text-yellow-400", text: "In-place editing with AI suggestions per field" },
                { icon: Shield, color: "text-orange-400", text: "JD matching & keyword optimization" },
                { icon: FileText, color: "text-pink-400", text: "One-page ATS-formatted resume export" },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/4 last:border-0">
                  <f.icon className={`h-4 w-4 flex-shrink-0 ${f.color}`} />
                  <span className="text-sm text-foreground/80">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: SCANNING ── */}
      {step === "scanning" && (
        <div className="glass-card rounded-2xl p-16 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Brain className="h-10 w-10 text-violet-400 animate-pulse" />
            </div>
            <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-violet-600 border-2 border-[#05080f] flex items-center justify-center">
              <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white mb-2">Deep scanning your resume...</p>
            <p className="text-sm text-muted-foreground max-w-sm">Running parallel analysis: ATS scoring, structure extraction, and generating personalized improvement checkpoints</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {["ATS Analysis", "Structure Extraction", "Checkpoint Generation", "JD Matching"].map((s, i) => (
              <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground animate-pulse" style={{ animationDelay: `${i * 300}ms` }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP: REVIEW ── */}
      {step === "review" && analysis && (
        <div className="grid lg:grid-cols-5 gap-5">
          {/* Analysis Scores */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-card rounded-2xl p-5">
              <p className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Target className="h-4 w-4 text-violet-400" />Resume Intelligence Report</p>
              <div className="flex flex-wrap gap-4 justify-center mb-4">
                <ScoreGauge score={analysis.overall_score ?? 0} label="Overall Score" color={scoreColor(analysis.overall_score)} />
                <ScoreGauge score={analysis.ats_score ?? 0} label="ATS Score" color={scoreColor(analysis.ats_score)} />
                <ScoreGauge score={analysis.shortlisting_probability ?? 0} label="Shortlist %" color={scoreColor(analysis.shortlisting_probability)} />
              </div>
              {analysis.candidate_level && (
                <div className="flex gap-2 flex-wrap mb-3">
                  <span className="text-xs capitalize px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400">{analysis.candidate_level} level</span>
                  {analysis.years_experience && <span className="text-xs px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-muted-foreground">{analysis.years_experience}+ years exp.</span>}
                </div>
              )}
              <p className="text-xs text-foreground/75 leading-relaxed bg-white/3 border border-white/6 rounded-xl p-3">{analysis.summary}</p>
            </div>
            {analysis.rewritten_summary && (
              <div className="glass-card rounded-2xl p-4">
                <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mb-2"><Sparkles className="h-3.5 w-3.5" />AI Suggested Summary</p>
                <p className="text-xs text-foreground/80 leading-relaxed italic">{analysis.rewritten_summary}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card rounded-2xl p-3">
                <p className="text-xs font-semibold text-emerald-400 mb-2">Strengths</p>
                {(analysis.strengths || []).slice(0, 4).map((s: string, i: number) => (
                  <p key={i} className="text-xs text-foreground/75 flex items-start gap-1.5 mb-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0 mt-0.5" />{s}</p>
                ))}
              </div>
              <div className="glass-card rounded-2xl p-3">
                <p className="text-xs font-semibold text-red-400 mb-2">Gaps</p>
                {(analysis.weaknesses || []).slice(0, 4).map((w: string, i: number) => (
                  <p key={i} className="text-xs text-foreground/75 flex items-start gap-1.5 mb-1.5"><XCircle className="h-3 w-3 text-red-400 flex-shrink-0 mt-0.5" />{w}</p>
                ))}
              </div>
            </div>
          </div>

          {/* Checkpoints */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Brain className="h-4 w-4 text-violet-400" />Improvement Checkpoints</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="text-emerald-400 font-semibold">{checkpoints.filter(c => c.status === "approved").length} approved</span>
                <span>{checkpoints.filter(c => c.status === "pending").length} pending</span>
              </div>
            </div>
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {checkpoints.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority])).map(cp => (
                <div key={cp.id} className={`glass-card rounded-2xl border p-4 transition-all ${
                  cp.status === "approved" ? "border-emerald-500/30 bg-emerald-500/5" :
                  cp.status === "rejected" ? "border-red-500/15 opacity-50" :
                  PRIORITY_STYLES[cp.priority]
                }`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${PRIORITY_BADGE[cp.priority]}`}>{cp.priority}</span>
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-white/8 border border-white/10 text-muted-foreground">{cp.section}</span>
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${cp.ats_impact === "high" ? "text-orange-400 bg-orange-500/10 border border-orange-500/20" : "bg-white/5 border border-white/8 text-muted-foreground"}`}>ATS: {cp.ats_impact}</span>
                    </div>
                    {cp.status === "pending" && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => approveCheckpoint(cp.id)} className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25 flex items-center justify-center transition-all"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => rejectCheckpoint(cp.id)} className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all"><XCircle className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                    {cp.status === "approved" && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Approved</span>}
                    {cp.status === "rejected" && <span className="text-xs text-red-400 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Skipped</span>}
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">{cp.title}</p>
                  <p className="text-xs text-muted-foreground mb-2">{cp.description}</p>
                  {cp.current && (
                    <div className="space-y-1.5">
                      <div className="bg-red-500/8 border border-red-500/15 rounded-lg p-2 text-xs text-foreground/60"><span className="text-red-400 font-semibold">Before: </span>{cp.current}</div>
                      <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-lg p-2 text-xs text-foreground/80"><span className="text-emerald-400 font-semibold">After: </span>{cp.suggested}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => setCheckpoints(prev => prev.map(cp => ({ ...cp, status: cp.priority === "high" ? "approved" : cp.status })))}
                variant="outline" className="border-white/10 hover:bg-white/5 text-sm">
                <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-400" />Approve All High Priority
              </Button>
              <Button onClick={applyApprovedCheckpoints} className="flex-1 bg-violet-600 hover:bg-violet-500 border-0 font-semibold">
                Build My Resume <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: BUILDER ── */}
      {step === "builder" && editedStructure && (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Editable sections */}
          <div className="lg:col-span-2 space-y-3 max-h-[80vh] overflow-y-auto pr-1">
            {/* Contact */}
            {["contact"].map(sec => (
              <div key={sec} className="glass-card rounded-2xl overflow-hidden">
                <button onClick={() => toggleSection("contact")} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors">
                  <span className="text-sm font-semibold text-violet-400">Contact Information</span>
                  {openSections.has("contact") ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                {openSections.has("contact") && (
                  <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                    {(Object.keys(editedStructure.contact) as (keyof Contact)[]).map(field => (
                      <div key={field}>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1 block">{field}</label>
                        <EditableField value={editedStructure.contact[field]} onChange={v => updateContact(field, v)} placeholder={field} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Summary */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <button onClick={() => toggleSection("summary")} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors">
                <span className="text-sm font-semibold text-blue-400">Professional Summary</span>
                {openSections.has("summary") ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
              {openSections.has("summary") && (
                <div className="px-4 pb-4 space-y-3">
                  <EditableField value={editedStructure.summary} onChange={updateSummary} multiline placeholder="Write a 2-3 sentence professional summary..." />
                  <SuggestBtn section="summary" currentValue={editedStructure.summary} role={role} jd={jd} onApply={updateSummary} />
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <button onClick={() => toggleSection("skills")} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors">
                <span className="text-sm font-semibold text-emerald-400">Skills</span>
                {openSections.has("skills") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {openSections.has("skills") && (
                <div className="px-4 pb-4 space-y-4">
                  {(["technical", "soft", "tools", "languages"] as const).map(cat => (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground capitalize">{cat} Skills</p>
                        <button onClick={() => addSkill(cat)} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"><Plus className="h-3 w-3" />Add</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {editedStructure.skills[cat].map((skill, i) => (
                          <div key={i} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 group">
                            <input value={skill} onChange={e => updateSkill(cat, i, e.target.value)}
                              className="bg-transparent text-xs text-white outline-none w-16 min-w-0" style={{ width: `${Math.max(40, skill.length * 7)}px` }} />
                            <button onClick={() => removeSkill(cat, i)} className="opacity-0 group-hover:opacity-100 transition-opacity"><X_Icon className="h-2.5 w-2.5 text-muted-foreground hover:text-red-400" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Experience */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <button onClick={() => toggleSection("experience")} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors">
                <span className="text-sm font-semibold text-cyan-400">Work Experience</span>
                {openSections.has("experience") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {openSections.has("experience") && (
                <div className="px-4 pb-4 space-y-4">
                  {editedStructure.experience.map(exp => (
                    <div key={exp.id} className="border border-white/8 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="grid grid-cols-2 gap-2 flex-1 mr-3">
                          <EditableField value={exp.title} onChange={v => updateExp(exp.id, "title", v)} placeholder="Job Title" />
                          <EditableField value={exp.company} onChange={v => updateExp(exp.id, "company", v)} placeholder="Company" />
                          <EditableField value={exp.duration} onChange={v => updateExp(exp.id, "duration", v)} placeholder="Jan 2021 - Present" />
                          <EditableField value={exp.location} onChange={v => updateExp(exp.id, "location", v)} placeholder="Location" />
                        </div>
                        <button onClick={() => removeExp(exp.id)} className="p-1.5 rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">Bullets (start with strong action verbs):</p>
                      {exp.bullets.map((bullet, bIdx) => (
                        <div key={bIdx} className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-2 text-xs flex-shrink-0">•</span>
                          <div className="flex-1">
                            <EditableField value={bullet} onChange={v => updateExpBullet(exp.id, bIdx, v)} multiline placeholder="Led a team of 5 to deliver X, resulting in Y% improvement..." />
                          </div>
                          <button onClick={() => removeExpBullet(exp.id, bIdx)} className="mt-1.5 p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      ))}
                      <button onClick={() => addExpBullet(exp.id)} className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 mt-1"><Plus className="h-3 w-3" />Add bullet</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Education */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <button onClick={() => toggleSection("education")} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors">
                <span className="text-sm font-semibold text-indigo-400">Education</span>
                {openSections.has("education") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {openSections.has("education") && (
                <div className="px-4 pb-4 space-y-3">
                  {editedStructure.education.map(edu => (
                    <div key={edu.id} className="border border-white/8 rounded-xl p-3 grid grid-cols-2 gap-2">
                      <EditableField value={edu.degree} onChange={v => setEditedStructure(prev => prev ? { ...prev, education: prev.education.map(e => e.id === edu.id ? { ...e, degree: v } : e) } : prev)} placeholder="Degree" />
                      <EditableField value={edu.institution} onChange={v => setEditedStructure(prev => prev ? { ...prev, education: prev.education.map(e => e.id === edu.id ? { ...e, institution: v } : e) } : prev)} placeholder="Institution" />
                      <EditableField value={edu.year} onChange={v => setEditedStructure(prev => prev ? { ...prev, education: prev.education.map(e => e.id === edu.id ? { ...e, year: v } : e) } : prev)} placeholder="Year" />
                      <EditableField value={edu.gpa} onChange={v => setEditedStructure(prev => prev ? { ...prev, education: prev.education.map(e => e.id === edu.id ? { ...e, gpa: v } : e) } : prev)} placeholder="GPA (optional)" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Controls + ATS Preview */}
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-4 space-y-3 sticky top-0">
              <p className="text-sm font-semibold text-white">Generate ATS Resume</p>
              <p className="text-xs text-muted-foreground">When you're happy with your edits, generate a perfectly formatted one-page ATS resume.</p>
              <Button onClick={handleGenerateATS} disabled={generatingATS} className="w-full bg-violet-600 hover:bg-violet-500 border-0">
                {generatingATS ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating...</> : <><Sparkles className="h-4 w-4 mr-2" />Generate ATS Resume</>}
              </Button>
              <button onClick={() => setStep("review")} className="w-full text-xs text-muted-foreground hover:text-white transition-colors flex items-center justify-center gap-1.5">
                <ChevronLeft className="h-3.5 w-3.5" />Back to Checkpoints
              </button>
            </div>
            {analysis && (
              <div className="glass-card rounded-2xl p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Missing Keywords</p>
                <div className="flex flex-wrap gap-1.5">
                  {(analysis.ats_keywords_missing || []).slice(0, 12).map((kw: string, i: number) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300">{kw}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEP: EXPORT ── */}
      {step === "export" && atsResult && (
        <div className="space-y-5">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">ATS-Optimized Resume Ready!</p>
                  <p className="text-xs text-muted-foreground">
                    {atsResult.word_count} words · ~{atsResult.estimated_pages} page{atsResult.estimated_pages !== 1 ? "s" : ""} · Est. ATS Score: <span className="text-emerald-400">{atsResult.ats_score_estimate}/100</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(atsResult.ats_resume); toast({ title: "Copied to clipboard!" }); }}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-muted-foreground hover:text-white transition-all">
                  <Copy className="h-3.5 w-3.5" />Copy
                </button>
                <button onClick={downloadResume} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-all font-medium">
                  <Download className="h-3.5 w-3.5" />Download .txt
                </button>
              </div>
            </div>
            {atsResult.improvements_made?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {atsResult.improvements_made.map((imp: string, i: number) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5" />{imp}</span>
                ))}
              </div>
            )}
            <pre className="bg-black/40 border border-white/8 rounded-xl p-5 text-sm font-mono text-foreground/85 whitespace-pre-wrap leading-relaxed max-h-[65vh] overflow-y-auto">
              {atsResult.ats_resume}
            </pre>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep("builder")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors">
              <ChevronLeft className="h-4 w-4" />Back to Editor
            </button>
            <button onClick={() => { setStep("input"); setAnalysis(null); setStructure(null); setEditedStructure(null); setCheckpoints([]); setAtsResult(null); setResumeText(""); setFile(null); }}
              className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 ml-auto transition-colors">
              <RotateCcw className="h-4 w-4" />Scan Another Resume
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function X_Icon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
}
