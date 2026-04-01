"""
Chart export utility for Meta-Lingo MCP server.

Generates PNG chart images from analysis data using matplotlib, wordcloud,
networkx, and plotly. Default save path is ~/Downloads (same as UI export).
"""
import os
import datetime
from pathlib import Path
from typing import Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.cm as cm
import numpy as np


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #

def _today() -> str:
    return datetime.date.today().strftime("%Y%m%d")


def _resolve_chart_path(save_path: str, default_filename: str) -> str:
    """Resolve chart save path.

    Rules:
      - ""          → ~/Downloads/<default_filename>
      - directory   → <directory>/<default_filename>
      - path w/o ext → <path>.png
      - path with ext → used as-is
    """
    path = (save_path or "").strip()
    if not path:
        path = str(Path.home() / "Downloads")

    expanded = os.path.expanduser(path)
    if os.path.isdir(expanded):
        return os.path.join(expanded, default_filename)

    # Ensure .png extension
    _, ext = os.path.splitext(expanded)
    if not ext:
        expanded += ".png"
    return expanded


def _ensure_dir(filepath: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)


def _bar_colors(n: int) -> list:
    """Return n colors from the tab20 palette."""
    cmap = cm.get_cmap("tab20", max(n, 1))
    return [cmap(i) for i in range(n)]


# --------------------------------------------------------------------------- #
# Bar chart
# --------------------------------------------------------------------------- #

def save_bar_chart(
    items: list,
    label_key: str,
    value_key: str,
    title: str,
    save_path: str,
    *,
    default_filename: str = "",
    max_items: int = 30,
    xlabel: str = "Frequency",
    horizontal: bool = True,
) -> str:
    """Generate a horizontal or vertical bar chart and save as PNG.

    Returns the saved filepath, or "" on failure.
    """
    if not items:
        return ""
    if not default_filename:
        default_filename = f"bar_chart_{_today()}.png"

    items = items[:max_items]
    labels = [str(item.get(label_key, ""))[:35] for item in items]
    values = [float(item.get(value_key, 0)) for item in items]

    if horizontal:
        labels = labels[::-1]
        values = values[::-1]

    fig_h = max(4, len(items) * 0.38)
    fig, ax = plt.subplots(figsize=(11, fig_h))
    colors = _bar_colors(len(items))

    if horizontal:
        ax.barh(range(len(labels)), values, color=colors[::-1])
        ax.set_yticks(range(len(labels)))
        ax.set_yticklabels(labels, fontsize=8)
        ax.set_xlabel(xlabel, fontsize=10)
    else:
        ax.bar(range(len(labels)), values, color=colors)
        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels, rotation=40, ha="right", fontsize=8)
        ax.set_ylabel(xlabel, fontsize=10)

    ax.set_title(title, fontsize=12, fontweight="bold", pad=10)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    plt.tight_layout()
    filepath = _resolve_chart_path(save_path, default_filename)
    _ensure_dir(filepath)
    plt.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return filepath


# --------------------------------------------------------------------------- #
# Pie chart
# --------------------------------------------------------------------------- #

def save_pie_chart(
    items: list,
    label_key: str,
    value_key: str,
    title: str,
    save_path: str,
    *,
    default_filename: str = "",
    max_slices: int = 15,
    other_threshold: float = 0.02,
) -> str:
    """Generate a pie chart and save as PNG."""
    if not items:
        return ""
    if not default_filename:
        default_filename = f"pie_chart_{_today()}.png"

    items = items[:max_slices]
    labels = [str(item.get(label_key, ""))[:30] for item in items]
    values = [float(item.get(value_key, 0)) for item in items]
    total = sum(values)
    if total == 0:
        return ""

    # Merge tiny slices into "Other"
    keep_labels, keep_values, other_val = [], [], 0.0
    for lbl, val in zip(labels, values):
        if val / total < other_threshold and len(keep_labels) >= 8:
            other_val += val
        else:
            keep_labels.append(lbl)
            keep_values.append(val)
    if other_val:
        keep_labels.append("Other")
        keep_values.append(other_val)

    colors = _bar_colors(len(keep_labels))
    fig, ax = plt.subplots(figsize=(9, 7))
    wedges, texts, autotexts = ax.pie(
        keep_values,
        labels=None,
        colors=colors,
        autopct=lambda p: f"{p:.1f}%" if p > 3 else "",
        startangle=140,
        pctdistance=0.82,
    )
    for at in autotexts:
        at.set_fontsize(7)

    ax.legend(
        wedges, keep_labels,
        title="Categories",
        loc="center left",
        bbox_to_anchor=(1, 0, 0.5, 1),
        fontsize=8,
    )
    ax.set_title(title, fontsize=12, fontweight="bold")
    plt.tight_layout()
    filepath = _resolve_chart_path(save_path, default_filename)
    _ensure_dir(filepath)
    plt.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return filepath


