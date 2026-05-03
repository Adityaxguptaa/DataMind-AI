import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Cpu, Zap, Activity, Clock, Terminal, ChevronRight } from "lucide-react";

const TASKS = [
  { id: "sentiment", name: "Sentiment Analysis", model: "distilbert-base-uncased-finetuned-sst-2-english", color: "emerald", desc: "Detect positive/negative sentiment" },
  { id: "zero-shot", name: "Zero-Shot Classification", model: "facebook/bart-large-mnli", color: "blue", desc: "Custom categories, no training needed" },
  { id: "ner", name: "Named Entity Recognition", model: "dbmdz/bert-large-cased-finetuned-conll03-english", color: "violet", desc: "Find people, places, organizations" },
  { id: "summarization", name: "Text Summarization", model: "facebook/bart-large-cnn", color: "orange", desc: "Compress long text into key points" },
  { id: "translation-fr", name: "Translate EN→FR", model: "Helsinki-NLP/opus-mt-en-fr", color: "cyan", desc: "English to French translation" },
  { id: "translation-de", name: "Translate EN→DE", model: "Helsinki-NLP/opus-mt-en-de", color: "cyan", desc: "English to German translation" },
  { id: "translation-hi", name: "Translate EN→HI", model: "Helsinki-NLP/opus-mt-en-hi", color: "pink", desc: "English to Hindi translation" },
];

const SAMPLES: Record<string, string> = {
  sentiment: "The product exceeded all my expectations! Best purchase I've made this year.",
  "zero-shot": "The stock market crashed today due to rising interest rates and inflation fears.",
  ner: "Apple CEO Tim Cook announced the new iPhone 16 at the Steve Jobs Theater in Cupertino, California.",
  summarization: "Artificial intelligence is rapidly transforming various industries across the globe. From healthcare to finance, AI-powered systems are being deployed to automate tasks, improve efficiency, and generate new insights from vast amounts of data. Machine learning models can now diagnose diseases, detect fraud, personalize recommendations, and even write code. However, this technological revolution also raises significant concerns about job displacement, privacy, and algorithmic bias.",
  "translation-fr": "Hello, how are you today? I hope you are having a wonderful day!",
  "translation-de": "The quick brown fox jumps over the lazy dog.",
  "translation-hi": "Welcome to the future of artificial intelligence.",
};

