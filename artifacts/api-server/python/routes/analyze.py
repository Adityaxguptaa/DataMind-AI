import uuid
import os
import json
import asyncio
import aiofiles
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from database import get_db
from models.db_models import DataSource, Analysis, AnalysisResult, Chart, Anomaly, AgentLog, PdfReport, User
from models.schemas import AnalyzeRequest
from pydantic import BaseModel
from typing import Optional
from auth.dependencies import get_current_user
from config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["analyze"])


@router.post("/data-sources/upload")
@router.post("/upload")
async def upload_data_file(file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    filename = file.filename or "data.csv"
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ["csv", "xlsx", "xls", "pdf"]:
        raise HTTPException(status_code=400, detail="Only CSV, Excel, and PDF files are supported")
    upload_dir = os.path.join(settings.upload_dir, "data")
    os.makedirs(upload_dir, exist_ok=True)
    ds_id = str(uuid.uuid4())
    safe_name = f"{ds_id}_{filename}"
    file_path = os.path.join(upload_dir, safe_name)
    content = await file.read()
    if len(content) > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)
    row_count = None
    column_names = []
    column_types = {}
    pdf_page_count = None
    raw_text_preview = None
    extraction_method = "direct"
    try:
        if ext in ["csv", "xlsx", "xls"]:
            import pandas as pd
            df = pd.read_excel(file_path) if ext in ["xlsx", "xls"] else pd.read_csv(file_path)
            row_count = len(df)
            column_names = list(df.columns)
            column_types = {col: str(dtype) for col, dtype in df.dtypes.items()}
        elif ext == "pdf":
            extraction_method = "pdfplumber"
            try:
                import pdfplumber
                with pdfplumber.open(file_path) as pdf:
                    pdf_page_count = len(pdf.pages)
                    all_text = []
                    for page in pdf.pages:
                        table = page.extract_table()
                        if table:
                            import pandas as pd
                            df = pd.DataFrame(table[1:], columns=table[0])
                            row_count = (row_count or 0) + len(df)
                            column_names = list(set(column_names + list(df.columns)))
                        text = page.extract_text()
                        if text:
                            all_text.append(text)
                    raw_text_preview = " ".join(all_text)[:2000]
            except Exception:
                import fitz
                doc = fitz.open(file_path)
                pdf_page_count = doc.page_count
                texts = [page.get_text() for page in doc]
                raw_text_preview = " ".join(texts)[:2000]
                doc.close()
                extraction_method = "pymupdf"
    except Exception as e:
        logger.warning(f"Error extracting file metadata: {e}")
    ds = DataSource(
        id=ds_id, user_id=current_user.id, filename=filename, file_type=ext,
        file_path=file_path, row_count=row_count, column_names=column_names,
        column_types=column_types, extraction_method=extraction_method,
        pdf_page_count=pdf_page_count, raw_text_preview=raw_text_preview,
        file_size_bytes=len(content),
    )
    db.add(ds)
    await db.commit()
    return {"data_source_id": ds_id, "filename": filename, "file_type": ext, "row_count": row_count, "column_names": column_names, "pdf_page_count": pdf_page_count}


