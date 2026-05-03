import { useRef, useState } from "react";
import { ImageIcon, Loader2, X, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadButtonProps {
  onExtracted: (text: string) => void;
  question?: string;
  label?: string;
  className?: string;
  accept?: string;
}

export function ImageUploadButton({
  onExtracted,
  question = "Extract ALL text, code, and information from this image exactly as written.",
  label,
  className = "",
  accept = "image/*",
}: ImageUploadButtonProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files supported", variant: "destructive" });
      return;
    }
    setState("loading");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("question", question);
    try {
      const res = await api.post<any>("/vision/extract", fd);
      if (res.text) {
        onExtracted(res.text);
        setState("done");
        setTimeout(() => setState("idle"), 3000);
      } else {
        throw new Error("No text extracted");
      }
    } catch (e: any) {
      toast({ title: "Image extraction failed", description: e.message, variant: "destructive" });
      setState("idle");
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileRef}
        className="hidden"
        accept={accept}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={state === "loading"}
        title={state === "done" ? "Image context added!" : "Upload image to extract text/code"}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
          state === "done"
            ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
            : state === "loading"
            ? "bg-white/5 border border-white/10 text-muted-foreground cursor-wait opacity-60"
            : "bg-white/5 border border-white/10 text-muted-foreground hover:text-white hover:bg-white/10 hover:border-white/20"
        } ${className}`}
      >
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "done" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
      </button>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </>
  );
}
