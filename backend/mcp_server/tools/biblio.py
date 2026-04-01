"""
Bibliographic visualization tools for Meta-Lingo MCP server.
Tools: list_biblio_libraries, create_biblio_library, upload_biblio_file,
       get_biblio_library_info, biblio_network, biblio_temporal,
       biblio_cluster, biblio_wordcloud
"""
from typing import Optional
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.csv_export import save_csv, today
from mcp_server.chart_export import (
    save_biblio_network,
    save_bar_chart,
    save_wordcloud,
)


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def list_biblio_libraries() -> str:
        """List all bibliographic libraries in Meta-Lingo.

        When to use: Discover existing bibliography collections before uploading
        or running analysis. Each library has a shadow corpus whose corpus_id
        can be used with word_frequency, concordance_search, and other analysis tools.

        Returns library IDs, names, source types, entry counts, and shadow corpus IDs.
        """
        result = await client.get("/api/biblio/libraries")
        libraries = result.get("libraries", [])
        if not libraries:
            return "No bibliographic libraries found. Use create_biblio_library to create one."
        lines = [f"Found {len(libraries)} bibliographic library/libraries:\n"]
        for lib in libraries:
            corpus_id = lib.get("corpus_id", "")
            lines.append(
                f"- {lib['name']} (id={lib['id']}, type={lib.get('source_type','?')}, "
                f"entries={lib.get('entry_count', 0)}, corpus_id={corpus_id})"
            )
            if lib.get("description"):
                lines.append(f"    desc: {lib['description'][:100]}")
        lines.append(
            "\nTIP: Use the corpus_id with word_frequency, concordance_search, etc. "
            "to analyze the abstracts in a library."
        )
        return "\n".join(lines)

    @mcp.tool()
    async def create_biblio_library(
        name: str,
        source_type: str = "WOS",
        language: str = "english",
        description: str = "",
    ) -> str:
        """Create a new bibliographic library for literature visualization.

        When to use: Before uploading bibliography export files (Web of Science,
        CNKI, etc.). Creates both the library and a shadow corpus for abstract
        analysis.

        After creating, use upload_biblio_file to import entries.

        Args:
            name: Library display name (e.g. "Pharmacy Education Review")
            source_type: Bibliography source format: "WOS" (Web of Science) or "CNKI" (CNKI)
            language: Language for abstract processing: "english" or "chinese"
            description: Optional description
        """
        body = {
            "name": name,
            "source_type": source_type,
            "language": language,
            "description": description,
        }
        result = await client.post("/api/biblio/libraries", json_data=body)
        lib_id = result.get("id", "?")
        corpus_id = result.get("corpus_id", "")
        return (
            f"Bibliographic library created successfully.\n"
            f"  Name: {name}\n"
            f"  ID: {lib_id}\n"
            f"  Source type: {source_type}\n"
            f"  Shadow corpus ID: {corpus_id}\n\n"
            f"Use upload_biblio_file(library_id='{lib_id}', filepath='...') to import entries.\n"
            f"After upload completes, use corpus_id='{corpus_id}' with analysis tools."
        )

    @mcp.tool()
    async def upload_biblio_file(
        library_id: str,
        filepath: str,
    ) -> str:
        """Upload a bibliography export file (WOS/CNKI) to a library.

        When to use: After create_biblio_library(). Parses the file, creates entries,
        and queues background SpaCy annotation for each abstract. Wait for processing
        to complete before running analysis on the shadow corpus.

        Supported formats:
        - Web of Science: plain text export (savedrecs.txt)
        - CNKI: Refworks export

        Max 100 entries per upload. For larger files, split them first.

        Args:
            library_id: Library ID from create_biblio_library or list_biblio_libraries
            filepath: Absolute path to the bibliography file on disk
        """
        import os
        if not os.path.exists(filepath):
            return f"File not found: {filepath}"

        result = await client.upload_file(
            f"/api/biblio/libraries/{library_id}/upload",
            filepath=filepath,
        )

        entries_added = result.get("entries_added", 0)
        entries_skipped = result.get("entries_skipped", 0)
        errors = result.get("errors", [])
        entry_tasks = result.get("entry_tasks", [])

        lines = [
            f"Upload complete.",
            f"  Entries added: {entries_added}",
            f"  Entries skipped (duplicates): {entries_skipped}",
            f"  Abstracts queued for annotation: {len(entry_tasks)}",
        ]
        if errors:
            lines.append(f"  Parse warnings: {'; '.join(errors[:5])}")
        if entry_tasks:
            lines.append(
                f"\nBackground annotation is processing {len(entry_tasks)} abstracts. "
                f"Wait for completion before running analysis."
            )
        return "\n".join(lines)

    @mcp.tool()
    async def get_biblio_library_info(library_id: str) -> str:
        """Get details of a bibliographic library including its shadow corpus ID.

        When to use: To find the corpus_id for running word_frequency,
        concordance_search, or other analysis tools on library abstracts.

        Args:
            library_id: Library ID
        """
        result = await client.get(f"/api/biblio/libraries/{library_id}")
        name = result.get("name", "?")
        corpus_id = result.get("corpus_id", "")
        entry_count = result.get("entry_count", 0)
        source_type = result.get("source_type", "?")
        language = result.get("language", "?")
        desc = result.get("description", "")

        lines = [
            f"Library: {name}",
            f"  ID: {library_id}",
            f"  Source type: {source_type}",
            f"  Language: {language}",
            f"  Entries: {entry_count}",
            f"  Shadow corpus ID: {corpus_id}",
        ]
        if desc:
            lines.append(f"  Description: {desc}")
        lines.append(
            f"\nUse corpus_id='{corpus_id}' with word_frequency, concordance_search, "
            f"and other analysis tools to analyze the abstracts."
        )
        return "\n".join(lines)

    @mcp.tool()
    async def biblio_network(
        library_id: str,
        network_type: str = "keyword-cooccur",
        min_weight: int = 1,
        max_nodes: int = 60,
        year_start: int | None = None,
        year_end: int | None = None,
        author: str | None = None,
        keyword: str | None = None,
        journal: str | None = None,
        country: str | None = None,
        save_path: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Generate bibliographic co-occurrence network analysis.

        When to use: Explore intellectual structure of a literature collection —
        who collaborates with whom, which keywords co-occur, which papers are
        co-cited together.

        Network types:
          "co-author"      — Author collaboration network
          "co-institution" — Institutional collaboration network
          "co-country"     — International collaboration network
          "keyword-cooccur"— Keyword co-occurrence network (most common)
          "co-citation"    — Document co-citation network

        Use get_biblio_library_info() first to find the library_id.
        Use list_biblio_libraries() to see all available libraries.

        Args:
            library_id: Library ID from list_biblio_libraries()
            network_type: One of the network types above (default: "keyword-cooccur")
            min_weight: Minimum co-occurrence weight to show an edge (default: 1)
            max_nodes: Maximum number of nodes to include (default: 60)
            year_start: Filter entries from this year onward
            year_end: Filter entries up to this year
            author: Filter to entries by this author
            keyword: Filter to entries containing this keyword
            journal: Filter to entries from this journal
            country: Filter to entries from this country
            save_path: Save node list as CSV (path, directory, or "" for ~/Downloads, None = skip)
            chart_path: Save network chart as PNG (same rules, None = skip)
        """
        endpoint_map = {
            "co-author": "/api/biblio/visualization/co-author",
            "co-institution": "/api/biblio/visualization/co-institution",
            "co-country": "/api/biblio/visualization/co-country",
            "keyword-cooccur": "/api/biblio/visualization/keyword-cooccur",
            "co-citation": "/api/biblio/visualization/co-citation",
        }
        endpoint = endpoint_map.get(network_type, "/api/biblio/visualization/keyword-cooccur")

        body: dict = {
            "library_id": library_id,
            "min_weight": min_weight,
            "max_nodes": max_nodes,
        }
        filters: dict = {}
        if year_start is not None:
            filters["year_start"] = year_start
        if year_end is not None:
            filters["year_end"] = year_end
        if author:
            filters["author"] = author
        if keyword:
            filters["keyword"] = keyword
        if journal:
            filters["journal"] = journal
        if country:
            filters["country"] = country
        if filters:
            body["filters"] = filters

        result = await client.post(endpoint, json_data=body)
        nodes = result.get("nodes", [])
        edges = result.get("edges", [])
        stats = result.get("statistics", {})

        if not nodes:
            return f"No network data returned for {network_type}. Check that the library has entries."

        # Top nodes by weight
        sorted_nodes = sorted(nodes, key=lambda n: n.get("weight", 0), reverse=True)

        lines = [
            f"Bibliographic Network: {network_type}\n",
            f"Nodes: {stats.get('node_count', len(nodes))}  "
            f"Edges: {stats.get('edge_count', len(edges))}  "
            f"Density: {stats.get('density', 0):.4f}\n",
            f"{'Node':<40}{'Freq':<8}{'Centrality':<12}",
            "-" * 60,
        ]
        for n in sorted_nodes[:30]:
            label = str(n.get("label", n.get("id", "?")))[:38]
            freq = n.get("weight", n.get("frequency", 0))
            cent = n.get("centrality", 0)
            lines.append(f"{label:<40}{freq:<8}{cent:.4f}")

        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = [
                {
                    "Label": n.get("label", n.get("id", "")),
                    "Frequency": n.get("weight", n.get("frequency", 0)),
                    "Centrality": round(n.get("centrality", 0), 4),
                    "Year": n.get("year", ""),
                }
                for n in sorted_nodes
            ]
            saved = save_csv(
                csv_rows, save_path, f"biblio_{network_type}_{today()}.csv",
                ["Label", "Frequency", "Centrality", "Year"],
            )
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_path is not None:
            chart_title = {
                "co-author": "Co-Authorship Network",
                "co-institution": "Institutional Collaboration Network",
                "co-country": "International Collaboration Network",
                "keyword-cooccur": "Keyword Co-occurrence Network",
                "co-citation": "Co-Citation Network",
            }.get(network_type, network_type)
            saved_chart = save_biblio_network(
                nodes, edges, chart_title, chart_path,
                default_filename=f"biblio_{network_type}_{today()}.png",
                max_nodes=max_nodes,
            )
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def biblio_temporal(
        library_id: str,
        viz_type: str = "timeline",
        time_slice: int = 1,
        top_n: int = 10,
        burst_type: str = "keyword",
        min_frequency: int = 2,
        gamma: float = 1.0,
        year_start: int | None = None,
        year_end: int | None = None,
        keyword: str | None = None,
        save_path: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Temporal trends in bibliographic literature.

        When to use: Track how topics/keywords/authors evolve over time.
        Shows publication trends, emerging topics, and burst detection.

        Visualization types:
          "timeline" — Keyword/author evolution over time slices
          "timezone" — Timezone-style overlay (CiteSpace-style)
          "burst"    — Burst detection: keywords/authors with sudden citation surges

        Args:
            library_id: Library ID
            viz_type: "timeline", "timezone", or "burst"
            time_slice: Year slice width for timeline/timezone (default: 1)
            top_n: Top items per time slice for timeline (default: 10)
            burst_type: For burst: "keyword" or "author"
            min_frequency: For burst: minimum frequency threshold
            gamma: For burst: Kleinberg gamma parameter (higher = fewer bursts)
            year_start: Filter start year
            year_end: Filter end year
            keyword: Filter to entries with this keyword
            save_path: Save results as CSV (path, dir, "" for ~/Downloads, None = skip)
            chart_path: Save bar chart PNG (same rules, None = skip)
        """
        filters: dict = {}
        if year_start is not None:
            filters["year_start"] = year_start
        if year_end is not None:
            filters["year_end"] = year_end
        if keyword:
            filters["keyword"] = keyword

        if viz_type == "burst":
            body: dict = {
                "library_id": library_id,
                "burst_type": burst_type,
                "min_frequency": min_frequency,
                "gamma": gamma,
            }
            if filters:
                body["filters"] = filters
            result = await client.post("/api/biblio/visualization/burst", json_data=body)
            bursts = result.get("bursts", [])
            if not bursts:
                return "No burst data found. Try lowering min_frequency or gamma."

            lines = [f"Burst Detection ({burst_type})\n",
                     f"{'Item':<35}{'Strength':<12}{'Start':<8}{'End':<8}",
                     "-" * 63]
            for b in sorted(bursts, key=lambda x: x.get("strength", 0), reverse=True)[:30]:
                label = str(b.get("word", b.get("label", "?")))[:33]
                strength = b.get("strength", 0)
                start = b.get("begin", b.get("start", ""))
                end = b.get("end", "")
                lines.append(f"{label:<35}{strength:<12.3f}{start:<8}{end:<8}")

            output = "\n".join(lines)

            if save_path is not None:
                csv_rows = [
                    {
                        "Item": b.get("word", b.get("label", "")),
                        "Strength": round(b.get("strength", 0), 4),
                        "Start": b.get("begin", b.get("start", "")),
                        "End": b.get("end", ""),
                    }
                    for b in bursts
                ]
                saved = save_csv(csv_rows, save_path, f"biblio_burst_{today()}.csv",
                                 ["Item", "Strength", "Start", "End"])
                if saved:
                    output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

            if chart_path is not None:
                chart_items = [
                    {"label": b.get("word", b.get("label", "")),
                     "strength": b.get("strength", 0)}
                    for b in sorted(bursts, key=lambda x: x.get("strength", 0), reverse=True)
                ]
                saved_chart = save_bar_chart(
                    chart_items, "label", "strength",
                    f"Burst Detection: {burst_type}", chart_path,
                    default_filename=f"biblio_burst_{today()}.png",
                    xlabel="Burst Strength",
                )
                if saved_chart:
                    output += f"\n\nChart saved: {saved_chart}"

            return output

        # timeline or timezone
        endpoint = "/api/biblio/visualization/timeline" if viz_type == "timeline" else "/api/biblio/visualization/timezone"
        body = {
            "library_id": library_id,
            "time_slice": time_slice,
            "top_n": top_n,
        }
        if filters:
            body["filters"] = filters

        result = await client.post(endpoint, json_data=body)

        # Extract time-series data (structure varies between timeline/timezone)
        slices = result.get("slices", result.get("nodes", result.get("timeline", [])))
        time_range = result.get("time_range", {})

        if not slices:
            return f"No {viz_type} data found. Ensure library has entries with year information."

        lines = [
            f"Bibliographic {viz_type.title()}\n",
            f"Time range: {time_range.get('start', '?')} – {time_range.get('end', '?')}\n",
        ]

        if isinstance(slices, list) and slices and isinstance(slices[0], dict):
            for s in slices[:20]:
                year = s.get("year", s.get("time", "?"))
                items = s.get("items", s.get("keywords", s.get("top", [])))
                if isinstance(items, list) and items:
                    top_labels = [
                        str(i.get("label", i.get("word", i))) for i in items[:5]
                    ]
                    lines.append(f"  {year}: {', '.join(top_labels)}")
                else:
                    lines.append(f"  {year}: {s}")

        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            for s in slices:
                year = s.get("year", s.get("time", ""))
                items = s.get("items", s.get("keywords", s.get("top", [])))
                if isinstance(items, list):
                    for item in items:
                        csv_rows.append({
                            "Year": year,
                            "Label": item.get("label", item.get("word", str(item))),
                            "Frequency": item.get("weight", item.get("freq", item.get("count", 0))),
                        })
            if csv_rows:
                saved = save_csv(csv_rows, save_path, f"biblio_{viz_type}_{today()}.csv",
                                 ["Year", "Label", "Frequency"])
                if saved:
                    output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_path is not None:
            # Bar chart: publication count by year if available
            year_counts: dict = {}
            for s in slices:
                year = str(s.get("year", s.get("time", "")))
                count = s.get("count", s.get("total", len(s.get("items", s.get("top", [])))))
                if year:
                    year_counts[year] = int(count or 0)
            if year_counts:
                chart_items = [{"year": y, "count": c} for y, c in sorted(year_counts.items())]
                saved_chart = save_bar_chart(
                    chart_items, "year", "count",
                    f"{viz_type.title()}: Publication Count by Year", chart_path,
                    default_filename=f"biblio_{viz_type}_{today()}.png",
                    xlabel="Publications",
                    horizontal=False,
                )
                if saved_chart:
                    output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def biblio_cluster(
        library_id: str,
        cluster_by: str = "keyword",
        n_clusters: int | None = None,
        year_start: int | None = None,
        year_end: int | None = None,
        keyword: str | None = None,
        save_path: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Cluster bibliographic entries by keyword, author, or institution.

        When to use: Discover research sub-fields and thematic clusters within
        a literature collection. Clusters reveal how topics group together.

        Args:
            library_id: Library ID
            cluster_by: "keyword" (default), "author", or "institution"
            n_clusters: Number of clusters (None = auto-detect)
            year_start: Filter start year
            year_end: Filter end year
            keyword: Filter to entries with this keyword
            save_path: Save cluster labels CSV (path, dir, "" for ~/Downloads, None = skip)
            chart_path: Save network PNG colored by cluster (same rules, None = skip)
        """
        body: dict = {
            "library_id": library_id,
            "cluster_by": cluster_by,
        }
        if n_clusters is not None:
            body["n_clusters"] = n_clusters

        filters: dict = {}
        if year_start is not None:
            filters["year_start"] = year_start
        if year_end is not None:
            filters["year_end"] = year_end
        if keyword:
            filters["keyword"] = keyword
        if filters:
            body["filters"] = filters

        result = await client.post("/api/biblio/visualization/cluster", json_data=body)
        nodes = result.get("nodes", [])
        edges = result.get("edges", [])
        clusters = result.get("clusters", [])
        modularity = result.get("modularity", 0)
        silhouette = result.get("silhouette", 0)

        if not nodes and not clusters:
            return "No cluster data found. Check that the library has enough entries."

        lines = [
            f"Cluster Analysis (by {cluster_by})\n",
            f"Modularity: {modularity:.4f}  Silhouette: {silhouette:.4f}\n",
        ]

        if clusters:
            for i, cl in enumerate(clusters[:20]):
                cl_id = cl.get("id", cl.get("cluster_id", i))
                label = cl.get("label", cl.get("name", f"Cluster {cl_id}"))
                size = cl.get("size", cl.get("count", 0))
                keywords = cl.get("keywords", cl.get("top_keywords", []))
                kw_str = ", ".join(str(k) for k in keywords[:5])
                lines.append(f"  Cluster {cl_id}: {label} (n={size})")
                if kw_str:
                    lines.append(f"    Keywords: {kw_str}")
        elif nodes:
            # Group nodes by cluster
            cluster_groups: dict = {}
            for n in nodes:
                cl = n.get("cluster", n.get("group", "?"))
                cluster_groups.setdefault(str(cl), []).append(n.get("label", n.get("id", "")))
            for cl_id, members in list(cluster_groups.items())[:15]:
                lines.append(f"  Cluster {cl_id}: {', '.join(members[:5])}")

        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = []
            if clusters:
                for cl in clusters:
                    cl_id = cl.get("id", cl.get("cluster_id", ""))
                    label = cl.get("label", cl.get("name", ""))
                    size = cl.get("size", cl.get("count", 0))
                    keywords = cl.get("keywords", cl.get("top_keywords", []))
                    csv_rows.append({
                        "Cluster ID": cl_id,
                        "Label": label,
                        "Size": size,
                        "Top Keywords": "; ".join(str(k) for k in keywords[:10]),
                    })
            elif nodes:
                for n in nodes:
                    csv_rows.append({
                        "Node": n.get("label", n.get("id", "")),
                        "Cluster": n.get("cluster", n.get("group", "")),
                        "Frequency": n.get("weight", n.get("frequency", 0)),
                    })
            if csv_rows:
                headers = list(csv_rows[0].keys()) if csv_rows else []
                saved = save_csv(csv_rows, save_path, f"biblio_cluster_{today()}.csv", headers)
                if saved:
                    output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_path is not None and nodes:
            saved_chart = save_biblio_network(
                nodes, edges, f"Cluster Map (by {cluster_by})", chart_path,
                default_filename=f"biblio_cluster_{today()}.png",
                max_nodes=min(len(nodes), 80),
            )
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output

    @mcp.tool()
    async def biblio_wordcloud(
        library_id: str,
        source: str = "abstract",
        max_words: int = 100,
        year_start: int | None = None,
        year_end: int | None = None,
        author: str | None = None,
        keyword: str | None = None,
        journal: str | None = None,
        save_path: str | None = None,
        chart_path: str | None = None,
    ) -> str:
        """Word frequency from bibliographic entry titles or abstracts.

        When to use: Quick overview of the most frequent words in a literature
        collection. Useful for understanding the dominant vocabulary before
        deeper analysis.

        Args:
            library_id: Library ID
            source: "abstract" (default) or "title"
            max_words: Maximum number of words to return (default: 100)
            year_start: Filter start year
            year_end: Filter end year
            author: Filter to entries by this author
            keyword: Filter to entries with this keyword
            journal: Filter to entries from this journal
            save_path: Save word frequencies as CSV (path, dir, "" for ~/Downloads, None = skip)
            chart_path: Save word cloud PNG (same rules, None = skip)
        """
        body: dict = {
            "library_id": library_id,
            "source": source,
            "max_words": max_words,
        }
        filters: dict = {}
        if year_start is not None:
            filters["year_start"] = year_start
        if year_end is not None:
            filters["year_end"] = year_end
        if author:
            filters["author"] = author
        if keyword:
            filters["keyword"] = keyword
        if journal:
            filters["journal"] = journal
        if filters:
            body["filters"] = filters

        result = await client.post("/api/biblio/visualization/wordcloud", json_data=body)
        words = result.get("words", [])

        if not words:
            return f"No word data found. Check that entries have {source} text."

        lines = [
            f"Word Frequency from {source.title()}s\n",
            f"{'Word':<30}{'Count':<10}",
            "-" * 40,
        ]
        for item in words[:30]:
            word = str(item.get("word", item.get("text", "?")))
            count = item.get("count", item.get("frequency", item.get("weight", 0)))
            lines.append(f"{word:<30}{count:<10}")

        output = "\n".join(lines)

        if save_path is not None:
            csv_rows = [
                {
                    "Word": item.get("word", item.get("text", "")),
                    "Count": item.get("count", item.get("frequency", item.get("weight", 0))),
                }
                for item in words
            ]
            saved = save_csv(csv_rows, save_path, f"biblio_wordcloud_{today()}.csv",
                             ["Word", "Count"])
            if saved:
                output += f"\n\nCSV saved: {saved} ({len(csv_rows)} rows)"

        if chart_path is not None:
            saved_chart = save_wordcloud(
                words, "word", "count",
                chart_path,
                default_filename=f"biblio_wordcloud_{today()}.png",
                title=f"Word Cloud: {source.title()}s",
            )
            if saved_chart:
                output += f"\n\nChart saved: {saved_chart}"

        return output
