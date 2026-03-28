"""
OPAX — Open Parliamentary Accountability eXchange
https://opax.com.au

Launch case study: Gambling Reform in Australia
Usage: uv run dashboard.py
"""

import json
import sqlite3
from pathlib import Path

import gradio as gr
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

DB_PATH = Path.home() / ".cache" / "autoresearch" / "parli.db"
GREEN, GOLD, DARK_BG, PANEL_BG = "#00843D", "#FFD700", "#0d1117", "#161b22"

GAMBLING_WHERE = """(
    lower(text) LIKE '%gambling%' OR lower(text) LIKE '%poker machine%'
    OR lower(text) LIKE '%pokies%' OR lower(text) LIKE '%betting%'
    OR lower(text) LIKE '%wagering%'
)"""

PARTY_COLORS = {
    "ALP": "#E13A3A", "LP": "#1C4FA0", "LIB": "#1C4FA0", "LNP": "#1C4FA0",
    "AG": "#00843D", "GRN": "#00843D", "Greens": "#00843D",
    "Nats": "#006644", "NP": "#006644", "NATS": "#006644",
    "IND": "#888888",
}

TOPIC_KEYWORDS = {
    "Gambling": "gambling,poker machine,pokies,betting,wagering",
    "Housing": "housing,rent,mortgage,affordable housing,homelessness",
    "Climate": "climate,emissions,carbon,renewable,global warming",
    "Immigration": "immigration,visa,migration,refugees,asylum",
    "Cost of Living": "cost of living,grocery,energy prices,fuel,electricity",
}

TVFY_POLICY_URL = (
    "https://theyvoteforyou.org.au/api/v1/policies/39.json"
    "?key=b%2BiPzux7zTSPPV33hrKE"
)

def get_conn():
    return sqlite3.connect(str(DB_PATH))


def query_df(sql, params=None):
    try:
        with get_conn() as conn:
            return pd.read_sql_query(sql, conn, params=params or [])
    except Exception:
        return pd.DataFrame()


def normalise_party(p):
    if not p:
        return "Other"
    p = p.strip()
    mapping = {"LP": "Liberal", "LIB": "Liberal", "LNP": "Liberal",
               "ALP": "Labor", "AG": "Greens", "GRN": "Greens",
               "Nats": "Nationals", "NP": "Nationals", "NATS": "Nationals",
               "IND": "Independent"}
    return mapping.get(p, "Other")


NORM_PARTY_COLORS = {
    "Labor": "#E13A3A", "Liberal": "#1C4FA0", "Greens": "#00843D",
    "Nationals": "#006644", "Independent": "#888888", "Other": "#555555",
}


def fetch_tvfy_policy():
    """Read TheyVoteForYou policy 39 from local cache only. No live API calls."""
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT value FROM analysis_cache WHERE key='tvfy_policy_39'")
            row = cur.fetchone()
            if row:
                return json.loads(row[0])
    except Exception:
        pass
    return None


def count_topic_speeches(keywords):
    clauses = " OR ".join(f"lower(text) LIKE '%{kw}%'" for kw in keywords.split(","))
    df = query_df(f"SELECT COUNT(*) as n FROM speeches WHERE ({clauses})")
    return int(df.iloc[0]["n"]) if not df.empty else 0


def count_topic_divisions(keywords):
    clauses = " OR ".join(f"lower(name) LIKE '%{kw}%'" for kw in keywords.split(","))
    df = query_df(f"SELECT COUNT(*) as n FROM divisions WHERE ({clauses})")
    return int(df.iloc[0]["n"]) if not df.empty else 0


# -- Tab 1: Hot Topics -------------------------------------------------------

def build_hot_topics_html():
    cards = []
    for topic, kws in TOPIC_KEYWORDS.items():
        n_speeches = count_topic_speeches(kws)
        n_divisions = count_topic_divisions(kws)
        disconnect = "TBD"
        cards.append(f"""
        <div style="background:{PANEL_BG}; border:1px solid #30363d; border-radius:12px;
                    padding:24px; min-width:200px; flex:1;">
            <h3 style="color:{GOLD}; margin:0 0 8px 0;">{topic}</h3>
            <p style="color:#c9d1d9; margin:4px 0;"><b>{n_speeches:,}</b> speeches</p>
            <p style="color:#c9d1d9; margin:4px 0;"><b>{n_divisions}</b> divisions</p>
            <p style="color:#8b949e; margin:4px 0;">Disconnect score: {disconnect}</p>
        </div>""")
    return f"""<div style="display:flex; flex-wrap:wrap; gap:16px; padding:8px;">
        {''.join(cards)}</div>"""


