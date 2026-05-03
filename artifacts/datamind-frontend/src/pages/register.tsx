import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brain, Zap, Activity } from "lucide-react";

function NeuralCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const nodes = Array.from({ length: 45 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2 + 1, pulse: Math.random() * Math.PI * 2,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.025;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      });
      for (let i = 0; i < nodes.length; i++) for (let j = i+1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 140) {
          ctx.beginPath(); ctx.strokeStyle = `rgba(139,92,246,${(1-dist/140)*0.22})`; ctx.lineWidth = 0.7;
          ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
        }
      }
      nodes.forEach(n => {
        const p = (Math.sin(n.pulse)+1)/2;
        ctx.beginPath(); ctx.fillStyle = `rgba(196,181,253,${0.5+p*0.4})`;
        ctx.arc(n.x, n.y, n.r, 0, Math.PI*2); ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
}

export default function Register() {
  const [, setLocation] = useLocation();
  const { register } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", username: "", password: "", full_name: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      setLocation("/dashboard");
    } catch (error: any) {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#050810]">
      <NeuralCanvas />
      <div className="fixed top-1/3 right-1/4 w-96 h-96 rounded-full bg-violet-600/10 blur-[120px] animate-orb-1 pointer-events-none" />
      <div className="fixed bottom-1/4 left-1/4 w-80 h-80 rounded-full bg-blue-600/8 blur-[100px] animate-orb-2 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass-card rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 mb-4 glow-purple">
              <Brain className="h-7 w-7 text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold gradient-text mb-1">Create Account</h1>
            <p className="text-muted-foreground text-sm">Join the DataMind AI platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { k: "full_name", label: "Full Name", type: "text", ph: "Your name", req: false },
              { k: "username", label: "Username", type: "text", ph: "yourname", req: true },
              { k: "email", label: "Email", type: "email", ph: "you@example.com", req: true },
              { k: "password", label: "Password", type: "password", ph: "Min 8 characters", req: true },
            ].map(f => (
              <div key={f.k} className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{f.label}</Label>
                <Input type={f.type} placeholder={f.ph} required={f.req}
                  value={(form as any)[f.k]} onChange={set(f.k)}
                  className="bg-white/5 border-white/10 focus:border-violet-500/50 h-11 transition-all"
                  data-testid={`input-${f.k}`}
                />
              </div>
            ))}

            <Button className="w-full h-11 mt-2 font-semibold bg-violet-600 hover:bg-violet-500 border-0 group relative overflow-hidden"
              type="submit" disabled={loading} data-testid="button-register">
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading
                  ? <><Activity className="h-4 w-4 animate-spin" /> Creating account...</>
                  : <><Zap className="h-4 w-4" /> Create Account</>
                }
              </span>
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