function SentimentResult({ data }: any) {
  const isPos = data?.label === "POSITIVE";
  const score = ((data?.score ?? 0) * 100).toFixed(1);
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className={`relative w-32 h-32 rounded-full border-4 flex items-center justify-center ${isPos ? "border-emerald-500/40" : "border-red-500/40"}`}
        style={{ boxShadow: isPos ? "0 0 40px rgba(52,211,153,0.2)" : "0 0 40px rgba(239,68,68,0.2)" }}>
        <div className="text-center">
          <div className={`text-4xl font-bold ${isPos ? "text-emerald-400" : "text-red-400"}`}>{score}%</div>
          <div className={`text-xs font-semibold uppercase tracking-widest mt-0.5 ${isPos ? "text-emerald-400" : "text-red-400"}`}>{data?.label}</div>
        </div>
        <div className={`absolute inset-0 rounded-full ${isPos ? "bg-emerald-500/5" : "bg-red-500/5"}`} />
      </div>
      <div className="w-full">
        <div className={`h-2 rounded-full overflow-hidden ${isPos ? "bg-red-500/20" : "bg-emerald-500/20"}`}>
          <div className={`h-full rounded-full transition-all duration-1000 ${isPos ? "bg-emerald-500" : "bg-red-500"}`}
            style={{ width: `${score}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
          <span>Negative</span><span>Positive</span>
        </div>
      </div>
    </div>
  );
}

function ZeroShotResult({ data }: any) {
  const labels: string[] = data?.labels ?? [];
  const scores: number[] = data?.scores ?? [];
  const colors = ["blue", "violet", "emerald", "orange", "red", "pink"];
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500", violet: "bg-violet-500", emerald: "bg-emerald-500",
    orange: "bg-orange-500", red: "bg-red-500", pink: "bg-pink-500",
  };
  return (
    <div className="space-y-3 p-2">
      {labels.map((label, i) => {
        const pct = ((scores[i] ?? 0) * 100);
        const c = colors[i % colors.length];
        return (
          <div key={label} className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-white">{label}</span>
              <span className={`font-mono text-xs ${i === 0 ? "text-blue-400" : "text-muted-foreground"}`}>{pct.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full ${colorMap[c]} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NERResult({ data }: any) {
  const entities = data?.entities ?? [];
  const tagColors: Record<string, string> = {
    PER: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    ORG: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    LOC: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    MISC: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  };
  if (!entities.length) return <p className="text-muted-foreground text-sm text-center py-6">No named entities found in the input text.</p>;
  return (
    <div className="p-2">
      <div className="flex flex-wrap gap-2">
        {entities.map((ent: any, i: number) => {
          const cls = tagColors[ent.entity_group] || "bg-white/10 text-white/80 border-white/20";
          return (
            <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${cls}`}>
              <span className="font-bold text-[10px] uppercase tracking-wider opacity-70">{ent.entity_group}</span>
              <span className="font-semibold">{ent.word}</span>
              <span className="opacity-50">{((ent.score ?? 0) * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextResult({ text }: { text: string }) {
  return (
    <div className="p-4 bg-white/3 rounded-xl border border-white/8">
      <p className="text-sm text-foreground/90 leading-relaxed font-serif whitespace-pre-wrap">{text}</p>
    </div>
  );
}

export default function Playground() {
  const { toast } = useToast();
  const [task, setTask] = useState("sentiment");
  const [input, setInput] = useState(SAMPLES["sentiment"]);
  const [labels, setLabels] = useState("politics, sports, technology, business");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const currentTask = TASKS.find(t => t.id === task)!;

  const handleTaskChange = (v: string) => {
    setTask(v); setResult(null);
    setInput(SAMPLES[v] || "");
  };

  const handleSubmit = async () => {
    if (!input.trim() || (task === "zero-shot" && !labels.trim())) return;
    setLoading(true); setResult(null);
    try {
      const payload: any = { task, input_text: input };
      if (task === "zero-shot") {
        payload.candidate_labels = labels.split(",").map(l => l.trim()).filter(Boolean);
      }
      const res = await api.post<any>("/hf/inference", payload);
      setResult(res);
    } catch (error: any) {
      toast({ title: "Inference Failed", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const renderResult = () => {
    if (!result) return null;
    const data = result.result;
    if (task === "sentiment") return <SentimentResult data={data} />;
    if (task === "zero-shot") return <ZeroShotResult data={data} />;
    if (task === "ner") return <NERResult data={data} />;
    const text = data?.summary_text || data?.translation_text || JSON.stringify(data, null, 2);
    return <TextResult text={text} />;
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
          <Cpu className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">HuggingFace Playground</h1>
          <p className="text-xs text-muted-foreground">Run state-of-the-art free models locally</p>
        </div>
      </div>

      {/* Task selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {TASKS.map(t => (
          <button key={t.id} onClick={() => handleTaskChange(t.id)}
            className={`p-2.5 rounded-xl border text-left transition-all text-xs ${
              task === t.id ? "border-emerald-500/40 bg-emerald-500/10 text-white" : "border-white/6 bg-white/2 text-muted-foreground hover:text-white hover:border-white/12"
            }`}>
            <div className="font-semibold leading-tight">{t.name}</div>
            <div className="text-[10px] opacity-60 mt-0.5 leading-tight">{t.desc}</div>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-12 gap-5">
        {/* Input */}
        <div className="md:col-span-5 space-y-4">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <Zap className="h-3 w-3 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{currentTask.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{currentTask.model}</p>
              </div>
            </div>

            {task === "zero-shot" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Labels (comma separated)</Label>
                <Input placeholder="e.g. politics, sports, technology"
                  value={labels} onChange={e => setLabels(e.target.value)}
                  className="bg-white/5 border-white/10 focus:border-emerald-500/50 font-mono text-sm" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Input Text</Label>
              <Textarea
                placeholder="Enter text to analyze..."
                className="min-h-[200px] resize-none bg-white/5 border-white/10 focus:border-emerald-500/50 font-mono text-sm leading-relaxed"
                value={input} onChange={e => setInput(e.target.value)}
              />
            </div>

            <Button className="w-full bg-emerald-600 hover:bg-emerald-500 border-0 font-semibold h-11"
              onClick={handleSubmit}
              disabled={loading || !input.trim() || (task === "zero-shot" && !labels.trim())}>
              {loading
                ? <><Activity className="h-4 w-4 animate-spin mr-2" /> Running model...</>
                : <><Zap className="h-4 w-4 mr-2" /> Run Inference</>
              }
            </Button>
          </div>
        </div>

        {/* Output */}
        <div className="md:col-span-7">
          <div className="glass-card rounded-2xl overflow-hidden h-full flex flex-col">
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2.5 flex-shrink-0">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white font-mono">Model Output</span>
              {result && (
                <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-white/5 px-2.5 py-1 rounded-full border border-white/8">
                  <Clock className="h-3 w-3" /> {(result.duration_ms / 1000).toFixed(2)}s
                </div>
              )}
            </div>

            <div className="flex-1 p-5">
              {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-5">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Cpu className="h-6 w-6 text-emerald-500/50" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-white font-medium">Running forward pass...</p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">{currentTask.model}</p>
                  </div>
                </div>
              ) : result ? (
                <div className="space-y-4">
                  {renderResult()}
                  <div className="pt-3 border-t border-white/6 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground">{result.model_name || currentTask.model}</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">HuggingFace Free</span>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-emerald-500/15 rounded-xl">
                  <Terminal className="h-8 w-8 text-emerald-500/25" />
                  <p className="text-sm text-muted-foreground font-mono">Awaiting input...</p>
                  <p className="text-xs text-muted-foreground/60">Click "Run Inference" to execute</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