@router.post("/analyze")
async def start_analysis(req: AnalyzeRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    ds_result = await db.execute(select(DataSource).where(DataSource.id == req.data_source_id, DataSource.user_id == current_user.id))
    ds = ds_result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    analysis = Analysis(
        id=str(uuid.uuid4()), user_id=current_user.id, data_source_id=req.data_source_id,
        user_query=req.user_query, selected_columns=req.selected_columns, status="running",
    )
    db.add(analysis)
    await db.commit()
    asyncio.create_task(_run_analysis_bg(analysis.id, ds.file_path, ds.file_type, req.user_query, req.selected_columns, current_user.id))
    return {"analysis_id": analysis.id, "status": "running"}


async def _run_analysis_bg(analysis_id: str, file_path: str, file_type: str, query: str, selected_columns: list, user_id: str):
    from database import AsyncSessionLocal
    from services.gemini_client import generate_text
    try:
        import pandas as pd
        import numpy as np
        if file_type in ["csv"]:
            df = pd.read_csv(file_path)
        elif file_type in ["xlsx", "xls"]:
            df = pd.read_excel(file_path)
        else:
            async with AsyncSessionLocal() as db:
                await db.execute(update(Analysis).where(Analysis.id == analysis_id).values(status="failed", error_message="PDF analysis requires text extraction"))
                await db.commit()
            return
        if selected_columns:
            cols = [c for c in selected_columns if c in df.columns]
            if cols:
                df = df[cols]

        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        cat_cols = df.select_dtypes(include=["object", "category", "bool"]).columns.tolist()

        # ── Anomaly detection ──
        anomalies_found = []
        for col in numeric_cols[:5]:
            col_data = df[col].dropna()
            if len(col_data) > 10:
                mean, std = col_data.mean(), col_data.std()
                if std > 0:
                    z_scores = ((col_data - mean) / std).abs()
                    for idx in z_scores[z_scores > 3].index[:3]:
                        anomalies_found.append({"column": col, "row_index": int(idx), "value": str(df[col].iloc[idx]), "z_score": float(z_scores[idx])})

        # ── Build rich dataset context for the AI ──

        # 1. Column info
        col_info_lines = []
        for col in df.columns:
            dtype = str(df[col].dtype)
            null_count = int(df[col].isna().sum())
            if col in numeric_cols:
                lo, hi = df[col].dropna().min(), df[col].dropna().max()
                mean_val = df[col].dropna().mean()
                col_info_lines.append(f"  {col} [{dtype}] range=[{lo:.4g}, {hi:.4g}] mean={mean_val:.4g} nulls={null_count}")
            else:
                nuniq = df[col].nunique()
                col_info_lines.append(f"  {col} [{dtype}] unique={nuniq} nulls={null_count}")
        col_info = "\n".join(col_info_lines)

        # 2. Value counts for categorical columns
        vc_lines = []
        for col in cat_cols[:6]:
            vc = df[col].value_counts().head(10)
            vc_str = ", ".join(f"{v}:{c}" for v, c in vc.items())
            vc_lines.append(f"  {col}: {vc_str}")
        value_counts_section = "\n".join(vc_lines) if vc_lines else "  (no categorical columns)"

        # 3. Detect specific rows/IDs mentioned in the query
        import re
        numbers_in_query = [int(m) for m in re.findall(r'\b(\d+)\b', query)]
        specific_rows_section = ""
        if numbers_in_query:
            found_rows = []
            for num in numbers_in_query[:3]:
                # Check if it's a valid row index
                if 0 <= num < len(df):
                    row = df.iloc[num]
                    row_dict = {}
                    for c, v in row.items():
                        if hasattr(v, 'item'):
                            v = v.item()
                        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                            v = None
                        row_dict[c] = v
                    found_rows.append(f"  Row index {num}: {json.dumps(row_dict, default=str)}")
                # Also search for this number as a value in ID-like columns
                for col in df.columns:
                    col_lower = col.lower()
                    if any(k in col_lower for k in ["id", "passenger", "no", "num", "index", "row"]):
                        matches = df[df[col] == num]
                        if not matches.empty:
                            for _, row in matches.head(2).iterrows():
                                row_dict = {}
                                for c, v in row.items():
                                    if hasattr(v, 'item'):
                                        v = v.item()
                                    if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                                        v = None
                                    row_dict[c] = v
                                found_rows.append(f"  {col}={num}: {json.dumps(row_dict, default=str)}")
            if found_rows:
                specific_rows_section = "SPECIFIC ROWS MATCHING THE QUERY:\n" + "\n".join(found_rows)

        # 4. Sample data — first 50 rows as CSV text (or full dataset if small)
        sample_size = min(50, len(df))
        sample_df = df.head(sample_size).copy()
        # Sanitize: replace NaN/inf with empty string for display
        for col in sample_df.select_dtypes(include=[np.number]).columns:
            sample_df[col] = sample_df[col].apply(
                lambda x: None if (isinstance(x, float) and (np.isnan(x) or np.isinf(x))) else x
            )
        sample_csv = sample_df.to_csv(index=True, index_label="row_index")

        # 5. Correlation for numeric cols
        corr_section = ""
        if len(numeric_cols) >= 2:
            corr = df[numeric_cols[:8]].corr().round(3)
            corr_section = "CORRELATION MATRIX:\n" + corr.to_string()

        data_context = f"""DATASET: {len(df)} rows × {len(df.columns)} columns

COLUMNS:
{col_info}

CATEGORICAL VALUE COUNTS (top 10 each):
{value_counts_section}

{specific_rows_section}

SAMPLE DATA (first {sample_size} rows, row_index = position in file starting at 0):
{sample_csv[:4000]}

{corr_section[:1000] if corr_section else ""}"""

        prompt = f"""You are an expert data analyst with DIRECT ACCESS to the following dataset. \
Answer the user's question using the actual data provided — do not make things up.

{data_context}

USER QUERY: {query}

INSTRUCTIONS:
- If the query asks about a specific row, passenger, record or ID, look it up in the SPECIFIC ROWS section or SAMPLE DATA and report the EXACT values from the data.
- If asking about survival/outcome/category for a specific record, state the exact value from the data.
- Provide concrete numbers, not vague summaries.
- executive_summary should directly answer the question in 2-3 sentences using actual data values.
- insights should be 4-6 specific findings backed by numbers from the data.
- recommendations should be 2-4 actionable items.

Respond ONLY with valid JSON (no markdown, no code block), with these exact keys:
{{"executive_summary": "...", "insights": ["...", "..."], "trends": ["..."], "recommendations": ["..."], "confidence_score": 0.9, "chart_recommendations": [{{"type": "bar|line|scatter|pie|histogram|box", "x_col": "<exact column name from the dataset>", "y_col": "<exact column name or null>", "color_by": "<groupby column name or null>", "title": "<descriptive chart title>", "reason": "<why this chart best answers the query>"}}]}}

CRITICAL for chart_recommendations: Include 2-4 charts that DIRECTLY answer the user's query. Pick the BEST chart type for the data relationship. For categorical vs numeric use bar charts. For trends use line charts. For distributions use histogram. For relationships use scatter. For proportions use pie."""
        response = await generate_text(prompt)
        try:
            start = response.find("{")
            end = response.rfind("}") + 1
            insights = json.loads(response[start:end]) if start >= 0 else {"executive_summary": response, "insights": [], "trends": [], "recommendations": [], "confidence_score": 0.7}
        except Exception:
            insights = {"executive_summary": response[:500], "insights": [], "trends": [], "recommendations": [], "confidence_score": 0.7}
        import plotly.graph_objects as go
        import plotly.io as pio

        def _fig_to_json_safe(figure) -> dict:
            """Convert plotly figure to a pure-Python dict (no numpy types)."""
            return json.loads(pio.to_json(figure))

        def _build_smart_chart(rec: dict) -> dict | None:
            ctype = rec.get("type", "histogram")
            xcol = rec.get("x_col")
            ycol = rec.get("y_col")
            cby = rec.get("color_by")
            title = rec.get("title", "Chart")
            if xcol and xcol not in df.columns: xcol = None
            if ycol and ycol not in df.columns: ycol = None
            if cby and cby not in df.columns: cby = None
            try:
                if ctype == "histogram":
                    col = xcol or (numeric_cols[0] if numeric_cols else None)
                    if not col: return None
                    fig = go.Figure(data=go.Histogram(x=df[col].dropna().tolist(), nbinsx=25, name=col))
                    fig.update_layout(title=title, xaxis_title=col, yaxis_title="Count")
                elif ctype == "bar":
                    if xcol and ycol:
                        grp = df.groupby(xcol)[ycol].mean().reset_index()
                        fig = go.Figure(data=go.Bar(x=grp[xcol].astype(str).tolist(), y=grp[ycol].tolist(), name=ycol))
                        fig.update_layout(title=title, xaxis_title=xcol, yaxis_title=f"Mean {ycol}")
                    elif xcol:
                        vc = df[xcol].value_counts().head(15)
                        fig = go.Figure(data=go.Bar(x=vc.index.astype(str).tolist(), y=vc.values.tolist()))
                        fig.update_layout(title=title, xaxis_title=xcol, yaxis_title="Count")
                    else:
                        return None
                elif ctype == "line":
                    if xcol and ycol:
                        sorted_df = df[[xcol, ycol]].dropna().sort_values(xcol)
                        fig = go.Figure(data=go.Scatter(x=sorted_df[xcol].tolist(), y=sorted_df[ycol].tolist(), mode="lines+markers"))
                        fig.update_layout(title=title, xaxis_title=xcol, yaxis_title=ycol)
                    elif ycol:
                        fig = go.Figure(data=go.Scatter(y=df[ycol].dropna().tolist(), mode="lines"))
                        fig.update_layout(title=title, yaxis_title=ycol)
                    else:
                        return None
                elif ctype == "scatter":
                    if not (xcol and ycol): return None
                    sc_kw = dict(x=df[xcol].fillna(0).tolist(), y=df[ycol].fillna(0).tolist(), mode="markers")
                    if cby:
                        sc_kw["text"] = df[cby].astype(str).tolist()
                        sc_kw["marker"] = dict(color=df[cby].factorize()[0].tolist(), colorscale="Viridis", showscale=True)
                    fig = go.Figure(data=go.Scatter(**sc_kw))
                    fig.update_layout(title=title, xaxis_title=xcol, yaxis_title=ycol)
                elif ctype == "pie":
                    col = xcol or (cat_cols[0] if cat_cols else None)
                    if not col: return None
                    vc = df[col].value_counts().head(10)
                    fig = go.Figure(data=go.Pie(labels=vc.index.astype(str).tolist(), values=vc.values.tolist()))
                    fig.update_layout(title=title)
                elif ctype == "box":
                    if ycol and xcol:
                        fig = go.Figure(data=go.Box(x=df[xcol].astype(str).tolist(), y=df[ycol].tolist()))
                    elif ycol:
                        fig = go.Figure(data=go.Box(y=df[ycol].dropna().tolist(), name=ycol))
                    elif xcol:
                        fig = go.Figure(data=go.Box(y=df[xcol].dropna().tolist(), name=xcol))
                    else:
                        return None
                    fig.update_layout(title=title)
                else:
                    return None
                return {"chart_type": ctype, "title": title, "plotly_json": _fig_to_json_safe(fig)}
            except Exception:
                return None

        chart_recs = insights.get("chart_recommendations", [])
        if not chart_recs:
            chart_recs = []
            if numeric_cols:
                chart_recs.append({"type": "histogram", "x_col": numeric_cols[0], "title": f"Distribution of {numeric_cols[0]}"})
            if cat_cols and numeric_cols:
                chart_recs.append({"type": "bar", "x_col": cat_cols[0], "y_col": numeric_cols[0], "title": f"{numeric_cols[0]} by {cat_cols[0]}"})
            elif len(numeric_cols) >= 2:
                chart_recs.append({"type": "scatter", "x_col": numeric_cols[0], "y_col": numeric_cols[1], "title": f"{numeric_cols[0]} vs {numeric_cols[1]}"})

        charts_data = []
        for rec in chart_recs[:4]:
            built = _build_smart_chart(rec)
            if built:
                charts_data.append(built)
        async with AsyncSessionLocal() as db:
            result_obj = AnalysisResult(
                id=str(uuid.uuid4()), analysis_id=analysis_id,
                insights_json=insights, executive_summary=insights.get("executive_summary", ""),
                confidence_score=insights.get("confidence_score", 0.7),
                anomaly_report_json={"anomalies": anomalies_found},
            )
            db.add(result_obj)
            for i, ch in enumerate(charts_data):
                chart = Chart(
                    id=str(uuid.uuid4()), analysis_id=analysis_id, user_id=user_id,
                    chart_type=ch["chart_type"], title=ch["title"],
                    plotly_json=ch["plotly_json"], chart_order=i,
                )
                db.add(chart)
            for anom in anomalies_found:
                a = Anomaly(
                    id=str(uuid.uuid4()), analysis_id=analysis_id, user_id=user_id,
                    column_name=anom["column"], row_index=anom["row_index"],
                    anomalous_value=str(anom["value"]), z_score=anom["z_score"],
                    detection_method="z_score", severity="high" if anom["z_score"] > 4 else "medium",
                )
                db.add(a)
            await db.execute(update(Analysis).where(Analysis.id == analysis_id).values(status="completed", completed_at=datetime.utcnow()))
            await db.execute(update(User).where(User.id == user_id).values(total_analyses=User.total_analyses + 1))
            await db.commit()
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        async with AsyncSessionLocal() as db:
            await db.execute(update(Analysis).where(Analysis.id == analysis_id).values(status="failed", error_message=str(e)))
            await db.commit()


@router.get("/analysis/{analysis_id}")
async def get_analysis(analysis_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == current_user.id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    results_q = await db.execute(select(AnalysisResult).where(AnalysisResult.analysis_id == analysis_id))
    analysis_result = results_q.scalar_one_or_none()
    charts_q = await db.execute(select(Chart).where(Chart.analysis_id == analysis_id).order_by(Chart.chart_order))
    charts = charts_q.scalars().all()
    anomalies_q = await db.execute(select(Anomaly).where(Anomaly.analysis_id == analysis_id))
    anomalies = anomalies_q.scalars().all()
    return {
        "id": analysis.id, "status": analysis.status, "user_query": analysis.user_query,
        "created_at": analysis.created_at, "completed_at": analysis.completed_at,
        "result": {
            "insights": analysis_result.insights_json if analysis_result else None,
            "executive_summary": analysis_result.executive_summary if analysis_result else None,
            "confidence_score": analysis_result.confidence_score if analysis_result else None,
            "anomaly_report": analysis_result.anomaly_report_json if analysis_result else None,
        } if analysis_result else None,
        "charts": [{"id": c.id, "chart_type": c.chart_type, "title": c.title, "plotly_json": c.plotly_json} for c in charts],
        "anomalies": [{"column_name": a.column_name, "row_index": a.row_index, "anomalous_value": a.anomalous_value, "z_score": a.z_score, "severity": a.severity} for a in anomalies],
    }


@router.get("/analyses")
async def list_analyses(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Analysis).where(Analysis.user_id == current_user.id).order_by(Analysis.created_at.desc()).limit(20))
    analyses = result.scalars().all()
    return [{"id": a.id, "status": a.status, "user_query": a.user_query, "created_at": a.created_at, "completed_at": a.completed_at} for a in analyses]


@router.get("/data-sources")
async def list_data_sources(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        result = await db.execute(
            select(DataSource)
            .where(DataSource.user_id == current_user.id, DataSource.deleted_at == None)
            .order_by(DataSource.uploaded_at.desc())
        )
    except Exception:
        result = await db.execute(
            select(DataSource)
            .where(DataSource.user_id == current_user.id)
            .order_by(DataSource.uploaded_at.desc())
        )
    sources = result.scalars().all()

    def _get_preview(s: DataSource):
        try:
            import pandas as pd
            import math
            if s.file_type == "csv":
                df = pd.read_csv(s.file_path, nrows=6)
            elif s.file_type in ("xlsx", "xls"):
                df = pd.read_excel(s.file_path, nrows=6)
            else:
                return None
            cols = list(df.columns)

            def _safe(v):
                if v is None:
                    return None
                # unwrap numpy scalars
                if hasattr(v, "item"):
                    v = v.item()
                if isinstance(v, float):
                    if math.isnan(v) or math.isinf(v):
                        return None
                return v

            rows = [[_safe(cell) for cell in row] for row in df.itertuples(index=False, name=None)]
            return {"columns": cols, "rows": rows}
        except Exception:
            return None

    out = []
    for s in sources:
        preview_data = _get_preview(s)
        out.append({
            "id": s.id,
            "filename": s.filename,
            "file_type": s.file_type,
            "row_count": s.row_count,
            "column_names": s.column_names,
            "uploaded_at": s.uploaded_at,
            "preview": preview_data["rows"] if preview_data else None,
        })
    return out


class ChartBuildRequest(BaseModel):
    data_source_id: str
    chart_type: str
    x_col: str
    y_col: Optional[str] = None
    color_col: Optional[str] = None


@router.post("/chart/build")
async def build_chart(req: ChartBuildRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Instantly build a chart from a data source without AI analysis."""
    ds_result = await db.execute(select(DataSource).where(DataSource.id == req.data_source_id, DataSource.user_id == current_user.id))
    ds = ds_result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")

    import pandas as pd
    import numpy as np
    import plotly.graph_objects as go
    import plotly.express as px
    import plotly.io as pio

    def _safe_json(fig) -> dict:
        return json.loads(pio.to_json(fig))

    try:
        if ds.file_type == "csv":
            df = pd.read_csv(ds.file_path)
        elif ds.file_type in ("xlsx", "xls"):
            df = pd.read_excel(ds.file_path)
        else:
            raise HTTPException(status_code=400, detail="Only CSV and Excel files support chart building")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

    if req.x_col not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{req.x_col}' not found in dataset")

    chart_type = req.chart_type.lower()
    x = req.x_col
    y = req.y_col if req.y_col and req.y_col in df.columns else None

    try:
        fig = None

        if chart_type == "histogram":
            col_data = df[x].dropna()
            if pd.api.types.is_numeric_dtype(col_data):
                fig = go.Figure(go.Histogram(x=col_data.tolist(), nbinsx=30, name=x,
                                              marker_color="#60a5fa", opacity=0.85))
                fig.update_layout(title=f"Distribution of {x}", xaxis_title=x, yaxis_title="Count",
                                   bargap=0.05)
            else:
                vc = col_data.value_counts().head(20)
                fig = go.Figure(go.Bar(x=vc.index.tolist(), y=vc.values.tolist(),
                                        marker_color="#60a5fa", opacity=0.85))
                fig.update_layout(title=f"Value Counts — {x}", xaxis_title=x, yaxis_title="Count")

        elif chart_type == "bar":
            if y:
                agg = df.groupby(x)[y].mean().reset_index().sort_values(y, ascending=False).head(25)
                colors = ["#60a5fa","#a78bfa","#34d399","#f87171","#fb923c","#e879f9","#facc15","#38bdf8"]
                bar_colors = [colors[i % len(colors)] for i in range(len(agg))]
                fig = go.Figure(go.Bar(x=agg[x].tolist(), y=agg[y].tolist(), marker_color=bar_colors, opacity=0.9))
                fig.update_layout(title=f"{x} vs {y} (mean)", xaxis_title=x, yaxis_title=f"Avg {y}")
            else:
                vc = df[x].value_counts().head(20)
                fig = go.Figure(go.Bar(x=vc.index.tolist(), y=vc.values.tolist(), marker_color="#a78bfa", opacity=0.9))
                fig.update_layout(title=f"{x} — Value Counts", xaxis_title=x, yaxis_title="Count")

        elif chart_type == "line":
            if y:
                df_sorted = df[[x, y]].dropna().sort_values(x)
                fig = go.Figure(go.Scatter(x=df_sorted[x].tolist(), y=df_sorted[y].tolist(),
                                             mode="lines+markers", line=dict(color="#60a5fa", width=2),
                                             marker=dict(size=4, color="#a78bfa")))
                fig.update_layout(title=f"{y} over {x}", xaxis_title=x, yaxis_title=y)
            else:
                col_data = df[x].dropna()
                fig = go.Figure(go.Scatter(x=list(range(len(col_data))), y=col_data.tolist(),
                                             mode="lines", line=dict(color="#60a5fa", width=2)))
                fig.update_layout(title=f"{x} over index", xaxis_title="Row Index", yaxis_title=x)

        elif chart_type == "scatter":
            if y:
                sample = df[[x, y]].dropna()
                if len(sample) > 5000:
                    sample = sample.sample(5000, random_state=42)
                fig = go.Figure(go.Scatter(x=sample[x].tolist(), y=sample[y].tolist(),
                                             mode="markers",
                                             marker=dict(color="#60a5fa", size=5, opacity=0.6)))
                fig.update_layout(title=f"{x} vs {y}", xaxis_title=x, yaxis_title=y)
            else:
                col_data = df[x].dropna()
                fig = go.Figure(go.Scatter(x=list(range(len(col_data))), y=col_data.tolist(),
                                             mode="markers", marker=dict(color="#60a5fa", size=4, opacity=0.6)))
                fig.update_layout(title=f"{x} vs index", xaxis_title="Row Index", yaxis_title=x)

        elif chart_type == "box":
            col_data = df[x].dropna()
            fig = go.Figure(go.Box(y=col_data.tolist(), name=x,
                                    marker_color="#a78bfa", boxmean="sd",
                                    line=dict(color="#a78bfa")))
            fig.update_layout(title=f"Box Plot — {x}", yaxis_title=x)

        elif chart_type == "pie":
            vc = df[x].dropna().value_counts().head(12)
            fig = go.Figure(go.Pie(
                labels=vc.index.tolist(),
                values=vc.values.tolist(),
                hole=0.4,
                marker=dict(colors=["#60a5fa","#a78bfa","#34d399","#f87171","#fb923c","#e879f9","#facc15","#38bdf8","#818cf8","#2dd4bf","#f97316","#c084fc"]),
            ))
            fig.update_layout(title=f"{x} — Distribution", showlegend=True)

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported chart type: {chart_type}")

        if fig is None:
            raise HTTPException(status_code=400, detail="Could not generate chart for this column/type combination")

        return {"plotly_json": _safe_json(fig), "chart_type": chart_type, "x_col": x, "y_col": y}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chart build error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chart generation failed: {str(e)}")


@router.websocket("/ws/analysis/{analysis_id}")
async def analysis_websocket(websocket: WebSocket, analysis_id: str):
    from services.websocket_manager import connect, disconnect, listen_and_forward
    await connect(analysis_id, websocket)
    try:
        await listen_and_forward(analysis_id, websocket)
    except WebSocketDisconnect:
        await disconnect(analysis_id)