# -- Tab 2: Gambling Deep Dive -----------------------------------------------

def build_timeline():
    df = query_df(f"""
        SELECT substr(date,1,4) as year, party, COUNT(*) as n
        FROM speeches WHERE {GAMBLING_WHERE} AND date IS NOT NULL
        GROUP BY year, party ORDER BY year
    """)
    if df.empty:
        return _empty_fig("No gambling speeches found.")
    else:
        df["party_label"] = df["party"].apply(normalise_party)
        df["color"] = df["party_label"].map(NORM_PARTY_COLORS).fillna("#555")
        agg = df.groupby(["year", "party_label", "color"], as_index=False)["n"].sum()
        fig = px.bar(agg, x="year", y="n", color="party_label",
                     color_discrete_map=NORM_PARTY_COLORS,
                     labels={"n": "Speeches", "year": "Year",
                             "party_label": "Party"})
        # Overlay division dates
        divs = query_df("""SELECT date, name FROM divisions
                           WHERE lower(name) LIKE '%gambling%'
                           OR lower(name) LIKE '%betting%'
                           OR lower(name) LIKE '%poker%'
                           OR lower(name) LIKE '%wagering%'""")
        for _, row in divs.iterrows():
            yr = str(row["date"])[:4] if row["date"] else None
            if yr:
                fig.add_vline(x=yr, line_dash="dash", line_color=GOLD,
                              annotation_text=str(row["name"])[:40],
                              annotation_font_color=GOLD,
                              annotation_font_size=9)
    fig.update_layout(template="plotly_dark", paper_bgcolor=DARK_BG,
                      plot_bgcolor=PANEL_BG, barmode="stack",
                      title="Gambling-Related Speeches per Year by Party",
                      margin=dict(l=40, r=40, t=50, b=40))
    return fig


def _parse_tvfy_people(policy):
    """Extract {lowercase_name: {agreement, party, name}} from TVFY policy."""
    people = {}
    for pv in policy.get("people_comparisons", []):
        person = pv.get("person", {})
        name = person.get("latest_member", {}).get("name", {})
        full = f"{name.get('first', '')} {name.get('last', '')}".strip()
        agr = pv.get("agreement")
        if full and agr is not None:
            people[full.lower()] = {"agreement": float(agr), "name": full,
                                     "party": person.get("latest_member", {}).get("party", "")}
    return people


def _empty_fig(msg="Data unavailable."):
    fig = go.Figure()
    fig.add_annotation(text=msg, showarrow=False, font=dict(color="white", size=16),
                       xref="paper", yref="paper", x=0.5, y=0.5)
    fig.update_layout(template="plotly_dark", paper_bgcolor=DARK_BG, plot_bgcolor=PANEL_BG)
    return fig


