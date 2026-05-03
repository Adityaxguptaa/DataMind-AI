import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { BarChart2, FileText, Bot, Cpu, LayoutDashboard, LogOut, Brain, ChevronRight, Menu, Code2, Briefcase } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-blue-400', glow: 'rgba(59,130,246,0.25)' },
  { href: '/analyst', label: 'Data Analyst', icon: BarChart2, color: 'text-cyan-400', glow: 'rgba(34,211,238,0.25)' },
  { href: '/documents', label: 'Documents', icon: FileText, color: 'text-indigo-400', glow: 'rgba(129,140,248,0.25)' },
  { href: '/chatbot', label: 'AI Chatbot', icon: Bot, color: 'text-violet-400', glow: 'rgba(167,139,250,0.25)' },
  { href: '/playground', label: 'HF Playground', icon: Cpu, color: 'text-emerald-400', glow: 'rgba(52,211,153,0.25)' },
  { href: '/code-review', label: 'Code Review', icon: Code2, color: 'text-orange-400', glow: 'rgba(249,115,22,0.25)' },
  { href: '/resume', label: 'Resume Scanner', icon: Briefcase, color: 'text-pink-400', glow: 'rgba(236,72,153,0.25)' },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = (user?.full_name || user?.username || 'U')
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center flex-shrink-0"
            style={{ boxShadow: '0 0 16px rgba(59,130,246,0.2)' }}>
            <Brain className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="font-bold text-sm tracking-wide text-white">DataMind AI</p>
            <p className="text-[10px] text-muted-foreground font-mono">Intelligence Platform</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 pb-2 pt-1">Modules</p>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = location === item.href || location.startsWith(item.href + '/');
          return (
            <Link
              key={item.href} href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive ? 'active bg-white/8 text-white' : 'text-muted-foreground hover:bg-white/5 hover:text-white'
              }`}
              style={isActive ? { boxShadow: `inset 0 0 20px ${item.glow}` } : {}}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                isActive ? 'bg-white/10' : 'bg-transparent group-hover:bg-white/5'
              }`}>
                <Icon className={`h-4 w-4 ${isActive ? item.color : 'text-muted-foreground group-hover:' + item.color}`} />
              </div>
              <span>{item.label}</span>
              {isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/4 border border-white/6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/30 to-violet-500/30 border border-white/10 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.username || 'User'}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user?.email || ''}</p>
          </div>
          <button onClick={logout}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-muted-foreground flex items-center justify-center transition-all"
            title="Sign out">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#05080f] overflow-hidden">
      <div className="fixed inset-0 bg-grid opacity-40 pointer-events-none" />
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px] pointer-events-none translate-x-1/4 translate-y-1/4" />

      <aside className="relative z-20 w-60 flex-shrink-0 border-r border-white/5 hidden md:flex flex-col"
        style={{ background: 'linear-gradient(180deg, rgba(5,8,16,0.98) 0%, rgba(8,12,24,0.98) 100%)' }}>
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 w-60 h-full border-r border-white/5" style={{ background: 'rgba(5,8,16,0.98)' }}>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#05080f]/80 backdrop-blur-sm">
          <button onClick={() => setMobileOpen(true)} className="text-muted-foreground hover:text-white">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-white flex items-center gap-2">
            <Brain className="h-4 w-4 text-blue-400" /> DataMind AI
          </span>
        </div>
        <main className="flex-1 overflow-y-auto p-5 md:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