# --------------------------------------------------------------------------- #
# Word cloud
# --------------------------------------------------------------------------- #

def save_wordcloud(
    items: list,
    label_key: str,
    value_key: str,
    save_path: str,
    *,
    default_filename: str = "",
    title: str = "",
    max_words: int = 200,
) -> str:
    """Generate a word cloud image and save as PNG."""
    if not items:
        return ""
    if not default_filename:
        default_filename = f"wordcloud_{_today()}.png"

    try:
        from wordcloud import WordCloud
    except ImportError:
        return ""

    freq = {}
    for item in items:
        word = str(item.get(label_key, "")).strip()
        val = float(item.get(value_key, 0))
        if word and val > 0:
            freq[word] = freq.get(word, 0) + val

    if not freq:
        return ""

    wc = WordCloud(
        width=1200, height=700,
        background_color="white",
        max_words=max_words,
        colormap="viridis",
        collocations=False,
    ).generate_from_frequencies(freq)

    fig, ax = plt.subplots(figsize=(12, 7))
    ax.imshow(wc, interpolation="bilinear")
    ax.axis("off")
    if title:
        ax.set_title(title, fontsize=12, fontweight="bold", pad=8)

    plt.tight_layout(pad=0.5)
    filepath = _resolve_chart_path(save_path, default_filename)
    _ensure_dir(filepath)
    plt.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return filepath


# --------------------------------------------------------------------------- #
# Network chart  (collocation / synonym)
# --------------------------------------------------------------------------- #

def save_network_chart(
    center_word: str,
    neighbors: list,
    label_key: str,
    value_key: str,
    title: str,
    save_path: str,
    *,
    default_filename: str = "",
    max_neighbors: int = 40,
) -> str:
    """Generate a network chart (hub-and-spoke) and save as PNG.

    `neighbors` is a list of dicts with at least label_key and value_key.
    """
    if not neighbors:
        return ""
    if not default_filename:
        default_filename = f"network_chart_{_today()}.png"

    try:
        import networkx as nx
    except ImportError:
        return ""

    neighbors = neighbors[:max_neighbors]
    scores = [float(n.get(value_key, 1)) for n in neighbors]
    min_s, max_s = min(scores), max(scores)
    rng = max_s - min_s or 1.0

    G = nx.Graph()
    G.add_node(center_word, node_type="center")
    for n in neighbors:
        lbl = str(n.get(label_key, ""))
        score = float(n.get(value_key, 1))
        G.add_node(lbl, node_type="neighbor")
        G.add_edge(center_word, lbl, weight=score)

    pos = nx.spring_layout(G, k=2.5, seed=42, weight="weight")

    fig, ax = plt.subplots(figsize=(13, 9))

    # Draw edges with width proportional to score
    for u, v, data in G.edges(data=True):
        w = (data["weight"] - min_s) / rng
        nx.draw_networkx_edges(
            G, pos, edgelist=[(u, v)],
            width=0.5 + 3.0 * w,
            alpha=0.4 + 0.5 * w,
            edge_color="#4C72B0",
            ax=ax,
        )

    # Center node
    nx.draw_networkx_nodes(
        G, pos, nodelist=[center_word],
        node_color="#E74C3C", node_size=1200, ax=ax,
    )
    # Neighbor nodes — size by score
    node_sizes = [200 + 800 * ((s - min_s) / rng) for s in scores]
    nx.draw_networkx_nodes(
        G, pos, nodelist=[str(n.get(label_key, "")) for n in neighbors],
        node_color="#4C72B0", node_size=node_sizes, alpha=0.85, ax=ax,
    )
    nx.draw_networkx_labels(G, pos, font_size=8, ax=ax)

    ax.set_title(title, fontsize=12, fontweight="bold")
    ax.axis("off")
    plt.tight_layout()
    filepath = _resolve_chart_path(save_path, default_filename)
    _ensure_dir(filepath)
    plt.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return filepath


# --------------------------------------------------------------------------- #
# Dispersion / density chart (concordance)
# --------------------------------------------------------------------------- #