def build_talk_vs_vote():
    policy = fetch_tvfy_policy()
    speech_counts = query_df(f"""
        SELECT speaker_name, party, COUNT(*) as speeches
        FROM speeches WHERE {GAMBLING_WHERE} AND speaker_name != ''
        GROUP BY speaker_name, party
    """)
    if policy is None or speech_counts.empty:
        return _empty_fig("Voting data unavailable.")
    people_votes = _parse_tvfy_people(policy)

    rows = []
    for _, r in speech_counts.iterrows():
        key = r["speaker_name"].replace(", MP", "").replace(", Senator", "").strip()
        parts = key.split(", ")
        lookup = f"{parts[-1]} {parts[0]}".strip().lower() if len(parts) >= 2 else key.lower()
        vdata = people_votes.get(lookup)
        if vdata:
            rows.append({"name": vdata["name"], "speeches": r["speeches"],
                         "agreement": vdata["agreement"],
                         "party": normalise_party(r["party"])})

    if not rows:
        return _empty_fig("No matched MPs between speeches and voting data.")

    mdf = pd.DataFrame(rows)
    fig = px.scatter(mdf, x="speeches", y="agreement", color="party",
                     hover_name="name", color_discrete_map=NORM_PARTY_COLORS,
                     labels={"speeches": "Gambling Speeches",
                             "agreement": "Voting Agreement % (restrictions)",
                             "party": "Party"})
    # Highlight quadrant: many speeches, low agreement
    med_speeches = mdf["speeches"].median()
    fig.add_shape(type="rect", x0=med_speeches, x1=mdf["speeches"].max() * 1.1,
                  y0=-5, y1=50, fillcolor="red", opacity=0.07, line_width=0)
    fig.add_annotation(text="Talks a lot, votes against restrictions",
                       x=mdf["speeches"].max() * 0.85, y=25,
                       font=dict(color="#ff6b6b", size=10), showarrow=False)
    fig.update_layout(template="plotly_dark", paper_bgcolor=DARK_BG,
                      plot_bgcolor=PANEL_BG,
                      title="Who Talks vs Who Votes on Gambling Reform",
                      margin=dict(l=40, r=40, t=50, b=40))
    return fig


def build_party_breakdown():
    policy = fetch_tvfy_policy()
    if policy is None:
        return _empty_fig("Voting data unavailable.")
    party_scores = {}
    for name, data in _parse_tvfy_people(policy).items():
        party = normalise_party(data["party"])
        party_scores.setdefault(party, []).append(data["agreement"])

    rows = [{"party": p, "avg_agreement": sum(v) / len(v), "mp_count": len(v)}
            for p, v in party_scores.items() if len(v) >= 3]
    if not rows:
        return _empty_fig("Not enough data (need 3+ MPs per party).")

    pdf = pd.DataFrame(rows).sort_values("avg_agreement")
    colors = [NORM_PARTY_COLORS.get(p, "#555") for p in pdf["party"]]
    fig = go.Figure(go.Bar(y=pdf["party"], x=pdf["avg_agreement"],
                           orientation="h", marker_color=colors,
                           text=[f"{v:.0f}% ({n} MPs)" for v, n in
                                 zip(pdf["avg_agreement"], pdf["mp_count"])],
                           textposition="auto"))
    fig.update_layout(template="plotly_dark", paper_bgcolor=DARK_BG,
                      plot_bgcolor=PANEL_BG,
                      title="Average Agreement with Gambling Restrictions by Party",
                      xaxis_title="Agreement %",
                      margin=dict(l=100, r=40, t=50, b=40))
    return fig


def load_gambling_speeches():
    df = query_df(f"""
        SELECT date, speaker_name as Speaker, party as Party,
               topic as Topic, substr(text, 1, 200) as Preview
        FROM speeches WHERE {GAMBLING_WHERE} AND speaker_name != ''
        ORDER BY date DESC LIMIT 2000
    """)
    return df

def get_mp_list():
    df = query_df("""SELECT DISTINCT speaker_name FROM speeches
                     WHERE speaker_name != '' AND speaker_name NOT LIKE '%direction%'
                     ORDER BY speaker_name""")
    return df["speaker_name"].tolist() if not df.empty else []


def mp_lookup(mp_name):
    if not mp_name:
        return "Select an MP above.", pd.DataFrame()
    count_df = query_df(f"""SELECT COUNT(*) as n FROM speeches
                            WHERE speaker_name=? AND {GAMBLING_WHERE}""", [mp_name])
    n = int(count_df.iloc[0]["n"]) if not count_df.empty else 0
    party_df = query_df("SELECT party FROM speeches WHERE speaker_name=? LIMIT 1",
                        [mp_name])
    party = party_df.iloc[0]["party"] if not party_df.empty else "Unknown"

    # TVFY voting info
    vote_info = ""
    policy = fetch_tvfy_policy()
    if policy:
        key_parts = mp_name.replace(", MP", "").replace(", Senator", "").split(", ")
        lookup = f"{key_parts[-1]} {key_parts[0]}".strip().lower() if len(key_parts) >= 2 else mp_name.lower()
        for pv in policy.get("people_comparisons", []):
            pname = pv.get("person", {}).get("latest_member", {}).get("name", {})
            full = f"{pname.get('first', '')} {pname.get('last', '')}".strip().lower()
            if full == lookup:
                vote_info = f"\n\n**Voting agreement with gambling restrictions:** {pv.get('agreement', 'N/A')}%"
                break

    summary = f"### {mp_name}\n**Party:** {party}  |  **Gambling speeches:** {n}{vote_info}"

    speeches_df = query_df(f"""
        SELECT date, topic as Topic, text as Text
        FROM speeches WHERE speaker_name=? AND {GAMBLING_WHERE}
        ORDER BY date DESC LIMIT 50
    """, [mp_name])
    return summary, speeches_df

