"""
parli.ui.dashboard — Gradio dashboard for Parliamentary Intelligence Platform.

Pre-built analysis panels + natural language query via LLM.

Tabs:
  1. Hypocrisy Tracker — speech-vote consistency scores with quotes
  2. Faction Map — UMAP visualization of voting clusters
  3. Bias Report — speaking time, gender, interjection charts
  4. Topic Pulse — topic prevalence over time, who drives what
  5. Sentiment — tone changes, toxicity rankings
  6. Predictions — will MP X vote for bill Y?
  7. Semantic Search — find speeches by meaning, not keywords
  8. Raw SQL — power-user query interface

Usage:
    python -m parli.ui.dashboard
    # or
    uv run python -m parli.ui.dashboard
"""

import json

import gradio as gr
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from parli.schema import get_db, init_db


# ── Theme ──────────────────────────────────────────────────────────────────

NAVY = "#0f0f23"
DARK = "#1a1a2e"
GOLD = "#FFD700"
GREEN = "#00843D"
RED = "#E13A3A"

THEME = gr.themes.Base(
    primary_hue=gr.themes.colors.yellow,
    secondary_hue=gr.themes.colors.green,
    neutral_hue=gr.themes.colors.gray,
    font=gr.themes.GoogleFont("Inter"),
).set(
    body_background_fill=NAVY,
    body_background_fill_dark=NAVY,
    block_background_fill=DARK,
    block_background_fill_dark=DARK,
    button_primary_background_fill=GREEN,
    button_primary_background_fill_dark=GREEN,
)


# ── Data loading helpers ──────────────────────────────────────────────────

def get_consistency_data():
    """Load precomputed consistency scores."""
    db = get_db()
    rows = db.execute("""
        SELECT result_json FROM analysis_cache
        WHERE analysis_type = 'consistency'
        ORDER BY cache_key
    """).fetchall()
    data = []
    for r in rows:
        d = json.loads(r["result_json"])
        data.append({
            "Name": d.get("name", ""),
            "Party": d.get("party", ""),
            "Consistency": d.get("score", -1),
            "Contradictions": len(d.get("contradictions", [])),
            "Matched Votes": d.get("total_matched", 0),
        })
    return pd.DataFrame(data)


def get_topic_time_series():
    """Load topic prevalence time series."""
    db = get_db()
    row = db.execute("""
        SELECT result_json FROM analysis_cache
        WHERE cache_key = 'topics:time_series'
    """).fetchone()
    if not row:
        return pd.DataFrame()

    data = json.loads(row["result_json"])
    series = data.get("time_series", {})

    rows = []
    for topic, entries in series.items():
        for e in entries:
            rows.append({"month": e["month"], "topic": topic, "count": e["count"]})
    return pd.DataFrame(rows)


def get_speaking_time_data():
    """Load speaking time analysis."""
    db = get_db()
    row = db.execute("""
        SELECT result_json FROM analysis_cache
        WHERE analysis_type = 'bias_speaking_time'
        ORDER BY computed_at DESC LIMIT 1
    """).fetchone()
    if not row:
        return {}
    return json.loads(row["result_json"])


def get_toxicity_ranking():
    """Get MPs ranked by average sentiment."""
    db = get_db()
    rows = db.execute("""
        SELECT m.name, m.party,
               ROUND(AVG(s.sentiment_score), 3) as avg_sentiment,
               COUNT(*) as n_speeches
        FROM speeches s
        JOIN members m ON s.member_id = m.member_id
        WHERE s.sentiment_score IS NOT NULL
        GROUP BY m.member_id
        HAVING n_speeches >= 10
        ORDER BY avg_sentiment ASC
        LIMIT 30
    """).fetchall()
    return pd.DataFrame([dict(r) for r in rows])


# ── Plot builders ──────────────────────────────────────────────────────────

def build_consistency_plot():
    df = get_consistency_data()
    if df.empty:
        fig = go.Figure()
        fig.add_annotation(text="No consistency data yet. Run: python -m parli.analysis.consistency",
                           showarrow=False, font=dict(size=14, color="white"),
                           xref="paper", yref="paper", x=0.5, y=0.5)
    else:
        df = df[df["Consistency"] >= 0].sort_values("Consistency")
        fig = px.bar(df.head(30), x="Consistency", y="Name", color="Party",
                     orientation="h", title="Speech-Vote Consistency (lower = more contradictions)",
                     color_discrete_map={"Labor": RED, "Liberal": "#0047AB",
                                         "Greens": GREEN, "Nationals": "#006644"})
    fig.update_layout(template="plotly_dark", paper_bgcolor=NAVY, plot_bgcolor=DARK,
                      height=600)
    return fig


def build_topic_plot():
    df = get_topic_time_series()
    if df.empty:
        fig = go.Figure()
        fig.add_annotation(text="No topic data yet. Run: python -m parli.analysis.topics --track",
                           showarrow=False, font=dict(size=14, color="white"),
                           xref="paper", yref="paper", x=0.5, y=0.5)
    else:
        fig = px.line(df, x="month", y="count", color="topic",
                      title="Topic Prevalence Over Time (speeches per month)")
    fig.update_layout(template="plotly_dark", paper_bgcolor=NAVY, plot_bgcolor=DARK,
                      height=500)
    return fig


def build_speaking_time_plot():
    data = get_speaking_time_data()
    if not data:
        fig = go.Figure()
        fig.add_annotation(text="No speaking time data. Run: python -m parli.analysis.bias",
                           showarrow=False, font=dict(size=14, color="white"),
                           xref="paper", yref="paper", x=0.5, y=0.5)
    else:
        by_party = data.get("by_party", [])
        if by_party:
            df = pd.DataFrame(by_party)
            df["hours"] = df["total_seconds"] / 3600
            fig = px.bar(df, x="party", y="hours", color="party",
                         title="Total Speaking Hours by Party")
        else:
            fig = go.Figure()
    fig.update_layout(template="plotly_dark", paper_bgcolor=NAVY, plot_bgcolor=DARK)
    return fig


