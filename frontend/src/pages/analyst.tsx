import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  UploadCloud, File, Activity, AlertTriangle, CheckCircle2,
  BarChart2, Sparkles, ChevronRight, TrendingUp, Table2,
  BarChart, ScatterChart, LineChart, PieChart, BoxSelect,
  Trash2, RefreshCw, Download, ChevronDown,
} from "lucide-react";

const COLORS = ["#60a5fa","#a78bfa","#34d399","#f87171","#fb923c","#e879f9","#facc15","#38bdf8"];

const CHART_TYPES = [
  { id: "histogram", label: "Histogram", icon: BarChart, axes: ["x_col"], hint: "Distribution of one numeric column" },
  { id: "bar",       label: "Bar Chart", icon: BarChart2, axes: ["x_col","y_col"], hint: "Category vs numeric value" },
  { id: "line",      label: "Line Chart", icon: LineChart, axes: ["x_col","y_col"], hint: "Trend over an index/time column" },
  { id: "scatter",   label: "Scatter Plot", icon: ScatterChart, axes: ["x_col","y_col"], hint: "Two numeric columns" },
  { id: "box",       label: "Box Plot", icon: BoxSelect, axes: ["x_col"], hint: "Spread & outliers of one numeric column" },
  { id: "pie",       label: "Pie Chart", icon: PieChart, axes: ["x_col"], hint: "Top categories by count" },
];

function PlotlyChart({ plotlyJson, height = 320 }: { plotlyJson: any; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current || !plotlyJson) return;
    let cancelled = false;
    import("plotly.js-dist-min").then((Plotly: any) => {
      if (cancelled || !containerRef.current) return;
      Plotly.newPlot(containerRef.current, plotlyJson.data || [], {
        ...(plotlyJson.layout || {}),
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "#94a3b8", family: "Inter, sans-serif", size: 12 },
        xaxis: { ...(plotlyJson.layout?.xaxis || {}), gridcolor: "rgba(255,255,255,0.06)", linecolor: "rgba(255,255,255,0.1)", tickfont: { color: "#64748b" } },
        yaxis: { ...(plotlyJson.layout?.yaxis || {}), gridcolor: "rgba(255,255,255,0.06)", linecolor: "rgba(255,255,255,0.1)", tickfont: { color: "#64748b" } },
        legend: { font: { color: "#94a3b8" }, bgcolor: "rgba(0,0,0,0)" },
        autosize: true,
        margin: { t: 48, r: 20, b: 56, l: 64 },
        colorway: COLORS,
      }, { responsive: true, displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ["select2d","lasso2d"] });
    });
    return () => {
      cancelled = true;
      import("plotly.js-dist-min").then((Plotly: any) => {
        if (containerRef.current) Plotly.purge(containerRef.current);
      });
    };
  }, [plotlyJson]);
  return <div ref={containerRef} style={{ width: "100%", height: `${height}px` }} />;
}