def save_dispersion_chart(
    hit_positions: list,
    corpus_size: int,
    keyword: str,
    save_path: str,
    *,
    default_filename: str = "",
) -> str:
    """Generate a lexical dispersion (rug) plot and save as PNG.

    `hit_positions`: list of int, character/token positions of each hit.
    `corpus_size`: total tokens in corpus (for normalization).
    """
    if not hit_positions:
        return ""
    if not default_filename:
        default_filename = f"dispersion_{_today()}.png"

    positions = sorted(hit_positions)
    norm_positions = [p / corpus_size for p in positions] if corpus_size > 0 else positions

    fig, ax = plt.subplots(figsize=(12, 2.5))
    ax.eventplot([norm_positions], colors=["#2196F3"], linewidths=1.5)
    ax.set_xlim(0, 1)
    ax.set_xlabel("Relative position in corpus", fontsize=10)
    ax.set_yticks([])
    ax.set_title(f'Dispersion: "{keyword}" ({len(positions)} occurrences)', fontsize=12, fontweight="bold")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)

    # KDE density curve
    if len(positions) > 1:
        from matplotlib.patches import Rectangle
        xs = np.linspace(0, 1, 500)
        kde_vals = np.zeros_like(xs)
        bw = 0.05
        for p in norm_positions:
            kde_vals += np.exp(-0.5 * ((xs - p) / bw) ** 2)
        kde_vals /= kde_vals.max() or 1.0
        ax2 = ax.twinx()
        ax2.fill_between(xs, kde_vals, alpha=0.15, color="#2196F3")
        ax2.set_yticks([])
        ax2.spines["top"].set_visible(False)
        ax2.spines["right"].set_visible(False)

    plt.tight_layout()
    filepath = _resolve_chart_path(save_path, default_filename)
    _ensure_dir(filepath)
    plt.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return filepath


# --------------------------------------------------------------------------- #
# Plotly figure export (topic modeling / biblio)
# --------------------------------------------------------------------------- #

def save_plotly_chart(
    fig_dict: dict,
    save_path: str,
    default_filename: str = "",
) -> str:
    """Convert a Plotly figure dict (from API) to PNG using kaleido.

    Returns saved filepath or "" on failure.
    """
    if not fig_dict:
        return ""
    if not default_filename:
        default_filename = f"chart_{_today()}.png"

    try:
        import plotly.graph_objects as go
        fig = go.Figure(fig_dict)
        filepath = _resolve_chart_path(save_path, default_filename)
        _ensure_dir(filepath)
        fig.write_image(filepath, width=1400, height=900, scale=1.5)
        return filepath
    except Exception:
        return ""


# --------------------------------------------------------------------------- #
# Biblio general network chart (co-author / keyword-cooccur / etc.)
# --------------------------------------------------------------------------- #

def save_biblio_network(
    nodes: list,
    edges: list,
    title: str,
    save_path: str,
    *,
    default_filename: str = "",
    max_nodes: int = 60,
) -> str:
    """Render a general graph (nodes + edges) as a network PNG.

    `nodes`: list of {id, label, weight, centrality?, ...}
    `edges`: list of {source, target, weight}
    """
    if not nodes:
        return ""
    if not default_filename:
        default_filename = f"biblio_network_{_today()}.png"

    try:
        import networkx as nx
    except ImportError:
        return ""

    nodes = nodes[:max_nodes]
    node_ids = {n["id"] for n in nodes}

    G = nx.Graph()
    weights = [float(n.get("weight", n.get("frequency", 1))) for n in nodes]
    min_w = min(weights) if weights else 1
    max_w = max(weights) if weights else 1
    rng_w = max_w - min_w or 1.0

    for n, w in zip(nodes, weights):
        G.add_node(n["id"], label=n.get("label", n["id"]), weight=w)

    for e in edges:
        src, tgt = e.get("source", ""), e.get("target", "")
        if src in node_ids and tgt in node_ids:
            G.add_edge(src, tgt, weight=float(e.get("weight", 1)))

    if G.number_of_nodes() == 0:
        return ""

    pos = nx.spring_layout(G, k=2.0, seed=42, weight="weight")

    fig, ax = plt.subplots(figsize=(14, 10))

    # Edges
    edge_weights = [G[u][v].get("weight", 1) for u, v in G.edges()]
    if edge_weights:
        ew_max = max(edge_weights) or 1
        edge_widths = [0.5 + 2.5 * (w / ew_max) for w in edge_weights]
        nx.draw_networkx_edges(G, pos, width=edge_widths, alpha=0.35,
                               edge_color="#888888", ax=ax)

    # Nodes sized by weight
    node_sizes = [200 + 1200 * ((w - min_w) / rng_w) for w in weights]
    centralities = [n.get("centrality", 0) for n in nodes]
    cmax = max(centralities) if centralities else 1
    node_colors = [0.2 + 0.8 * (c / (cmax or 1)) for c in centralities]

    nc = nx.draw_networkx_nodes(
        G, pos, nodelist=[n["id"] for n in nodes],
        node_size=node_sizes, node_color=node_colors,
        cmap=cm.Blues, alpha=0.9, ax=ax,
    )
    labels = {n["id"]: n.get("label", n["id"])[:20] for n in nodes}
    nx.draw_networkx_labels(G, pos, labels=labels, font_size=7, ax=ax)

    ax.set_title(title, fontsize=12, fontweight="bold")
    ax.axis("off")
    plt.colorbar(nc, ax=ax, label="Centrality", shrink=0.6, pad=0.02)
    plt.tight_layout()
    filepath = _resolve_chart_path(save_path, default_filename)
    _ensure_dir(filepath)
    plt.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return filepath


