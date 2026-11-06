---
name: meta-lingo
description: Operate the user's running MetaLingo (Meta-Lingo / 元语言) desktop app through its MCP tools for corpus discovery, text uploads, corpus analysis, text annotation archives and result exports. Use when the user asks to use MetaLingo or work with its corpora, including Chinese requests such as 使用 MetaLingo 分析语料. General linguistics questions do not require this skill.
---

# MetaLingo

Use the installed plugin's `meta-lingo` MCP server. Discover its available tools and read their descriptions rather than substituting invented operations or private database edits. The app must be running on this computer with Settings → MCP enabled. If tools are unavailable or the backend cannot be reached, explain how to open MetaLingo and enable MCP; after installation a new desktop conversation or client restart may be needed. Do not replace this connection with a public tunnel or upload the entire workspace elsewhere.

Start corpus work with `list_corpora`, then `get_corpus_info` for the selected corpus. Use returned IDs and actual text content. Choose tools and parameters for the user's research question; follow server instructions and report evidence, sample sizes and limitations from actual results. For asynchronous preprocessing, inspect task status before dependent analyses.

For text annotation, read the framework and complete source text first. Use exact character offsets and the schema documented by `save_annotation`. Retain the archive ID when appending to the same annotation. Do not claim annotations are saved or exports are created unless a tool result confirms it. Preserve existing archives unless the user requests replacing or deleting them.

The app's GUI has capabilities beyond the exposed MCP tools. In particular, text annotation tools do not imply support for drawing video boxes, editing audio intervals, or training models. When a requested action has no corresponding tool, state that limit and offer instructions for the GUI rather than fabricating tool calls.

Respond in the user's language. For requests such as “用 MetaLingo 做词频分析” or “在 MetaLingo 给这份文本做标注”, use this workflow directly; the user need not name the skill explicitly. Use the host's normal tool permission flow.

## User resources and reference agreement

Use `get_resource_status` to inspect imported resources; dictionaries, NRC and reference CSVs are not bundled. Before dictionary-supported metaphor/MIPVU/DMIP judgments, call `list_dictionaries`.

- With no dictionaries, tell the user none are available in MetaLingo and ask them to import an authorized MDX in Settings → User resources → MDX dictionaries, or designate a reference that can actually be accessed. Pause the dictionary-dependent work; do not invent definitions or treat a missing resource as a missing sense.
- With dictionaries, honor the user's explicit reference selection. Establish priority when several are used, or their explicit equal-priority/conflict policy. If either is unspecified, show the actual options, propose a primary/supplementary arrangement and ask for confirmation in the next reply before lookup or dependent judgments. A sole dictionary also needs selection/confirmation. Previously explicit choices need no repeated confirmation; silence or discovery is not agreement.
- Pass the chosen names/IDs explicitly to `dictionary_lookup`, in the agreed order. Cite each dictionary separately, preserve its own sense numbering, and disclose disagreements. If a selected reference disappears, ask for a confirmed replacement. Missing entries/senses alone do not establish novelty. Separate automated metaphor-model results from dictionary-verified analysis. A no-dictionary conceptual analysis requires the user's explicit choice and disclosed limits.

For reference keyness, discover actual IDs with `list_reference_corpora`; confirm the comparison reference rather than choosing one silently. If none are imported, explain Settings → User resources → Reference corpora, or offer another user corpus as the reference. Missing resources/errors are not 'no significant keywords'.

For NRC, check corpus language and saved annotation coverage. Missing lexicons prevent new annotation for that language; existing saved scores remain usable. Report omitted/misaligned texts. Missing annotations are not neutral emotion, and empty filtered results are not proof of an emotion's absence. Explain official NRC-folder import and annotation reruns when needed, without English fallback. For other missing models/frameworks, identify the prerequisite and supported Settings/GUI action; do not fabricate results or silently switch methods.
