import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface SpeechButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export function SpeechButton({ onTranscript, className = "" }: SpeechButtonProps) {
  const [state, setState] = useState<"idle" | "listening" | "recording" | "processing">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const hasWebSpeech = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const tryWebSpeech = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => setState("listening");
    recognition.onend = () => setState("idle");
    recognition.onerror = (e: any) => {
      setState("idle");
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "network") {
        startWhisper();
      }
    };
    recognition.onresult = (event: any) => {
      const t = event.results[0][0].transcript;
      if (t) onTranscript(t);
    };
    try { recognition.start(); } catch { setState("idle"); startWhisper(); }
  };

  const startWhisper = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg" });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setState("processing");
        const mime = chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 500) { setState("idle"); return; }
        const fd = new FormData();
        fd.append("file", blob, `audio.${mime.includes("ogg") ? "ogg" : "webm"}`);
        try {
          const res = await api.post<any>("/transcribe", fd);
          if (res.text) onTranscript(res.text);
        } catch {}
        finally { setState("idle"); }
      };
      mr.start(250);
      recorderRef.current = mr;
      setState("recording");
    } catch { setState("idle"); }
  };

  const stopWhisper = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const handleClick = () => {
    if (state === "idle") {
      if (hasWebSpeech) tryWebSpeech();
      else startWhisper();
    } else if (state === "recording") {
      stopWhisper();
    }
  };

  const tip =
    state === "idle" ? (hasWebSpeech ? "Click to speak" : "Click to record audio, click again to transcribe") :
    state === "listening" ? "Listening… speak now" :
    state === "recording" ? "Recording… click to stop & transcribe" :
    "Transcribing with AI…";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "processing"}
      title={tip}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
        state !== "idle"
          ? "bg-red-500/20 border border-red-500/40 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.25)]"
          : "bg-white/5 border border-white/10 text-muted-foreground hover:text-white hover:bg-white/10 hover:border-white/20"
      } ${state === "processing" ? "cursor-wait opacity-60" : ""} ${className}`}
    >
      {state === "processing" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === "recording" ? (
        <Square className="h-3.5 w-3.5 animate-pulse fill-current" />
      ) : (
        <Mic className={`h-4 w-4 ${state === "listening" ? "animate-pulse" : ""}`} />
      )}
    </button>
  );
}
