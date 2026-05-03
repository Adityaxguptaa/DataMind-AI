import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cpu, Zap, Brain, Activity } from "lucide-react";

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

    const NODE_COUNT = 55;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2.5 + 1,
      pulse: Math.random() * Math.PI * 2,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.025;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      });
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const alpha = (1 - dist / 150) * 0.25;
            const grad = ctx.createLinearGradient(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
            grad.addColorStop(0, `rgba(99,179,237,${alpha})`);
            grad.addColorStop(1, `rgba(167,139,250,${alpha})`);
            ctx.beginPath(); ctx.strokeStyle = grad; ctx.lineWidth = 0.8;
            ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
          }
        }
      }
      nodes.forEach(n => {
        const pulse = (Math.sin(n.pulse) + 1) / 2;
        const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3);
        grd.addColorStop(0, `rgba(147,197,253,${0.6 + pulse * 0.4})`);
        grd.addColorStop(1, "rgba(147,197,253,0)");
        ctx.beginPath(); ctx.fillStyle = grd;
        ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `rgba(219,234,254,${0.7 + pulse * 0.3})`;
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login({ email, password });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({ title: "Login Failed", description: error.message || "Invalid credentials", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#050810]">
      <NeuralCanvas />

      {/* Ambient orbs */}
      <div className="fixed top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-600/10 blur-[120px] animate-orb-1 pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-violet-600/10 blur-[100px] animate-orb-2 pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass-card rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4 glow-blue">
              <Brain className="h-8 w-8 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold gradient-text mb-1">DataMind AI</h1>
            <p className="text-muted-foreground text-sm">Sign in to your intelligence workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input
                id="email" type="email" placeholder="you@example.com" required
                value={email} onChange={e => setEmail(e.target.value)}
                className="bg-white/5 border-white/10 focus:border-blue-500/50 focus:bg-white/8 h-11 transition-all"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Password</Label>
              <Input
                id="password" type="password" required
                value={password} onChange={e => setPassword(e.target.value)}
                className="bg-white/5 border-white/10 focus:border-blue-500/50 focus:bg-white/8 h-11 transition-all"
                data-testid="input-password"
              />
            </div>

            <Button
              className="w-full h-11 font-semibold relative overflow-hidden group bg-blue-600 hover:bg-blue-500 border-0"
              type="submit" disabled={loading} data-testid="button-login"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <><Activity className="h-4 w-4 animate-spin" /> Authenticating...</>
                ) : (
                  <><Zap className="h-4 w-4" /> Sign In</>
                )}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-violet-600 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity bg-[size:200%] animate-shimmer" />
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-blue-400 hover:text-blue-300 font-medium transition-colors" data-testid="link-register">
              Create account
            </Link>
          </div>

          {/* Feature pills */}
          <div className="mt-8 flex gap-2 justify-center flex-wrap">
            {["RAG Documents", "AI Analysis", "Chart Builder", "4 AI Tools"].map(f => (
              <span key={f} className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 border border-white/8 text-muted-foreground font-mono">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
