"""
Reference and lookup tools for Meta-Lingo MCP server.
Tools: get_pos_tags, get_usas_categories, get_metaphor_sources,
       list_reference_corpora, validate_cql, list_annotation_frameworks,
       get_annotation_framework
"""
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def get_pos_tags() -> str:
        """Get all valid Universal POS tags with descriptions.

        When to use: Before using pos_filter in any analysis tool, check available
        POS tags. Returns the full list of SpaCy Universal POS tags (NOUN, VERB,
        ADJ, ADV, DET, PRON, ADP, CONJ, NUM, PART, PUNCT, SYM, X, etc.)
        with human-readable descriptions.
        """
        result = await client.get("/api/collocation/pos-tags")
        # API returns bare list: [{tag, description_en, description_zh}]
        data = result if isinstance(result, list) else result.get("data", result)

        if isinstance(data, list):
            lines = ["Universal POS Tags\n"]
            lines.append(f"{'Tag':<10}{'Description':<40}")
            lines.append("-" * 50)
            for item in data:
                if isinstance(item, dict):
                    tag = item.get("tag", item.get("value", "?"))
                    desc = item.get("description_en", item.get("description", item.get("label", "")))
                    lines.append(f"{tag:<10}{desc:<40}")
                else:
                    lines.append(str(item))
            return "\n".join(lines)
        return str(data)

    @mcp.tool()
    async def get_usas_categories() -> str:
        """Get all USAS (UCREL Semantic Analysis System) major domain categories.

        When to use: Before interpreting semantic_domain_analysis results or
        filtering by domain code. Returns the 21 major USAS categories
        (A=General, B=Body, C=Arts, E=Emotion, etc.) with subcategory counts.

        Use domain codes in get_domain_words() to drill into specific domains.
        """
        result = await client.get("/api/analysis/semantic-domains/categories")
        # API may return bare list or {data: [...]}
        data = result if isinstance(result, list) else result.get("data", result)

        if isinstance(data, list):
            lines = ["USAS Major Domain Categories\n"]
            lines.append(f"{'Code':<8}{'Name':<50}")
            lines.append("-" * 58)
            for cat in data:
                if isinstance(cat, dict):
                    code = cat.get("code", cat.get("id", "?"))
                    name = cat.get("name", cat.get("label", ""))
                    lines.append(f"{code:<8}{name:<50}")
                else:
                    lines.append(str(cat))
            return "\n".join(lines)
        return str(data)

    @mcp.tool()
    async def get_metaphor_sources() -> str:
        """Get available metaphor detection source types for MIPVU analysis.

        When to use: Before filtering metaphor_analysis by source type.
        Returns detection pipeline names (filter, rule, clause, finetuned)
        that can be used in metaphor_analysis(result_mode="source").
        """
        result = await client.get("/api/analysis/metaphor-analysis/sources")
        # API returns bare list: [{id, name_en, name_zh}]
        data = result if isinstance(result, list) else result.get("data", result)

        if isinstance(data, list):
            lines = ["MIPVU Metaphor Detection Sources\n"]
            lines.append(f"{'ID':<15}{'Name':<30}")
            lines.append("-" * 45)
            for src in data:
                if isinstance(src, dict):
                    sid = src.get("id", "?")
                    name = src.get("name_en", src.get("name", ""))
                    lines.append(f"{sid:<15}{name:<30}")
                else:
                    lines.append(f"  - {src}")
            return "\n".join(lines)
        return str(data)

    @mcp.tool()
    async def list_reference_corpora(search: str = "", offset: int = 0, page_size: int = 20) -> str:
        """List available reference corpora for keyness comparison.

        When to use: Before using keyness_resource_analysis(). Returns built-in
        reference corpora (BNC spoken/written, OANC, Brown, etc.) with their
        resource_id, name, language, and word count. Use the resource_id in
        keyness_resource_analysis(resource_id=...).

        Use search= to filter by keyword (matches ID or name, case-insensitive).
        Results are paginated (20 per page). Call with offset=20, offset=40, etc.
        to see subsequent pages. The output tells you how many remain.

        Args:
            search: Filter corpora whose ID or name contains this string (case-insensitive).
            offset: Skip first N matching corpora (for pagination). Default 0.
            page_size: Number of corpora per page. Default 20.
        """
        result = await client.get("/api/corpus-resource/list")
        data = result.get("data", result) if isinstance(result, dict) else result

        if isinstance(data, list):
            # Apply search filter
            if search:
                q = search.lower()
                data = [
                    r for r in data
                    if isinstance(r, dict) and (
                        q in r.get("id", "").lower() or
                        q in r.get("name_en", r.get("name", "")).lower()
                    )
                ]

            total = len(data)
            if total == 0:
                return f"No reference corpora matching '{search}'. Try a broader search term."

            page_data = data[offset:offset + page_size] if page_size > 0 else data[offset:]
            end = offset + len(page_data)

            header = f"Reference Corpora matching '{search}'" if search else "Available Reference Corpora"
            lines = [f"{header} (showing {offset + 1}–{end} of {total})\n"]
            lines.append(f"{'ID':<35}{'Name':<40}{'Words':<15}")
            lines.append("-" * 90)
            for res in page_data:
                if isinstance(res, dict):
                    rid = res.get("id", "?")
                    name = res.get("name_en", res.get("name", ""))
                    words = res.get("word_count", res.get("total_words", ""))
                    lines.append(f"{rid:<35}{name:<40}{words:<15}")

            remaining = total - end
            if remaining > 0:
                lines.append(
                    f"\n... {remaining} more. "
                    f"Call list_reference_corpora(search='{search}', offset={end}) to see the next page."
                )
            else:
                lines.append(f"\nTotal: {total} reference corpora (end of list)")
            return "\n".join(lines)
        return str(data)

    @mcp.tool()
    async def validate_cql(query: str) -> str:
        """Validate a CQL (Corpus Query Language) expression before searching.

        When to use: ALWAYS call this before concordance_search(search_mode="cql")
        to catch syntax errors early. Returns whether the query is valid and any
        error message.

        CQL Quick Reference:
          [word="run"]                     - exact word match
          [lemma="run"]                    - any form (runs, running, ran)
          [pos="NOUN"]                     - any noun
          [pos="ADJ"][pos="NOUN"]          - adjective followed by noun
          [word="the" & pos="DET"]         - "the" as determiner (AND)
          [pos="NOUN" | pos="VERB"]        - noun or verb (OR)
          [!pos="PUNCT"]                   - not punctuation (NOT)
          [pos="VERB"][]{0,3}[pos="NOUN"]  - verb + 0-3 words + noun
          []                               - any single token
          [dep="nsubj"]                    - subject dependency relation
          [usas="A1.1"]                    - USAS semantic domain A1.1
          [headword="make"]               - token whose head word is "make"
          [headpos="VERB"]                 - token whose head POS is VERB
          <s> [pos="DET"] </s>            - pattern within sentence boundary

        Supported attributes: word, lemma, pos, tag, dep, usas, nrc,
                              headword, headlemma, headpos, headdep

        Args:
            query: CQL expression to validate
        """
        result = await client.post(
            "/api/collocation/parse-cql", json_data={"query": query}
        )
        # API returns {valid: bool, error: str|null} directly
        data = result.get("data", result) if isinstance(result, dict) else result

        valid = data.get("valid", result.get("valid", False))
        error = data.get("error", result.get("error", ""))

        if valid:
            return f'CQL query is valid: {query}'
        else:
            return f'CQL query is INVALID: {query}\nError: {error}'

    @mcp.tool()
    async def list_annotation_frameworks(search: str = "", offset: int = 0, page_size: int = 20) -> str:
        """List all available annotation frameworks for text annotation.

        When to use: Before creating annotations with save_annotation(). Returns
        all installed frameworks with id, name, category, and description.

        Use search= to filter by keyword in name, id, or category.
        Results are paginated (20 per page). Use offset= to get subsequent pages.
        Use get_annotation_framework(framework_id) to see the full label tree
        before annotating.

        Args:
            search: Filter frameworks whose name, id, or category contains this string (case-insensitive).
            offset: Skip first N frameworks (for pagination). Default 0.
            page_size: Number of frameworks per page. Default 20.
        """
        result = await client.get("/api/framework/list")
        data = result.get("data", result) if isinstance(result, dict) else result

        # API returns {categories: [{name, frameworks: [{id, name, category, description}]}]}
        categories = []
        if isinstance(data, dict):
            categories = data.get("categories", [])
        elif isinstance(data, list):
            categories = data

        if not categories:
            return "No annotation frameworks found."

        # Flatten all frameworks first
        all_frameworks = []
        for cat_group in categories:
            if isinstance(cat_group, dict):
                for fw in cat_group.get("frameworks", []):
                    all_frameworks.append({
                        "id": fw.get("id", "?"),
                        "name": fw.get("name", ""),
                        "category": fw.get("category", cat_group.get("name", "")),
                    })

        # Apply search filter
        if search:
            q = search.lower()
            all_frameworks = [
                fw for fw in all_frameworks
                if q in fw["id"].lower() or q in fw["name"].lower() or q in fw["category"].lower()
            ]

        total = len(all_frameworks)
        if total == 0:
            return f"No annotation frameworks matching '{search}'. Try a broader search term."

        page_data = all_frameworks[offset:offset + page_size] if page_size > 0 else all_frameworks[offset:]
        end = offset + len(page_data)

        header = f"Annotation Frameworks matching '{search}'" if search else "Annotation Frameworks"
        lines = [f"{header} (showing {offset + 1}–{end} of {total})\n"]
        lines.append(f"{'ID':<30}{'Name':<35}{'Category':<25}")
        lines.append("-" * 90)
        for fw in page_data:
            lines.append(f"{fw['id']:<30}{fw['name']:<35}{fw['category']:<25}")

        remaining = total - end
        if remaining > 0:
            search_arg = f"search='{search}', " if search else ""
            lines.append(
                f"\n... {remaining} more frameworks. "
                f"Call list_annotation_frameworks({search_arg}offset={end}) to see the next page."
            )
        else:
            lines.append(f"\nTotal: {total} frameworks (end of list)")

        return "\n".join(lines)

    @mcp.tool()
    async def get_annotation_framework(framework_id: str) -> str:
        """Get full annotation framework definition with label hierarchy.

        When to use: After list_annotation_frameworks(), before save_annotation().
        Returns the COMPLETE framework tree with labels, colors, definitions,
        and pre-computed labelPath values needed for save_annotation().

        Output format for each node:
        - [label] nodes are annotatable - use their name as "label" and
          their labelPath as "labelPath" in save_annotation()
        - [tier] nodes are grouping containers, not directly annotatable

        IMPORTANT: You MUST read the full output to see all available labels
        before annotating. Each label includes its definition to help you
        decide when to apply it.

        Args:
            framework_id: Framework ID from list_annotation_frameworks()
        """
        result = await client.get(f"/api/framework/{framework_id}")
        data = result.get("data", result) if isinstance(result, dict) else result

        if not data:
            return f"Framework not found: {framework_id}"

        name = data.get("name", "Unknown")
        category = data.get("category", "")
        description = data.get("description", "")

        lines = [
            f"Framework: {name}",
            f"Category: {category}",
        ]
        if description:
            lines.append(f"Description: {description}")
        lines.append("")

        # Tree is at data.root.children; root name is the base of labelPath
        root = data.get("root", data)
        root_name = root.get("name", name)
        children = root.get("children", data.get("children", []))
        _render_framework_tree(children, lines, indent=0, path_prefix=root_name)

        return "\n".join(lines)


    @mcp.tool()
    async def create_annotation_framework(
        name: str,
        category: str,
        root: dict,
        description: str = "",
    ) -> str:
        """Create a new annotation framework with custom label hierarchy.

        When to use: When a user wants a custom annotation scheme. Design the
        framework tree FIRST, then call this tool.

        FRAMEWORK STRUCTURE RULES:
        - Every node needs a unique `id` (use short descriptive strings like
          "tier_attitude", "label_positive"). Avoid UUIDs — short IDs are fine.
        - Node `type` is either "tier" (grouping container) or "label" (annotatable leaf).
        - Tiers hold other tiers or labels as children.
        - Labels are the annotation choices users apply to text spans.
        - `color` can be omitted (server auto-assigns based on path hash).
        - `definition` should explain WHEN to apply this label.
        - Every label should have a definition — this is what makes AI annotation accurate.

        EXAMPLE STRUCTURE (Appraisal — Attitude):
        ```json
        {
          "id": "root",
          "name": "Appraisal",
          "type": "tier",
          "children": [
            {
              "id": "tier_affect",
              "name": "Affect",
              "type": "tier",
              "definition": "Expressions of emotion",
              "children": [
                {
                  "id": "label_positive",
                  "name": "Positive",
                  "type": "label",
                  "definition": "Positive emotion: happiness, satisfaction, security"
                },
                {
                  "id": "label_negative",
                  "name": "Negative",
                  "type": "label",
                  "definition": "Negative emotion: anger, fear, sadness, dissatisfaction"
                }
              ]
            }
          ]
        }
        ```

        CATEGORIES (use existing category names for consistency):
        - Appraisal Analysis
        - Theme/Rheme
        - SFL Mood and Transitivity
        - Error Analysis
        - Metaphor
        - Event Semantics
        - Modality
        - Custom

        Args:
            name: Framework display name (e.g., "My Appraisal Framework")
            category: Category grouping (see CATEGORIES above)
            root: Root node dict following the structure above (recursive tree)
            description: Optional summary of what this framework annotates
        """
        body: dict = {
            "name": name,
            "category": category,
            "root": root,
        }
        if description:
            body["description"] = description

        result = await client.post("/api/framework/create", json_data=body)
        data = result.get("data", result) if isinstance(result, dict) else result

        if not data or not isinstance(data, dict):
            return f"Failed to create framework: {result}"

        fw_id = data.get("id", "?")
        fw_name = data.get("name", name)
        label_count = _count_labels(data.get("root", {}))

        lines = [
            f"Framework created successfully!",
            f"  ID:       {fw_id}",
            f"  Name:     {fw_name}",
            f"  Category: {data.get('category', category)}",
            f"  Labels:   {label_count}",
        ]
        if data.get("description"):
            lines.append(f"  Description: {data['description']}")
        lines.append("")
        lines.append("Use get_annotation_framework(framework_id) to view the full label tree.")
        lines.append("Use list_annotation_frameworks() to confirm it appears in the list.")
        return "\n".join(lines)


def _count_labels(node: dict) -> int:
    """Recursively count label-type nodes."""
    if not isinstance(node, dict):
        return 0
    count = 1 if node.get("type") == "label" else 0
    for child in node.get("children", []):
        count += _count_labels(child)
    return count


def _render_framework_tree(
    nodes: list, lines: list, indent: int = 0, path_prefix: str = ""
):
    """Recursively render framework tree with labelPath for each node."""
    prefix = "  " * indent
    for node in nodes:
        if not isinstance(node, dict):
            continue
        name = node.get("name") or "?"
        ntype = node.get("type") or ""
        color = node.get("color") or ""
        definition = node.get("definition") or ""

        # Build the full label path
        label_path = f"{path_prefix} > {name}" if path_prefix else name

        type_tag = f"[{ntype}]" if ntype else ""
        color_tag = f"  color={color}" if color else ""

        line = f"{prefix}- {name} {type_tag}{color_tag}"
        if ntype == "label":
            line += f"\n{prefix}  labelPath: \"{label_path}\""
        if definition:
            line += f"\n{prefix}  definition: {definition}"
        lines.append(line)

        children = node.get("children", [])
        if children:
            _render_framework_tree(children, lines, indent + 1, path_prefix=label_path)