def build_sentiment_plot():
    df = get_toxicity_ranking()
    if df.empty:
        fig = go.Figure()
        fig.add_annotation(text="No sentiment data. Run: python -m parli.analysis.sentiment",
                           showarrow=False, font=dict(size=14, color="white"),
                           xref="paper", yref="paper", x=0.5, y=0.5)
    else:
        fig = px.bar(df, x="avg_sentiment", y="name", color="party",
                     orientation="h", title="Most Hostile MPs (lowest average sentiment)",
                     color_discrete_map={"Labor": RED, "Liberal": "#0047AB",
                                         "Greens": GREEN, "Nationals": "#006644"})
    fig.update_layout(template="plotly_dark", paper_bgcolor=NAVY, plot_bgcolor=DARK,
                      height=600)
    return fig


# ── Semantic search ────────────────────────────────────────────────────────

def semantic_search(query: str, top_k: int = 10):
    """Search speeches by semantic meaning."""
    if not query.strip():
        return pd.DataFrame()
    try:
        from parli.embeddings import search
        results = search(query, top_k=top_k)
        return pd.DataFrame(results)
    except Exception as e:
        return pd.DataFrame([{"error": str(e)}])


# ── SQL query ──────────────────────────────────────────────────────────────

def run_sql(query: str):
    """Run a raw SQL query against the database."""
    if not query.strip():
        return pd.DataFrame()
    db = get_db()
    try:
        rows = db.execute(query).fetchall()
        if rows:
            return pd.DataFrame([dict(r) for r in rows])
        return pd.DataFrame([{"result": "Query returned no rows"}])
    except Exception as e:
        return pd.DataFrame([{"error": str(e)}])


# ── Dashboard summary ──────────────────────────────────────────────────────

def get_summary():
    db = get_db()
    try:
        members = db.execute("SELECT COUNT(*) FROM members").fetchone()[0]
        speeches = db.execute("SELECT COUNT(*) FROM speeches").fetchone()[0]
        divisions = db.execute("SELECT COUNT(*) FROM divisions").fetchone()[0]
        votes = db.execute("SELECT COUNT(*) FROM votes").fetchone()[0]
        return (f"**Database:** {members} members | {speeches} speeches | "
                f"{divisions} divisions | {votes} individual votes")
    except Exception:
        return "**Database not initialized.** Run: `python -m parli.schema`"


# ── Build UI ──────────────────────────────────────────────────────────────

def build_app():
    with gr.Blocks(theme=THEME, title="Parliamentary Intelligence Platform") as demo:
        gr.Markdown("# Parliamentary Intelligence Platform")
        gr.Markdown("Cross-referencing Hansard speeches against voting records in the Australian Parliament")
        summary = gr.Markdown(value=get_summary)

        with gr.Tab("Hypocrisy Tracker"):
            gr.Markdown("### Speech-Vote Consistency\n"
                        "Does an MP's rhetoric match their voting record?")
            consistency_plot = gr.Plot(value=build_consistency_plot)
            consistency_table = gr.Dataframe(value=get_consistency_data)

        with gr.Tab("Topic Pulse"):
            gr.Markdown("### Topic Tracking\n"
                        "How topics rise and fall over time in parliamentary debate")
            topic_plot = gr.Plot(value=build_topic_plot)

        with gr.Tab("Bias Report"):
            gr.Markdown("### Speaking Time & Bias Analysis")
            speaking_plot = gr.Plot(value=build_speaking_time_plot)

        with gr.Tab("Sentiment"):
            gr.Markdown("### Tone & Toxicity\n"
                        "Who is the most hostile in debate?")
            sentiment_plot = gr.Plot(value=build_sentiment_plot)

        with gr.Tab("Semantic Search"):
            gr.Markdown("### Search speeches by meaning")
            with gr.Row():
                search_box = gr.Textbox(label="Query", placeholder="e.g. climate action hypocrisy")
                search_btn = gr.Button("Search", variant="primary")
            search_results = gr.Dataframe()
            search_btn.click(fn=semantic_search, inputs=search_box, outputs=search_results)

        with gr.Tab("SQL Query"):
            gr.Markdown("### Power user: run raw SQL against the database")
            sql_box = gr.Textbox(label="SQL", lines=3,
                                 placeholder="SELECT name, party, COUNT(*) as speeches FROM members m JOIN speeches s ON m.member_id = s.member_id GROUP BY m.member_id ORDER BY speeches DESC LIMIT 20")
            sql_btn = gr.Button("Run", variant="primary")
            sql_results = gr.Dataframe()
            sql_btn.click(fn=run_sql, inputs=sql_box, outputs=sql_results)
            gr.Examples(
                examples=[
                    ["SELECT party, COUNT(*) as n, SUM(word_count) as total_words FROM speeches s JOIN members m ON s.member_id = m.member_id GROUP BY party ORDER BY total_words DESC"],
                    ["SELECT name, party, COUNT(*) as votes FROM members m JOIN votes v ON m.member_id = v.member_id GROUP BY m.member_id ORDER BY votes DESC LIMIT 20"],
                    ["SELECT date, COUNT(*) as speeches FROM speeches GROUP BY date ORDER BY speeches DESC LIMIT 20"],
                ],
                inputs=sql_box,
            )

    return demo


def main():
    demo = build_app()
    demo.launch(server_name="0.0.0.0", server_port=7861)


if __name__ == "__main__":
    main()