THEME = gr.themes.Base(
    primary_hue=gr.themes.colors.green,
    secondary_hue=gr.themes.colors.yellow,
    neutral_hue=gr.themes.colors.gray,
    font=gr.themes.GoogleFont("Inter"),
).set(
    body_background_fill=DARK_BG,
    body_background_fill_dark=DARK_BG,
    block_background_fill=PANEL_BG,
    block_background_fill_dark=PANEL_BG,
    button_primary_background_fill=GREEN,
    button_primary_background_fill_dark=GREEN,
)

CSS = f"""
.gradio-container {{ max-width: 1200px !important; }}
h1 {{ color: {GOLD} !important; }}
h2, h3 {{ color: {GREEN} !important; }}
"""

with gr.Blocks(title="OPAX - Open Parliamentary Accountability eXchange") as demo:
    gr.Markdown(
        f"""<h1 style="text-align:center; color:{GOLD};">OPAX</h1>
        <p style="text-align:center; color:#8b949e; font-size:1.1em;">
        Open Parliamentary Accountability eXchange &mdash;
        <a href="https://opax.com.au" style="color:{GREEN};">opax.com.au</a></p>"""
    )

    with gr.Tabs():
        # -- Tab 1: Hot Topics --
        with gr.Tab("Hot Topics"):
            gr.Markdown("## Tracking What Parliament Says vs How It Votes")
            gr.HTML(build_hot_topics_html)
            gr.Markdown("*Select the **Gambling Deep Dive** tab for the full case study.*",
                        elem_classes=["text-center"])

        # -- Tab 2: Gambling Deep Dive --
        with gr.Tab("Gambling Deep Dive"):
            gr.Markdown("## Gambling Reform: The Full Picture")
            gr.Markdown("### A. Timeline of Gambling Speeches")
            gr.Plot(build_timeline)
            gr.Markdown("### B. Who Talks vs Who Votes")
            gr.Plot(build_talk_vs_vote)
            gr.Markdown("### C. Party Breakdown")
            gr.Plot(build_party_breakdown)
            gr.Markdown("### D. The Speeches")
            gr.Dataframe(load_gambling_speeches, interactive=False, wrap=True,
                         max_height=500)

        # -- Tab 3: MP Lookup --
        with gr.Tab("MP Lookup"):
            gr.Markdown("## Look Up Any MP's Gambling Record")
            mp_dropdown = gr.Dropdown(choices=get_mp_list(),
                                      label="Select an MP", filterable=True)
            mp_summary = gr.Markdown()
            mp_speeches = gr.Dataframe(interactive=False, wrap=True, max_height=500)
            mp_dropdown.change(fn=mp_lookup, inputs=mp_dropdown,
                               outputs=[mp_summary, mp_speeches])

        # -- Tab 4: About --
        with gr.Tab("About"):
            gr.Markdown(f"""
## About OPAX

**OPAX (Open Parliamentary Accountability eXchange)** makes it easy to see whether
elected representatives follow through on what they say in Parliament. We cross-reference
**what MPs say** (Hansard) with **how they vote** (TheyVoteForYou.org.au) to surface
gaps between rhetoric and action.

### Launch Case Study: Gambling Reform
Australia loses more to gambling per capita than any other country. OPAX makes it
simple to see which MPs talk about reform but vote against restrictions.

### Data Sources
- **Australian Hansard** -- Official parliamentary speeches (1998--2025)
- **TheyVoteForYou.org.au** -- Voting records and policy analysis (Policy 39)
- Database contains {query_df("SELECT COUNT(*) as n FROM speeches").iloc[0]["n"]:,} speeches

*Built with Australian parliamentary data. All data is public record.*
""")

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
