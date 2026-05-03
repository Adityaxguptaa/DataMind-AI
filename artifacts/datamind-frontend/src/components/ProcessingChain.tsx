import { useEffect, useState } from "react";
import { Upload, FileText, Scissors, Cpu, Database, CheckCircle2, Loader2, FileSearch, Sparkles } from "lucide-react";

export interface ProcessingStep {
  id: string;
  label: string;
  detail: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
}

const DEFAULT_STEPS: ProcessingStep[] = [
  { id: "upload", label: "File Received", detail: "Secure upload complete", icon: Upload, color: "text-blue-400", bgColor: "bg-blue-500/12", borderColor: "border-blue-500/30" },
  { id: "extract", label: "Text Extraction", detail: "Parsing document content", icon: FileSearch, color: "text-indigo-400", bgColor: "bg-indigo-500/12", borderColor: "border-indigo-500/30" },
  { id: "chunk", label: "Smart Chunking", detail: "Splitting into semantic chunks", icon: Scissors, color: "text-violet-400", bgColor: "bg-violet-500/12", borderColor: "border-violet-500/30" },
  { id: "embed", label: "Embedding", detail: "Generating vector representations", icon: Cpu, color: "text-purple-400", bgColor: "bg-purple-500/12", borderColor: "border-purple-500/30" },
  { id: "index", label: "Vector Indexing", detail: "Storing in ChromaDB", icon: Database, color: "text-fuchsia-400", bgColor: "bg-fuchsia-500/12", borderColor: "border-fuchsia-500/30" },
  { id: "summary", label: "Summary Generation", detail: "AI summarizing content", icon: Sparkles, color: "text-pink-400", bgColor: "bg-pink-500/12", borderColor: "border-pink-500/30" },
  { id: "ready", label: "Ready to Use", detail: "Chat, MCQ & Summary available", icon: CheckCircle2, color: "text-emerald-400", bgColor: "bg-emerald-500/12", borderColor: "border-emerald-500/30" },
];

interface ProcessingChainProps {
  active: boolean;
  completedStepId?: string;
  steps?: ProcessingStep[];
}

export function ProcessingChain({ active, completedStepId, steps = DEFAULT_STEPS }: ProcessingChainProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!active) {
      setCurrentStep(0);
      setCompletedSteps(new Set());
      return;
    }

    let step = 0;
    setCurrentStep(0);
    setCompletedSteps(new Set());

    const intervals = [1200, 2200, 3600, 5200, 7000, 8800];
    const timers: ReturnType<typeof setTimeout>[] = [];

    intervals.forEach((delay, idx) => {
      const t = setTimeout(() => {
        setCompletedSteps(prev => new Set([...prev, idx]));
        setCurrentStep(idx + 1);
      }, delay);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, [active]);

  useEffect(() => {
    if (completedStepId === "ready") {
      setCompletedSteps(new Set([0, 1, 2, 3, 4, 5, 6]));
      setCurrentStep(steps.length);
    }
  }, [completedStepId, steps.length]);

  if (!active) return null;

  return (
    <div className="w-full py-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 text-center">Processing Pipeline</p>
      <div className="flex flex-col gap-0">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isDone = completedSteps.has(idx);
          const isActive = currentStep === idx;
          const isPending = idx > currentStep;

          return (
            <div key={step.id} className="flex items-start gap-3">
              {/* Step node */}
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all duration-500 flex-shrink-0 ${
                  isDone
                    ? `${step.bgColor} ${step.borderColor} shadow-[0_0_12px_rgba(52,211,153,0.15)]`
                    : isActive
                    ? `${step.bgColor} ${step.borderColor} animate-pulse`
                    : "bg-white/4 border-white/8"
                }`}>
                  {isDone ? (
                    <CheckCircle2 className={`h-4 w-4 ${step.color}`} />
                  ) : isActive ? (
                    <Loader2 className={`h-4 w-4 ${step.color} animate-spin`} />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-px flex-1 min-h-[20px] my-1 transition-all duration-500 ${
                    isDone ? `bg-gradient-to-b from-current to-transparent ${step.color} opacity-40` : "bg-white/6"
                  }`} />
                )}
              </div>

              {/* Step content */}
              <div className={`pb-4 flex-1 transition-all duration-300 ${isPending ? "opacity-30" : "opacity-100"}`}>
                <p className={`text-sm font-semibold transition-colors duration-300 ${isDone ? step.color : isActive ? "text-white" : "text-muted-foreground"}`}>
                  {step.label}
                  {isDone && <span className="ml-2 text-[10px] font-mono opacity-60">✓ done</span>}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{step.detail}</p>
                {isActive && (
                  <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${step.bgColor.replace('/12', '')} animate-[pulse_1s_ease-in-out_infinite] w-3/4`} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