# --------------------------------------------------------------------------- #
# Multi-relation network (word sketch / collocation relations)
# --------------------------------------------------------------------------- #

def save_collocation_network(
    center_word: str,
    relations: dict,
    save_path: str,
    *,
    default_filename: str = "",
    max_per_rel: int = 10,
) -> str:
    """Generate a multi-relation collocation network and save as PNG.

    `relations` maps rel_name → {display_en, collocations: [{lemma/word, score}]}
    """
    if not relations:
        return ""
    if not default_filename:
        default_filename = f"collocation_network_{_today()}.png"

    try:
        import networkx as nx
    except ImportError:
        return ""

    G = nx.DiGraph()
    G.add_node(center_word, node_type="center")
    rel_colors = {}
    palette = ["#4C72B0", "#DD8452", "#55A868", "#C44E52", "#8172B2",
               "#937860", "#DA8BC3", "#8C8C8C", "#CCB974", "#64B5CD"]
    for i, (rel_name, rel_data) in enumerate(relations.items()):
        color = palette[i % len(palette)]
        rel_colors[rel_name] = color
        display = rel_data.get("display_en", rel_name) if isinstance(rel_data, dict) else rel_name
        collocations = []
        if isinstance(rel_data, dict):
            collocations = rel_data.get("collocations", [])
        elif isinstance(rel_data, list):
            collocations = rel_data

        for c in collocations[:max_per_rel]:
            word = c.get("lemma", c.get("word", ""))
            if not word:
                continue
            score = float(c.get("score", c.get("logdice", 1)))
            node_id = f"{rel_name}::{word}"
            G.add_node(node_id, label=word, rel=rel_name, color=color, node_type="colloc")
            G.add_edge(center_word, node_id, weight=score, rel=rel_name, color=color)

    if G.number_of_nodes() <= 1:
        return ""

    pos = nx.spring_layout(G, k=3.0, seed=42)

    fig, ax = plt.subplots(figsize=(14, 10))

    # Draw edges by relation
    for rel_name, color in rel_colors.items():
        edges = [(u, v) for u, v, d in G.edges(data=True) if d.get("rel") == rel_name]
        if edges:
            nx.draw_networkx_edges(G, pos, edgelist=edges, edge_color=color,
                                   width=1.5, alpha=0.5, ax=ax, arrows=False)

    # Center node
    nx.draw_networkx_nodes(G, pos, nodelist=[center_word],
                           node_color="#E74C3C", node_size=1500, ax=ax)

    # Collocation nodes by color
    for rel_name, color in rel_colors.items():
        nodes = [n for n, d in G.nodes(data=True) if d.get("rel") == rel_name]
        if nodes:
            nx.draw_networkx_nodes(G, pos, nodelist=nodes,
                                   node_color=color, node_size=400, alpha=0.8, ax=ax)

    # Labels
    labels = {n: d.get("label", n.split("::")[-1]) for n, d in G.nodes(data=True)}
    labels[center_word] = center_word
    nx.draw_networkx_labels(G, pos, labels=labels, font_size=7, ax=ax)

    # Legend for relations
    legend_handles = [
        plt.Line2D([0], [0], color=c, linewidth=3, label=rel_name)
        for rel_name, c in rel_colors.items()
    ]
    ax.legend(handles=legend_handles, loc="upper right", fontsize=7, title="Relations")
    ax.set_title(f'Collocation Network: "{center_word}"', fontsize=12, fontweight="bold")
    ax.axis("off")
    plt.tight_layout()
    filepath = _resolve_chart_path(save_path, default_filename)
    _ensure_dir(filepath)
    plt.savefig(filepath, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return filepath