function DataPreview({ columns, preview }: { columns: string[]; preview: any[][] }) {
  if (!columns.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/6">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/6 bg-white/3">
            {columns.map(c => (
              <th key={c} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.map((row, i) => (
            <tr key={i} className="border-b border-white/4 hover:bg-white/3 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-foreground/70 font-mono whitespace-nowrap max-w-[160px] truncate">
                  {cell === null || cell === undefined ? <span className="text-muted-foreground/40">—</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Analyst() {
  const { toast } = useToast();
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);

  // Chart builder state
  const [builderType, setBuilderType] = useState("histogram");
  const [builderXCol, setBuilderXCol] = useState("");
  const [builderYCol, setBuilderYCol] = useState("");
  const [builderChart, setBuilderChart] = useState<any>(null);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"builder"|"ai">("builder");

  useEffect(() => { fetchDataSources(); fetchAnalyses(); }, []);

  useEffect(() => {
    if (selectedSource?.column_names?.length) {
      setBuilderXCol(selectedSource.column_names[0] || "");
      setBuilderYCol(selectedSource.column_names[1] || selectedSource.column_names[0] || "");
    }
    setBuilderChart(null);
  }, [selectedSource]);

  const fetchDataSources = async () => {
    try {
      const d = await api.get<any[]>("/data-sources");
      setDataSources(d || []);
    } catch {}
  };

  const fetchAnalyses = async () => {
    try {
      const d = await api.get<any[]>("/analyses");
      setAnalyses(d || []);
    } catch {}
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post<any>("/data-sources/upload", formData);
      toast({ title: "Upload successful", description: `${res.filename} — ${res.row_count ?? "?"} rows ready.` });
      await fetchDataSources();
      // Auto-select the new source
      const fresh = await api.get<any[]>("/data-sources");
      const match = (fresh || []).find((s: any) => s.id === res.data_source_id);
      if (match) setSelectedSource(match);
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleBuildChart = async () => {
    if (!selectedSource || !builderXCol) return;
    setBuilderLoading(true);
    setBuilderChart(null);
    try {
      const res = await api.post<any>("/chart/build", {
        data_source_id: selectedSource.id,
        chart_type: builderType,
        x_col: builderXCol,
        y_col: builderYCol || null,
      });
      setBuilderChart(res.plotly_json);
    } catch (error: any) {
      toast({ title: "Chart Error", description: error.message, variant: "destructive" });
    } finally {
      setBuilderLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedSource || !query.trim()) return;
    setLoading(true);
    setCurrentAnalysis({ status: "running", user_query: query });
    try {
      const res = await api.post<any>("/analyze", { data_source_id: selectedSource.id, user_query: query });
      pollAnalysis(res.analysis_id);
    } catch (error: any) {
      toast({ title: "Analysis Failed", description: error.message, variant: "destructive" });
      setLoading(false);
      setCurrentAnalysis(null);
    }
  };

  const pollAnalysis = useCallback((id: string) => {
    const iv = setInterval(async () => {
      try {
        const res = await api.get<any>(`/analysis/${id}`);
        setCurrentAnalysis(res);
        if (res.status === "completed" || res.status === "failed") {
          clearInterval(iv);
          setLoading(false);
          fetchAnalyses();
          if (res.status === "completed") setActiveTab("ai");
        }
      } catch { clearInterval(iv); setLoading(false); }
    }, 2000);
  }, []);

  const loadHistoricAnalysis = async (id: string) => {
    try {
      const res = await api.get<any>(`/analysis/${id}`);
      setCurrentAnalysis(res);
      setActiveTab("ai");
    } catch {}
  };

  const cols = selectedSource?.column_names || [];
  const chartTypeDef = CHART_TYPES.find(c => c.id === builderType)!;
  const needsY = chartTypeDef?.axes.includes("y_col");

  const getSummary = (a: any) => a?.result?.executive_summary || a?.executive_summary || null;
  const getInsights = (a: any) => {
    const ins = a?.result?.insights;
    if (!ins) return [];
    if (Array.isArray(ins)) return ins;
    if (typeof ins === "object" && Array.isArray(ins.insights)) return ins.insights;
    return [];
  };
  const getRecommendations = (a: any) => {
    const r = a?.result?.insights?.recommendations || a?.result?.recommendations;
    if (!r) return [];
    if (Array.isArray(r)) return r;
    return [];
  };

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-1">
            <BarChart2 className="h-3.5 w-3.5 text-cyan-400" /> Data Analyst Agent
          </div>
          <h1 className="text-2xl font-bold text-white">AI-Powered Data Analysis</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-cyan-400 font-mono bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-full">
          <Sparkles className="h-3 w-3" /> Groq · Llama 3.3
        </div>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-5">
        {/* ─── Left sidebar ─── */}
        <div className="space-y-4">
          {/* Upload */}
          <div className="glass-card rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-cyan-400" /> Data Source
            </h3>
            <label className="block border-2 border-dashed border-white/10 rounded-xl p-4 text-center cursor-pointer hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all relative group">
              <input type="file" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                onChange={handleFileUpload} disabled={uploading} accept=".csv,.xlsx,.xls" />
              <UploadCloud className={`h-6 w-6 mx-auto mb-1.5 ${uploading ? "text-cyan-400 animate-pulse" : "text-muted-foreground group-hover:text-cyan-400"} transition-colors`} />
              <p className="text-sm font-medium text-white">{uploading ? "Uploading..." : "Drop or click"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">CSV · Excel (.xlsx / .xls)</p>
            </label>

            {dataSources.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Files</p>
                {dataSources.slice(0, 6).map(ds => (
                  <button key={ds.id} onClick={() => setSelectedSource(ds)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-2 text-sm ${
                      selectedSource?.id === ds.id
                        ? "border-cyan-500/40 bg-cyan-500/10 text-white"
                        : "border-white/6 bg-white/3 text-muted-foreground hover:text-white hover:border-white/15"
                    }`}>
                    <File className={`h-3.5 w-3.5 flex-shrink-0 ${selectedSource?.id === ds.id ? "text-cyan-400" : "text-muted-foreground"}`} />
                    <div className="overflow-hidden flex-1 min-w-0">
                      <p className="truncate font-medium text-xs">{ds.filename}</p>
                      <p className="text-[10px] text-muted-foreground">{ds.row_count != null ? `${ds.row_count.toLocaleString()} rows · ${ds.column_names?.length ?? "?"} cols` : ds.file_type?.toUpperCase()}</p>
                    </div>
                    {selectedSource?.id === ds.id && <ChevronRight className="h-3 w-3 flex-shrink-0 text-cyan-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* History */}
          {analyses.length > 0 && (
            <div className="glass-card rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-white mb-2.5 flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" /> History
              </h3>
              <div className="space-y-1">
                {analyses.slice(0, 8).map((a: any) => (
                  <button key={a.id} onClick={() => loadHistoricAnalysis(a.id)}
                    className="w-full text-left p-2 rounded-lg hover:bg-white/5 transition-all flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      a.status === "completed" ? "bg-emerald-400" : a.status === "failed" ? "bg-red-400" : "bg-cyan-400 animate-pulse"
                    }`} />
                    <p className="text-xs text-muted-foreground truncate">{a.user_query}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Main panel ─── */}
        <div className="space-y-4 min-w-0">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-white/4 rounded-xl border border-white/6 w-fit">
            {[
              { id: "builder", label: "Chart Builder", icon: BarChart },
              { id: "ai", label: "AI Analysis", icon: Sparkles },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-white/10 text-white shadow-sm"
                      : "text-muted-foreground hover:text-white"
                  }`}>
                  <Icon className="h-3.5 w-3.5" />{tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Chart Builder Tab ── */}
          {activeTab === "builder" && (
            <div className="space-y-4">
              {!selectedSource ? (
                <div className="glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-3 min-h-[420px]">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <BarChart2 className="h-8 w-8 text-cyan-400/60" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">Upload a file to start</h3>
                    <p className="text-sm text-muted-foreground">Upload a CSV or Excel file from the sidebar to build charts.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Controls */}
                  <div className="glass-card rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <BarChart className="h-4 w-4 text-cyan-400" /> Build a Chart
                      </h3>
                      <span className="text-xs text-muted-foreground font-mono bg-white/5 px-2 py-0.5 rounded-full">
                        {selectedSource.filename}
                      </span>
                    </div>

                    {/* Chart type picker */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Chart Type</p>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {CHART_TYPES.map(ct => {
                          const Icon = ct.icon;
                          return (
                            <button key={ct.id} onClick={() => setBuilderType(ct.id)}
                              title={ct.hint}
                              className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                                builderType === ct.id
                                  ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                                  : "border-white/8 bg-white/3 text-muted-foreground hover:border-white/20 hover:text-white"
                              }`}>
                              <Icon className="h-4 w-4" />
                              {ct.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">{chartTypeDef?.hint}</p>
                    </div>

                    {/* Column selectors */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">{needsY ? "X Column" : "Column"}</p>
                        <div className="relative">
                          <select value={builderXCol} onChange={e => setBuilderXCol(e.target.value)}
                            className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:outline-none pr-8">
                            {cols.map((c: string) => <option key={c} value={c} className="bg-[#0d1117]">{c}</option>)}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>
                      {needsY && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Y Column</p>
                          <div className="relative">
                            <select value={builderYCol} onChange={e => setBuilderYCol(e.target.value)}
                              className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:outline-none pr-8">
                              {cols.map((c: string) => <option key={c} value={c} className="bg-[#0d1117]">{c}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                          </div>
                        </div>
                      )}
                    </div>

                    <Button onClick={handleBuildChart} disabled={builderLoading || !builderXCol}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 border-0 font-semibold">
                      {builderLoading
                        ? <><Activity className="h-4 w-4 animate-spin mr-2" /> Generating...</>
                        : <><BarChart className="h-4 w-4 mr-2" /> Plot Chart</>}
                    </Button>
                  </div>

                  {/* Chart output */}
                  {builderChart && (
                    <div className="glass-card rounded-2xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-white/6 flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">
                          {CHART_TYPES.find(c => c.id === builderType)?.label} — {builderXCol}{needsY ? ` vs ${builderYCol}` : ""}
                        </span>
                        <button
                          onClick={() => {
                            import("plotly.js-dist-min").then((Plotly: any) => {
                              const el = document.querySelector(".builder-chart-container") as HTMLElement;
                              if (el) Plotly.downloadImage(el, { format: "png", filename: "chart" });
                            });
                          }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors">
                          <Download className="h-3.5 w-3.5" /> Export
                        </button>
                      </div>
                      <div className="p-2 builder-chart-container">
                        <PlotlyChart plotlyJson={builderChart} height={380} />
                      </div>
                    </div>
                  )}

                  {/* Data preview */}
                  {selectedSource?.preview && (
                    <div className="glass-card rounded-2xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-white/6 flex items-center gap-2">
                        <Table2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-white">Data Preview</span>
                        <span className="text-xs text-muted-foreground font-mono ml-auto">
                          {selectedSource.row_count?.toLocaleString()} rows · {cols.length} columns
                        </span>
                      </div>
                      <div className="p-4">
                        <DataPreview columns={cols} preview={selectedSource.preview} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── AI Analysis Tab ── */}
          {activeTab === "ai" && (
            <div className="space-y-4">
              {/* Query box */}
              <div className="glass-card rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-400" /> Ask About Your Data
                </h3>
                {!selectedSource && (
                  <p className="text-xs text-muted-foreground">Select a file from the sidebar first.</p>
                )}
                <div className="flex gap-2">
                  <Input placeholder="e.g. What are the key trends? Are there any anomalies?"
                    value={query} onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAnalyze()}
                    className="bg-white/5 border-white/10 focus:border-cyan-500/50 flex-1"
                    disabled={!selectedSource} />
                  <Button onClick={handleAnalyze} disabled={!selectedSource || !query.trim() || loading}
                    className="bg-cyan-600 hover:bg-cyan-500 border-0 font-semibold shrink-0">
                    {loading ? <Activity className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Show distribution of all numeric columns", "Find outliers and anomalies", "What are the top correlations?", "Summarize this dataset"].map(s => (
                    <button key={s} onClick={() => setQuery(s)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-white/4 border border-white/8 text-muted-foreground hover:text-white hover:border-white/20 transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results */}
              {currentAnalysis ? (
                <div className="glass-card rounded-2xl overflow-hidden">
                  {/* Status bar */}
                  <div className={`px-5 py-3 flex items-center justify-between border-b ${
                    currentAnalysis.status === "completed" ? "border-emerald-500/20 bg-emerald-500/5"
                    : currentAnalysis.status === "failed" ? "border-red-500/20 bg-red-500/5"
                    : "border-cyan-500/20 bg-cyan-500/5"
                  }`}>
                    <p className="font-medium text-white text-sm truncate max-w-[60%]">"{currentAnalysis.user_query}"</p>
                    <div className={`flex items-center gap-2 text-xs font-mono shrink-0 ${
                      currentAnalysis.status === "completed" ? "text-emerald-400"
                      : currentAnalysis.status === "failed" ? "text-red-400"
                      : "text-cyan-400"
                    }`}>
                      {currentAnalysis.status === "running" && <Activity className="h-3.5 w-3.5 animate-spin" />}
                      {currentAnalysis.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {currentAnalysis.status === "failed" && <AlertTriangle className="h-3.5 w-3.5" />}
                      {currentAnalysis.status}
                    </div>
                  </div>

                  <div className="p-5 space-y-6">
                    {/* Running spinner */}
                    {currentAnalysis.status === "running" && (
                      <div className="flex flex-col items-center justify-center py-14 gap-4">
                        <div className="w-14 h-14 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
                        <p className="text-muted-foreground text-sm font-mono">AI is analyzing your data...</p>
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {["Loading data","Computing stats","Detecting anomalies","Generating charts","Writing insights"].map(step => (
                            <span key={step} className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono">{step}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Failed */}
                    {currentAnalysis.status === "failed" && (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/20">
                        <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-red-300 mb-1">Analysis failed</p>
                          <p className="text-xs text-muted-foreground">{currentAnalysis.error_message || "An unexpected error occurred."}</p>
                        </div>
                      </div>
                    )}

                    {/* Executive Summary */}
                    {getSummary(currentAnalysis) && (
                      <div className="rounded-xl p-4 bg-cyan-500/8 border border-cyan-500/15">
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-2 flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5" /> Executive Summary
                        </h4>
                        <p className="text-sm text-foreground/90 leading-relaxed">{getSummary(currentAnalysis)}</p>
                      </div>
                    )}

                    {/* AI-generated charts */}
                    {currentAnalysis.charts?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                          <BarChart className="h-3.5 w-3.5" /> Auto-Generated Charts
                        </h4>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {currentAnalysis.charts.map((chart: any, i: number) => (
                            <div key={i} className="rounded-xl overflow-hidden border border-white/6 bg-white/2">
                              <p className="text-xs font-medium px-4 pt-3 pb-1 text-muted-foreground">{chart.title}</p>
                              <PlotlyChart plotlyJson={chart.plotly_json} height={260} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Insights */}
                    {getInsights(currentAnalysis).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Key Insights</h4>
                        <div className="space-y-2">
                          {getInsights(currentAnalysis).map((insight: string, i: number) => (
                            <div key={i} className="flex gap-3 p-3 rounded-xl bg-white/3 border border-white/6">
                              <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-[10px] font-bold text-cyan-400">{i + 1}</span>
                              </div>
                              <p className="text-sm text-foreground/85 leading-relaxed">{insight}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {getRecommendations(currentAnalysis).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-emerald-500/80 mb-3 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Recommendations
                        </h4>
                        <div className="space-y-2">
                          {getRecommendations(currentAnalysis).map((r: string, i: number) => (
                            <div key={i} className="flex gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-foreground/80 leading-relaxed">{r}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Anomalies */}
                    {currentAnalysis.anomalies?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-yellow-500/80 mb-3 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" /> Anomalies Detected ({currentAnalysis.anomalies.length})
                        </h4>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {currentAnalysis.anomalies.map((a: any, i: number) => (
                            <div key={i} className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-3 ${
                              a.severity === "high" ? "border-red-500/30 bg-red-500/5 text-red-300"
                              : "border-yellow-500/25 bg-yellow-500/5 text-yellow-300"
                            }`}>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${a.severity === "high" ? "bg-red-500/20" : "bg-yellow-500/20"}`}>
                                {a.severity}
                              </span>
                              <span><span className="font-bold">{a.column_name}</span> · row {a.row_index} · value {a.anomalous_value}</span>
                              {a.z_score != null && <span className="ml-auto opacity-60">z={a.z_score?.toFixed(2)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="glass-card rounded-2xl p-14 flex flex-col items-center justify-center text-center gap-3 min-h-[360px]">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Sparkles className="h-8 w-8 text-cyan-400/60" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">Ask a question</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">Type a question above and the AI will analyze your dataset, generate charts, and surface key insights.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
