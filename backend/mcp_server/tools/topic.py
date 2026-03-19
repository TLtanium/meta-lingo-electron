"""
Topic modeling tool for Meta-Lingo MCP server.
Tools: topic_modeling
"""
from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def topic_modeling(
        corpus_id: str,
        text_ids: list[str] | None = None,
        method: str = "lda",
        n_topics: int = 5,
        language: str = "english",
        remove_stopwords: bool = True,
        min_word_length: int = 2,
        lowercase: bool = True,
        lemmatize: bool = True,
        n_top_words: int = 10,
    ) -> str:
        """Run topic modeling to discover latent themes in corpus texts.

        Supports LDA (Latent Dirichlet Allocation) and BERTopic methods.
        LDA is faster and more interpretable; BERTopic uses neural embeddings.

        Args:
            corpus_id: Corpus ID to analyze
            text_ids: Specific text IDs (None = all)
            method: "lda" (recommended) or "bertopic"
            n_topics: Number of topics to extract (default: 5, ignored for BERTopic auto)
            language: Stopword language: "english" or "chinese"
            remove_stopwords: Remove stopwords (default: true)
            min_word_length: Minimum word length to keep (default: 2)
            lowercase: Convert to lowercase (default: true)
            lemmatize: Use lemmatized forms (default: true)
            n_top_words: Number of top words per topic to show (default: 10)
        """
        # Step 1: Preprocess
        preprocess_body: dict = {
            "corpus_id": corpus_id,
            "language": language,
            "remove_stopwords": remove_stopwords,
            "min_word_length": min_word_length,
            "lowercase": lowercase,
            "lemmatize": lemmatize,
            "remove_punctuation": True,
        }
        if text_ids:
            preprocess_body["text_ids"] = text_ids

        prep_result = await client.post(
            "/api/topic-modeling/preprocess", json_data=preprocess_body
        )
        prep_data = prep_result.get("data", {})
        processed_texts = prep_data.get("processed_texts", [])
        doc_count = len(processed_texts)

        if doc_count == 0:
            return "No documents to analyze after preprocessing."

        # Step 2: Analyze
        if method == "lda":
            analyze_body: dict = {
                "corpus_id": corpus_id,
                "n_topics": n_topics,
                "processed_texts": processed_texts,
            }
            if text_ids:
                analyze_body["text_ids"] = text_ids

            result = await client.post(
                "/api/topic-modeling/lda/analyze", json_data=analyze_body
            )
        else:
            analyze_body = {
                "corpus_id": corpus_id,
                "processed_texts": processed_texts,
            }
            if text_ids:
                analyze_body["text_ids"] = text_ids
            result = await client.post(
                "/api/topic-modeling/analyze", json_data=analyze_body
            )

        data = result.get("data", {})
        topics = data.get("topics", [])
        result_id = data.get("result_id", data.get("id", ""))

        if not topics:
            return "Topic modeling produced no topics."

        lines = [
            f"Topic Modeling ({method.upper()}, {n_topics} topics, {doc_count} docs)\n",
        ]
        if result_id:
            lines.append(f"Result ID: {result_id}\n")

        for t in topics:
            topic_id = t.get("id", t.get("topic_id", "?"))
            label = t.get("label", t.get("name", f"Topic {topic_id}"))
            words = t.get("words", t.get("top_words", []))
            weight = t.get("weight", t.get("proportion", 0))

            word_strs = []
            for w in words[:n_top_words]:
                if isinstance(w, dict):
                    word_strs.append(f"{w.get('word', '?')}({w.get('weight', 0):.3f})")
                else:
                    word_strs.append(str(w))

            lines.append(f"  {label} (weight={weight:.3f}):")
            lines.append(f"    {', '.join(word_strs)}")
            lines.append("")

        return "\n".join(lines)
