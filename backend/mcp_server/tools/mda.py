"""
Multidimensional Analysis (Biber 1988 / MAT) tool for Meta-Lingo MCP server.
Tools: mda_analysis
"""
from typing import Optional

from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.csv_export import save_csv, today
from mcp_server.chart_export import save_bar_chart

_DIMENSION_LABELS = {
    "1": "Involved vs. Informational Production",
    "2": "Narrative vs. Non-Narrative Concerns",
    "3": "Explicit vs. Situation-Dependent Reference",
    "4": "Overt Expression of Persuasion",
    "5": "Abstract vs. Non-Abstract Information",
    "6": "On-Line Informational Elaboration",
}


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def mda_analysis(
        corpus_id: str,
        text_ids: list[str] | None = None,
        ttr_tokens: int = 400,
        z_correction: bool = False,
        excluded_features: list[str] | None = None,
        top_features: int = 15,
        max_texts_shown: int = 25,
        save_path: Optional[str] = None,
        chart_path: Optional[str] = None,
    ) -> str:
        """Biber (1988) multidimensional analysis (MAT algorithm) of an ENGLISH corpus.

        When to use: Register/genre variation studies — situates the corpus along
        Biber's six functional dimensions (e.g. Involved vs. Informational) and
        assigns the closest Biber (1989) text type. Computes 67 lexico-grammatical
        features per 100 tokens from stored SpaCy annotations, then z-scores them
        against Biber's norms.

        Requires annotated ENGLISH texts (non-English texts are skipped); after a
        recent upload_text, wait until processing completes.

        Returns: corpus dimension scores with closest genre per dimension, closest
        text type, over/underused features (|z| > 2), the most deviant feature
        statistics, and per-text dimension scores.

        ⚠ INTERPRETATION RIGOR: Do not claim a corpus "is" a genre from the closest
        text type alone — it is the nearest centroid, not a category membership test.
        Always report the actual dimension scores and note which features drive them
        (inspect the feature table before explaining a dimension score).

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs to analyze (None = all texts)
            ttr_tokens: Number of initial tokens used for type-token ratio (default 400, per Biber 1988)
            z_correction: Cap extreme feature z-scores to reduce outlier distortion (MAT option)
            excluded_features: Feature codes to exclude from dimension computation, e.g. ["TTR", "AWL"]
            top_features: How many most-deviant features (by |z|) to list (default 15)
            max_texts_shown: Max per-text rows in the output (default 25; full data via save_path)
            save_path: Save MAT-style CSVs (Dimensions + Statistics + Zscores). Path to
                directory, or empty string for ~/Downloads. None = don't save.
            chart_path: Save a PNG bar chart of the six corpus dimension scores.
                Empty string = ~/Downloads. None = don't save.
        """
        body: dict = {
            "corpus_id": corpus_id,
            "ttr_tokens": ttr_tokens,
            "z_correction": z_correction,
            "excluded_features": excluded_features or [],
        }
        if text_ids:
            body["text_ids"] = text_ids

        result = await client.post("/api/analysis/mda", json_data=body)
        data = result.get("data", result)
        if not data.get("success", False):
            return f"MDA analysis failed: {data.get('error', 'unknown error')}"

        corpus = data.get("corpus") or {}
        texts = data.get("texts") or []
        features = data.get("features") or []
        skipped = data.get("skipped_texts") or []

        lines = [
            "Multidimensional Analysis (Biber 1988 / MAT algorithm)",
            f"Texts: {corpus.get('text_count', 0)}  |  Tokens: {corpus.get('total_tokens', 0):,}  "
            f"|  AWL: {corpus.get('awl', 0):.2f}  |  TTR: {corpus.get('ttr', 0)}",
            f"Closest Biber (1989) text type: {corpus.get('closest_text_type', '?')}",
            "",
            "Corpus dimension scores (mean over texts; closest Biber genre per dimension):",
        ]
        dims = corpus.get("dimensions", {})
        ranges = corpus.get("dimension_ranges", {})
        genres = corpus.get("closest_genres", {})
        for d in ["1", "2", "3", "4", "5", "6"]:
            score = dims.get(d)
            if score is None:
                continue
            rng = ranges.get(d)
            rng_str = f" (range {rng[0]:.2f}..{rng[1]:.2f})" if rng else ""
            lines.append(
                f"  D{d} {_DIMENSION_LABELS[d]}: {score:.2f}{rng_str}"
                f"  → closest genre: {genres.get(d, '?')}"
            )

        over = corpus.get("overused_features") or []
        under = corpus.get("underused_features") or []
        lines.append("")
        lines.append(f"Overused features vs. Biber norms (z > 2): {', '.join(over) if over else 'none'}")
        lines.append(f"Underused features vs. Biber norms (z < -2): {', '.join(under) if under else 'none'}")

        # Most deviant features
        feats_sorted = sorted(features, key=lambda f: -abs(f.get("zscore", 0)))
        lines.append("")
        lines.append(f"Most deviant features (top {min(top_features, len(feats_sorted))} by |z|; per-100-token mean):")
        lines.append(f"  {'Code':<8}{'Feature':<44}{'Mean':>8}{'SD':>8}{'Norm':>14}{'Z':>8}")
        for f in feats_sorted[:top_features]:
            norm = (
                f"{f['biber_mean']} ± {f['biber_sd']}"
                if f.get("biber_mean") is not None else "—"
            )
            lines.append(
                f"  {f.get('code', '?'):<8}{f.get('name_en', '')[:42]:<44}"
                f"{f.get('mean', 0):>8.2f}{f.get('sd', 0):>8.2f}{norm:>14}{f.get('zscore', 0):>8.2f}"
            )

        # Per-text table
        lines.append("")
        shown = texts[:max_texts_shown]
        lines.append(f"Per-text dimension scores ({len(shown)} of {len(texts)} texts):")
        lines.append(f"  {'File':<32}{'Tokens':>8}" + "".join(f"{'D' + d:>9}" for d in ["1", "2", "3", "4", "5", "6"]) + "  Text type")
        for x in shown:
            row_dims = x.get("dimensions", {})
            lines.append(
                f"  {str(x.get('filename', ''))[:30]:<32}{x.get('tokens', 0):>8}"
                + "".join(f"{row_dims.get(d, 0):>9.2f}" for d in ["1", "2", "3", "4", "5", "6"])
                + f"  {x.get('closest_text_type', '?')}"
            )
        if len(texts) > max_texts_shown:
            lines.append(f"  ... {len(texts) - max_texts_shown} more texts (use save_path for the full table)")
        if skipped:
            lines.append("")
            lines.append(f"Skipped texts (no usable SpaCy annotation / non-English): {len(skipped)}")

        output = "\n".join(lines)

        # MAT-style CSV exports: Dimensions / Statistics / Zscores
        if save_path is not None:
            dim_rows = []
            for x in texts:
                row = {"Filename": x.get("filename", ""), "Tokens": x.get("tokens", 0),
                       "AWL": f"{x.get('awl', 0):.2f}", "TTR": x.get("ttr", 0)}
                for d in ["1", "2", "3", "4", "5", "6"]:
                    row[f"Dimension{d}"] = f"{x.get('dimensions', {}).get(d, 0):.2f}"
                row["ClosestTextType"] = x.get("closest_text_type", "")
                dim_rows.append(row)
            saved1 = save_csv(dim_rows, save_path, f"mda_dimensions_{today()}.csv")

            stat_rows = [{
                "Code": f.get("code", ""),
                "Feature": f.get("name_en", ""),
                "RawTotal": f.get("raw_total", ""),
                "MeanPer100": f"{f.get('mean', 0):.4f}",
                "SD": f"{f.get('sd', 0):.4f}",
                "BiberMean": f.get("biber_mean", ""),
                "BiberSD": f.get("biber_sd", ""),
                "Zscore": f"{f.get('zscore', 0):.4f}",
            } for f in features]
            saved2 = save_csv(stat_rows, save_path, f"mda_statistics_{today()}.csv")

            z_rows = []
            for x in texts:
                row = {"Filename": x.get("filename", "")}
                for f in features:
                    code = f.get("code", "")
                    row[code] = f"{x.get('zscores', {}).get(code, 0):.4f}"
                z_rows.append(row)
            saved3 = save_csv(z_rows, save_path, f"mda_zscores_{today()}.csv")

            saved = [s for s in (saved1, saved2, saved3) if s]
            if saved:
                output += "\n\nCSV saved:\n" + "\n".join(f"  {s}" for s in saved)

        if chart_path is not None and dims:
            chart_items = [
                {"dimension": f"D{d} {_DIMENSION_LABELS[d]}", "score": dims.get(d, 0)}
                for d in ["1", "2", "3", "4", "5", "6"] if dims.get(d) is not None
            ]
            saved_chart = save_bar_chart(
                chart_items, "dimension", "score",
                "MDA Corpus Dimension Scores (Biber 1988)", chart_path,
                default_filename=f"mda_dimensions_{today()}.png", xlabel="Dimension score")
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output
