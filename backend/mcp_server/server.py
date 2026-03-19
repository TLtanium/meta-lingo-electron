"""
Meta-Lingo MCP Server setup and tool registration.
"""
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient
from mcp_server.tools import (
    corpus,
    analysis,
    concordance,
    semantic,
    sketch,
    topic,
    export,
)

TOOL_MODULES = [corpus, analysis, concordance, semantic, sketch, topic, export]


def create_server(backend_url: str = "http://127.0.0.1:8000") -> FastMCP:
    """Create and configure the Meta-Lingo MCP server with all tools."""
    mcp = FastMCP(
        "meta-lingo",
        instructions=(
            "Meta-Lingo is a corpus research application for linguistic analysis. "
            "You can use these tools to create corpora, upload texts, and run "
            "various analyses including word frequency, keywords, n-grams, "
            "concordance (KWIC), collocations, word sketches, semantic domains "
            "(USAS), metaphor detection (MIPVU), sentiment analysis (NRC), "
            "synonym analysis, topic modeling, and export annotations.\n\n"
            "Typical research workflow:\n"
            "1. list_corpora - see what's available\n"
            "2. create_corpus + upload_text - add new data if needed\n"
            "3. get_corpus_info - get text IDs for analysis\n"
            "4. Run analyses: word_frequency, concordance_search, etc.\n"
            "5. Compare corpora with keyness_analysis or sketch_difference\n"
            "6. export_annotations - save results\n\n"
            "All results are also visible in the Meta-Lingo desktop application."
        ),
    )

    client = MetaLingoClient(backend_url)

    for module in TOOL_MODULES:
        module.register(mcp, client)

    return mcp
