"""
Shared logic for dynamic topic evolution and Sankey flow.
Used by LDA, LSA, and NMF services for time-sliced topic evolution and topic flow visualization.
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np


def parse_date(date_str: str, date_format: str) -> Optional[str]:
    """Parse date string to normalized format.

    Args:
        date_str: Date string from corpus metadata
        date_format: 'year_only' for just year (e.g., "2020"),
                     'full_date' for complete date (e.g., "2020-03-15")

    Returns:
        Formatted date string or None if parsing fails
    """
    if not date_str:
        return None

    try:
        for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y.%m.%d', '%Y%m%d', '%Y']:
            try:
                dt = datetime.strptime(date_str.strip(), fmt)
                if date_format == 'year_only':
                    return str(dt.year)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue

        year_match = re.search(r'(\d{4})', date_str)
        if year_match:
            return year_match.group(1)
        return None
    except Exception:
        return None


def create_time_slices(
    dates: List[Optional[str]],
    date_format: str,
    nr_bins: Optional[int] = None
) -> Dict[str, Any]:
    """Create time slices from document dates. Dates can contain None (doc without date)."""
    unique_dates = sorted(set(d for d in dates if d))

    if nr_bins and len(unique_dates) > nr_bins:
        step = len(unique_dates) // nr_bins
        binned_dates = [unique_dates[i * step] for i in range(nr_bins)]
        if unique_dates[-1] not in binned_dates:
            binned_dates.append(unique_dates[-1])
        unique_dates = binned_dates

    date_to_slice = {d: i for i, d in enumerate(unique_dates)}

    doc_slices = []
    for d in dates:
        if d is not None and d in date_to_slice:
            doc_slices.append(date_to_slice[d])
        elif d is not None:
            nearest_idx = 0
            for i, ud in enumerate(unique_dates):
                if ud <= d:
                    nearest_idx = i
            doc_slices.append(nearest_idx)
        else:
            doc_slices.append(-1)

    return {
        'timestamps': unique_dates,
        'doc_slices': doc_slices,
        'num_slices': len(unique_dates)
    }


def calculate_topic_evolution(
    doc_topics: List[Dict],
    doc_dates: List[Optional[str]],
    time_slices: Dict[str, Any],
    num_topics: int
) -> Dict[str, Any]:
    """Calculate topic distribution evolution over time."""
    timestamps = time_slices['timestamps']
    doc_slices = time_slices['doc_slices']
    num_slices = len(timestamps)

    topic_counts = np.zeros((num_slices, num_topics))
    slice_doc_counts = np.zeros(num_slices)

    for doc_idx, doc in enumerate(doc_topics):
        if doc_idx < len(doc_slices):
            slice_idx = doc_slices[doc_idx]
            if slice_idx < 0:
                continue
            dist = doc.get('distribution', [])
            if dist:
                for topic_idx, weight in enumerate(dist):
                    if topic_idx < num_topics:
                        topic_counts[slice_idx, topic_idx] += weight
                slice_doc_counts[slice_idx] += 1

    for slice_idx in range(num_slices):
        if slice_doc_counts[slice_idx] > 0:
            topic_counts[slice_idx] /= slice_doc_counts[slice_idx]

    series = []
    for topic_idx in range(num_topics):
        series.append({
            'topic_id': topic_idx,
            'topic_name': f'Topic {topic_idx}',
            'values': topic_counts[:, topic_idx].tolist()
        })

    return {
        'type': 'topics_over_time',
        'timestamps': timestamps,
        'series': series,
        'doc_counts': slice_doc_counts.tolist()
    }


def calculate_sankey_data(
    doc_topics: List[Dict],
    doc_dates: List[Optional[str]],
    time_slices: Dict[str, Any],
    num_topics: int
) -> Dict[str, Any]:
    """Calculate sankey diagram data for topic flow between time slices."""
    timestamps = time_slices['timestamps']
    doc_slices = time_slices['doc_slices']
    num_slices = len(timestamps)

    if num_slices < 2:
        return {'nodes': [], 'links': [], 'timestamps': timestamps, 'num_topics': num_topics}

    nodes = []
    node_id = 0
    node_map = {}

    for slice_idx, timestamp in enumerate(timestamps):
        for topic_idx in range(num_topics):
            nodes.append({
                'id': node_id,
                'name': f'T{topic_idx}',
                'timestamp': timestamp,
                'topic_id': topic_idx,
                'slice_idx': slice_idx
            })
            node_map[(slice_idx, topic_idx)] = node_id
            node_id += 1

    topic_transitions = np.zeros((num_slices - 1, num_topics, num_topics))
    slice_docs = [[] for _ in range(num_slices)]
    for doc_idx, doc in enumerate(doc_topics):
        if doc_idx < len(doc_slices):
            slice_idx = doc_slices[doc_idx]
            if slice_idx >= 0:
                slice_docs[slice_idx].append((doc_idx, doc))

    for slice_idx in range(num_slices - 1):
        curr_topic_weights = np.zeros(num_topics)
        next_topic_weights = np.zeros(num_topics)

        for _, doc in slice_docs[slice_idx]:
            dist = doc.get('distribution', [])
            for t_idx, w in enumerate(dist):
                if t_idx < num_topics:
                    curr_topic_weights[t_idx] += w

        for _, doc in slice_docs[slice_idx + 1]:
            dist = doc.get('distribution', [])
            for t_idx, w in enumerate(dist):
                if t_idx < num_topics:
                    next_topic_weights[t_idx] += w

        if curr_topic_weights.sum() > 0:
            curr_topic_weights /= curr_topic_weights.sum()
        if next_topic_weights.sum() > 0:
            next_topic_weights /= next_topic_weights.sum()

        for from_topic in range(num_topics):
            for to_topic in range(num_topics):
                flow = curr_topic_weights[from_topic] * next_topic_weights[to_topic]
                topic_transitions[slice_idx, from_topic, to_topic] = flow

    links = []
    for slice_idx in range(num_slices - 1):
        for from_topic in range(num_topics):
            for to_topic in range(num_topics):
                flow_value = topic_transitions[slice_idx, from_topic, to_topic]
                if flow_value > 0.01:
                    source_node = node_map[(slice_idx, from_topic)]
                    target_node = node_map[(slice_idx + 1, to_topic)]
                    links.append({
                        'source': source_node,
                        'target': target_node,
                        'value': float(flow_value),
                        'from_topic': from_topic,
                        'to_topic': to_topic,
                        'from_timestamp': timestamps[slice_idx],
                        'to_timestamp': timestamps[slice_idx + 1]
                    })

    return {
        'nodes': nodes,
        'links': links,
        'timestamps': timestamps,
        'num_topics': num_topics
    }
