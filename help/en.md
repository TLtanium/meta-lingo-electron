# Meta-Lingo User Manual

Welcome to Meta-Lingo, a modern multimodal corpus research software. This manual will help you master all features of the software.

# About Meta-Lingo

## Introduction

![Meta-Lingo](assets/Background2.jpg)

**Meta-Lingo** is a modern multimodal corpus research platform, providing intelligent end-to-end solutions for linguistic research.

### Key Features

- **Local Execution**: Runs entirely locally, no internet connection required
- **Privacy Protection**: Data stored locally, protecting research data privacy
- **Free to Use**: Free for academic research
- **Multimodal Support**: Supports text, audio, video and other corpus types
- **Intelligent Annotation**: Integrates SpaCy, Whisper, YOLO, CLIP and other advanced models

### Technology Stack

Meta-Lingo is built with the following technologies:

- **Frontend**: Electron + React + TypeScript + Material-UI
- **Backend**: Python + FastAPI
- **NLP**: SpaCy, NLTK, Transformers
- **Multimodal**: Whisper (speech transcription), YOLO (object detection), CLIP (semantic classification)
- **Topic Modeling**: BERTopic, LDA, LSA, NMF

## Feature Overview

Meta-Lingo provides 12 core functional modules:

| Module | Description |
|--------|-------------|
| **Corpus Management** | Upload, organize and manage multimodal corpus data |
| **Word Frequency** | Word frequency analysis, POS filtering, multi-dimensional visualization |
| **Synonym Analysis** | WordNet-based synonym relationship analysis |
| **Keyword Extraction** | TF-IDF, TextRank, YAKE, RAKE and other algorithms |
| **N-gram Analysis** | 2-6 gram combination frequency statistics and pattern discovery |
| **Collocation** | KWIC search, CQL queries, collocation analysis |
| **Semantic Analysis** | USAS semantic domain classification and statistics |
| **Word Sketch** | Word Sketch grammatical collocation analysis |
| **Bibliographic Visualization** | Literature data import and visualization analysis |
| **Annotation Mode** | Multi-level text annotation and multimodal annotation |
| **Topic Modeling** | BERTopic, LDA, LSA, NMF topic discovery |
| **Dictionary Query** | Multi-dictionary integrated query |

## Developer

![Developer Avatar](assets/avatar.png)

### Tommy Leo

Developer of Meta-Lingo, a master's student majoring in Business English Language Research at Guangdong University of Foreign Studies (starting 2025).

### Motivation

While using traditional language research tools, I found some limitations:

- Complex operations with high learning curves
- Functions scattered across different software, requiring frequent switching
- Lack of unified data management and analysis workflow
- Limited support for multimodal corpora

### Vision

To create an **All-in-One** language research software that integrates word frequency analysis, collocation analysis, semantic analysis, topic modeling and other functions in one platform. Meta-Lingo combines the latest NLP models and large language model technologies, running completely locally to ensure data privacy while providing powerful analytical capabilities.

### Contact

If you have any questions or suggestions while using the software, feel free to contact me:

- **Bilibili**: [https://space.bilibili.com/294707614](https://space.bilibili.com/294707614)
- **Xiaohongshu**: [https://www.xiaohongshu.com/user/profile/5af2c7734eacab77509ec3af](https://www.xiaohongshu.com/user/profile/5af2c7734eacab77509ec3af)
- **YouTube**: [https://www.youtube.com/@metalingo2026](https://www.youtube.com/@metalingo2026)
- **Email**: 1683619168tl@gmail.com

## Disclaimer

This software is a personal development project, non-commercial, and not official software of Guangdong University of Foreign Studies. Using this software means you agree to comply with the relevant license agreement.

---

# Corpus Management

The Corpus Management module is the core feature of Meta-Lingo, used for uploading, organizing, and managing your multimodal corpus data.

## Interface Overview

The Corpus Management module contains three main tabs:

- **Upload**: Create new corpora or upload files to existing corpora
- **Corpus List**: Browse and manage all corpora
- **Corpus Detail**: View detailed information and text list of a corpus

## Creating a Corpus

### Creating a New Corpus

1. Go to the "Upload" tab
2. Check the "Create New Corpus" option
3. Fill in the corpus metadata:
   - **Name** (required): Set a meaningful name for your corpus
   - **Language**: Select the primary language (supports Chinese and English)
   - **Text Type**: Select the text type for USAS semantic domain disambiguation
   - **Source**: Select or customize the corpus source
   - **Author**: Enter author information
   - **Date** (required): Select the creation or publication date
   - **Description**: Add a detailed description
   - **Tags**: Add tags for categorization and retrieval

### Uploading to Existing Corpus

1. Uncheck "Create New Corpus"
2. Select the target corpus from the dropdown
3. Select text type (will apply to all uploaded files)
4. Select date (required, will apply to all uploaded files)

## Uploading Files

### Supported File Formats

Meta-Lingo supports various file formats:

| Type | Supported Formats |
|------|-------------------|
| Text | .txt |
| Audio | .mp3, .wav, .m4a, .flac, .ogg |
| Video | .mp4, .avi, .mkv, .mov, .webm |

### Upload Methods

- **Drag and Drop**: Drag files directly to the upload area
- **Click to Upload**: Click the upload area to select files from file manager

Batch upload of multiple files is supported.

### Processing Options

When uploading audio/video files, you can configure the following processing options:

#### Audio Transcription (Whisper)

When enabled, the system will automatically transcribe audio using Whisper Large V3 Turbo model:
- Word-level timestamps supported
- Automatic SpaCy annotation
- Transcription results saved sentence by sentence

#### YOLO Object Detection

For video files, when enabled, YOLOv8 will perform:
- Object detection
- Target tracking
- Results saved in JSON format

#### CLIP Semantic Classification

For video files, when enabled, CLIP model will perform frame-by-frame semantic classification:

- **Preset Label Categories**:
  - Objects: person, animal, vehicle, food, text, logo
  - Scenes: indoor, outdoor, nature, building, urban, rural
  - Mood: bright, dark, colorful, monochrome, warm, cool
  - Dynamics: action, static, crowded, empty, fast, slow

- **Custom Labels**: Add any custom classification labels

- **Frame Interval Settings**:
  - Default: classify every 30 frames
  - Set to 1 for frame-by-frame annotation
  - Smaller intervals increase processing time

### Upload Progress

After uploading audio/video files, the system processes them asynchronously in the background. You can view in real-time:

- **Processing Stage**: Initializing → Extract Audio → Transcribing → SpaCy Annotation → YOLO Detection → CLIP Classification → Saving
- **Progress Percentage**: Real-time display of current progress
- **Status Message**: Shows current operation being performed

The corpus detail will automatically refresh when processing completes.

## Corpus List

### View Modes

- **Card View**: Display corpora as cards showing statistics and tags
- **List View**: Display as table for batch operations

### Filtering

- **Search**: Search corpora by name, description, or tags
- **Language Filter**: Filter corpora by language
- **Tag Filter**: Filter corpora by tags

### Corpus Operations

Right-click or click the menu button to:

- **View Details**: Go to corpus detail page
- **Edit**: Modify corpus metadata
- **Delete**: Delete corpus and all its contents (irreversible)

## Corpus Detail

### Metadata Panel

The left side displays basic corpus information:
- Language
- Author
- Source
- Text Type
- Description
- Tags

### Text List

The right table displays all texts in the corpus:

| Column | Description |
|--------|-------------|
| Type | Text/Audio/Video icon |
| Filename | Original filename and processing status tags |
| Words | Word count of text or transcription |
| Duration | Duration of audio/video |
| Date | Date metadata |
| Author | Text author |
| Source | Text source |
| Text Type | Text type |
| Tags | Text tags |
| Actions | Edit, view, delete buttons |

### Text Filtering

- **Search Box**: Search by filename or tags
- **Type Filter**: Filter text, audio, or video files

### Batch Re-annotation

After selecting one or more texts, you can perform batch re-annotation:

#### SpaCy Re-annotation
- Re-run Part-of-Speech tagging (POS)
- Named Entity Recognition (NER)
- Dependency parsing

#### YOLO Re-annotation
- Only for video files
- Re-run object detection and tracking

#### CLIP Re-annotation
- Only for video files
- Re-select classification labels
- Adjust frame interval

#### USAS Re-annotation
- Re-run semantic domain tagging
- Uses latest priority domain settings

### Viewing Text Content

Click on a text row to view detailed content:

- **Text Files**: Display plain text content
- **Audio Files**: Display audio player and transcription
- **Video Files**: Display video player and transcription

Transcription is displayed with timestamps; click a segment to seek playback.

### Editing Features

Click the "Edit" button to:

#### Direct Edit
- Text corpus: Directly edit text content
- Audio/Video transcription: Edit transcription sentence by sentence

#### Find/Replace
- Plain text search supported
- Regular expressions supported
- Case-sensitive option

#### Entity Extraction
Extract and remove from text:
- Email addresses
- URLs
- Phone numbers
- IP addresses

#### Text Normalization
- Unicode normalization (NFKC)
- Whitespace normalization
- Merge consecutive line breaks
- Remove special characters
- Remove HTML tags
- Remove control characters

### Tag Management

- **Add Tag**: Click the plus button on a text row
- **Remove Tag**: Click the delete icon on a tag

### Metadata Editing

Click the edit icon to modify text metadata:
- Date
- Author
- Source

## Automatic Annotation Features

### SpaCy Automatic Annotation

When uploading text, the system automatically performs SpaCy annotation:
- **POS Tagging**: Uses Universal POS tagset
- **Named Entity Recognition (NER)**: Identifies persons, locations, organizations, etc.
- **Dependency Parsing**: Analyzes syntactic relationships between words
- **Lemmatization**: Gets the base form of words

### USAS Semantic Domain Tagging

The system automatically performs USAS semantic domain tagging:
- Based on PyMUSAS tagging engine
- Supports Chinese and English
- Discourse domain disambiguation
- One-sense-per-discourse disambiguation
- Priority domains configurable in settings

## Data Storage

### Storage Locations

- **Metadata**: Stored in SQLite database (`data/database.sqlite`)
- **Text Files**: Stored in `data/corpora/{corpus_name}/files/`
- **Audio Files**: Stored in `data/corpora/{corpus_name}/audios/`
- **Video Files**: Stored in `data/corpora/{corpus_name}/videos/`
- **Annotation Data**: Stored in JSON format in corresponding directories

### Backup Recommendations

Regularly backup the `data/` directory to protect your corpus data.

## Troubleshooting

### Upload Failed?

1. Check if file format is supported
2. Check if file size is too large
3. Ensure backend service is running
4. Check console for error messages

### Transcription Inaccurate?

1. Ensure audio quality is clear
2. Select correct transcription language
3. Can manually edit transcription text

### Processing Stuck?

1. Audio/video processing takes time, please be patient
2. Refresh page to see latest status
3. If unresponsive for long time, check backend service

## Usage Tips

### Upload Large Corpora in Batches

For large corpora, it is recommended to upload in multiple batches:

- **Reason**: Long upload times may cause frontend-backend connection timeout
- **Recommendation**: Upload 50-100 text files per batch, or total size under 500MB
- **Audio/Video**: Due to transcription and annotation requirements, upload 5-10 files per batch

### Handling Upload Stuck

If the upload process gets stuck (usually due to connection timeout):

1. **Restart the Application**: Close and reopen Meta-Lingo
2. **Check Annotation Status**: View text annotation status in corpus details
3. **Re-annotate**:
   - For texts with incomplete SpaCy annotation, select and click "SpaCy Re-annotate" button
   - For texts with incomplete USAS annotation, select and click "USAS Re-annotate" button
4. **Batch Processing**: Select multiple texts for batch re-annotation

### Data Retention

**Important**: Your corpus data will be retained in the following cases:

- **Deleting the Application**: Directly deleting the application will not delete corpus data
- **Reinstalling New Version**: Corpus data will be automatically retained when upgrading or reinstalling
- **Data Location**: Corpus data is stored in the `data/` directory, separate from the application

**Note**: Only using the "Factory Reset" function in "Application Settings" and checking the corresponding options will delete corpus data.

# Word Frequency Analysis

## Overview

The Word Frequency Analysis module provides comprehensive word frequency statistics based on SpaCy annotation data. It supports POS filtering, multiple search modes, frequency range filtering, and rich visualization options.

## Interface Layout

The Word Frequency Analysis module uses a left-right split layout:

- **Left Panel** (400px): Configuration panel containing corpus selection, POS filtering, search configuration, etc.
- **Right Panel** (flexible width): Results display area with two tabs
  - **Results Table**: Displays word frequency statistics
  - **Visualization**: Provides various chart displays

## Corpus Selection

### Selecting a Corpus

1. Select the target corpus from the dropdown menu at the top of the left panel
2. The system displays the number of texts in the corpus
3. After selecting a corpus, the system automatically loads all texts in that corpus

### Text Selection Modes

The system provides three text selection modes:

#### All Texts
- Select "All Texts" mode
- Analysis will include all texts in the corpus
- Displays total number of texts

#### Filter by Tags
- Select "Filter by Tags" mode
- Select one or more tags from the dropdown menu
- The system filters all texts containing these tags
- Displays the number of filtered texts

#### Manual Selection
- Select "Manual Selection" mode
- Use the search box to search texts by filename
- Check the texts you want to analyze in the text list
- Supports "Select All" and "Clear All" quick actions
- Displays the number of selected texts

### Selection Status Indicator

After selection, the system displays:
- Number of selected texts
- Success/warning indicator (based on selection count)

## POS Filtering

POS filtering is based on the SpaCy Universal POS tagset, allowing you to analyze only words of specific parts of speech.

### Filter Modes

#### Keep Mode
- Select "Keep Mode"
- Only count words with selected POS tags
- Example: Selecting NOUN and VERB will only count nouns and verbs

#### Filter Mode
- Select "Filter Mode"
- Exclude words with selected POS tags
- Example: Selecting PUNCT will exclude all punctuation marks

### POS Tag Categories

The system categorizes POS tags into three groups for easy selection:

#### Content Words
- **NOUN**: Noun
- **VERB**: Verb
- **ADJ**: Adjective
- **ADV**: Adverb
- **PROPN**: Proper noun

#### Function Words
- **ADP**: Adposition
- **AUX**: Auxiliary verb
- **CCONJ**: Coordinating conjunction
- **DET**: Determiner
- **PART**: Particle
- **PRON**: Pronoun
- **SCONJ**: Subordinating conjunction

#### Other
- **INTJ**: Interjection
- **NUM**: Numeral
- **PUNCT**: Punctuation
- **SYM**: Symbol
- **X**: Other

### Quick Actions

- **Select All**: Quickly select all POS tags
- **Clear All**: Clear all selections

### Usage Tips

- When analyzing content words, use "Keep Mode" to select content word categories
- When analyzing verbs, use "Keep Mode" and select only VERB
- To exclude punctuation, use "Filter Mode" and select PUNCT

## Search Configuration

The Search Configuration panel provides various filtering and search options to help you precisely locate target words.

### Frequency Range

Set the frequency range for words:

- **Minimum Frequency**: Only display words with frequency greater than or equal to this value (default: 1)
- **Maximum Frequency**: Only display words with frequency less than or equal to this value (optional, set to 0 for no limit)

### Case Handling

- **Convert to Lowercase**: When checked, all words are converted to lowercase for statistics
- Recommendation: Enable when analyzing English to merge case variants

### Search Target

Select the target form for statistics:

- **Word Form**: Use the original word form (e.g., "running", "runs", "ran" are counted separately)
- **Lemma Form**: Use the lemma form (e.g., "running", "runs", "ran" are all counted as "run")

**Usage Tips**:
- Word form mode: Suitable for analyzing specific word usage forms
- Lemma mode: Suitable for analyzing semantic distribution, merging different variants of the same word

### Search Types

#### All
- No search filtering, count all words meeting the criteria

#### Starts With
- Only count words starting with the specified string
- Example: Enter "un" to count "unhappy", "unclear", etc.

#### Ends With
- Only count words ending with the specified string
- Example: Enter "ing" to count "running", "playing", etc.

#### Contains
- Only count words containing the specified string
- Example: Enter "tion" to count "action", "education", etc.

#### Regular Expression (Regex)
- Use regular expressions for advanced matching
- Supports full regular expression syntax
- Example: `^[A-Z].*` matches all words starting with uppercase letters

#### Wordlist
- Enter a word list (one per line)
- Only count words in the list
- Suitable for analyzing specific vocabulary sets

### Exclude Words

Enter words to exclude in the "Exclude Words" text box (one per line). These words will not appear in the statistics.

**Use Cases**:
- Exclude stop words
- Exclude specific interference words
- Exclude proper nouns like names and places

## Running Analysis

After configuration, click the "Start Analysis" button:

1. The system displays loading progress
2. After analysis completes, results automatically appear in the right panel
3. If errors occur, error messages are displayed in the left panel

## Results Table

### Statistics

The top of the table displays statistical summary:

- **Total Tokens**: Total count of all words meeting the criteria
- **Unique Words**: Number of non-duplicate words
- **Selected**: Number of currently selected words (if any)

### Table Columns

| Column | Description |
|--------|-------------|
| Rank | Ranking sorted by frequency |
| Word | The word itself |
| Frequency | Occurrence count |
| Percentage | Percentage of total tokens |
| Actions | Quick action menu (if enabled) |

### Sorting

Click column headers to sort:

- **Rank**: Sort by frequency ranking
- **Word**: Sort alphabetically
- **Frequency**: Sort by occurrence count
- **Percentage**: Sort by percentage

Supports ascending/descending toggle.

### Table Filtering

Enter keywords in the search box at the top of the table to filter words in real-time.

### Selection

- **Single Select**: Click table rows to select/deselect words
- **Select All on Page**: Click the checkbox in the header to select all words on the current page
- **Select All**: Click the "Select All" button in the toolbar to select all words

### Quick Actions

The table toolbar provides the following actions:

- **Select All/Deselect All**: Quickly select or deselect all words
- **Copy Selected**: Copy the selected word list to clipboard (one per line)
- **Export CSV**: Export results as CSV file
  - If words are selected, only exports selected words
  - Otherwise exports all results

### Pagination

- Supports 10, 25, 50, 100 rows per page
- Switch pages and rows per page at the bottom of the table

### Cross-module Links

If cross-module linking is enabled, the table displays an "Actions" column providing:

- **Collocation Analysis**: Jump to Collocation Analysis module to analyze co-occurrence relationships
- **Word Sketch**: Jump to Word Sketch module to view grammatical patterns

## Visualization

The Visualization panel provides three chart types to help you intuitively understand word frequency distribution.

### Chart Type Switching

Switch chart types via top tabs:

- **Bar Chart**: Suitable for displaying top N high-frequency words
- **Pie Chart**: Suitable for displaying word proportion distribution
- **Word Cloud**: Suitable for displaying overall vocabulary distribution

### Bar Chart

#### Configuration Options

- **Max Display Count**: Set how many words to display (default: 20, range: 5-50)
- **Color Scheme**: Select color theme for bars (blue, green, purple, orange, red)
- **Show Percentage**: Whether to display percentage labels on bars

#### Interactive Features

- Click bars to jump to results table and select that word
- Chart height automatically adjusts based on display count

### Pie Chart

#### Configuration Options

- **Max Display Count**: Set how many words to display (default: 10, range: 5-20)
- **Color Scheme**: Select color theme for pie chart
- **Show Percentage**: Whether to display percentage labels on pie slices

#### Chart Features

- Uses donut chart design
- Displays legend for easy identification
- Click slices to jump to results table

### Word Cloud

#### Configuration Options

- **Max Words**: Set number of words to display in word cloud (default: 100, range: 5-500)
- **Color Mapping**: Select color scheme for word cloud
  - Supports multiple presets: viridis, inferno, plasma, autumn, winter, rainbow, ocean, forest, sunset

#### Chart Features

- Word size automatically adjusts based on frequency
- Color maps to different color scales based on frequency
- Click words to jump to results table

### Export Features

All charts support export:

- **Export SVG**: Export as vector format, suitable for printing and editing
- **Export PNG**: Export as bitmap format, suitable for inserting into documents

Export buttons are located on the right side of the chart settings bar.

## Usage Tips

### Efficient Analysis Workflow

1. **Select Corpus**: Choose appropriate corpus based on research goals
2. **Filter Texts**: Use tags or manual selection to focus on target texts
3. **Set POS**: Select relevant parts of speech based on research questions
4. **Configure Search**: Use search and exclude functions to precisely locate target words
5. **View Results**: View detailed data in the table
6. **Visualize Analysis**: Use charts to discover patterns and trends
7. **Export Data**: Export results for further analysis

### Common Analysis Scenarios

#### Analyzing High-Frequency Content Words
1. Select "Keep Mode" for POS filtering
2. Select content word categories (NOUN, VERB, ADJ, ADV)
3. Set minimum frequency (e.g., 10)
4. Enable "Convert to Lowercase"
5. Select "Lemma" mode

#### Analyzing Specific Affixes
1. Select "Ends With" search type
2. Enter affix (e.g., "tion")
3. Set appropriate frequency range

#### Analyzing Wordlist Vocabulary
1. Prepare word list (one per line)
2. Select "Wordlist" search type
3. Paste word list
4. Run analysis

### Notes

- Word frequency analysis is based on SpaCy annotation data; ensure texts have completed SpaCy annotation
- Analysis of large corpora may take time; please be patient
- When using lemma mode, different variants of the same word are merged in statistics
- Regular expression search requires some regex knowledge
- When exporting CSV, large datasets may take some time

# Synonym Analysis

## Overview

The Synonym Analysis module is based on the NLTK WordNet dictionary and automatically identifies synonym relationships for words in your corpus. This module helps you discover semantic associations between words, understand vocabulary semantic networks, and supports multiple visualization methods.

## Analysis Principles

### Technical Foundation

The Synonym Analysis module uses the following technical components:

- **NLTK WordNet**: The lexical database developed by Princeton University
- **Open Multilingual Wordnet (omw-1.4)**: Multilingual WordNet extension
- **SpaCy POS Tagging**: Used to determine WordNet POS for words

### Synonym Matching Process

1. **POS Mapping**: Map SpaCy's Universal POS tags to WordNet POS
   - NOUN -> n (noun)
   - VERB -> v (verb)
   - ADJ -> a (adjective)
   - ADV -> r (adverb)

2. **Synset Query**: Query WordNet synsets based on word and POS

3. **Lemma Extraction**: Extract all lemmas from each synset as synonyms

4. **Corpus Filtering**: **Only retain synonyms that actually appear in the current corpus**
   - This means analysis results show only words existing in your corpus
   - Useful for discovering vocabulary substitution patterns and semantic associations in your corpus

### Important Notes

- **Synonym Source**: Synonyms come from the WordNet dictionary, not computed within the corpus
- **Result Filtering**: Only displays synonym pairs that exist in the corpus
- **POS Constraints**: Synonym matching considers POS for semantic accuracy
- **Frequency Statistics**: Displayed frequency is the occurrence count of synonyms in the corpus

### References

- Miller, G. A. (1995). WordNet: A Lexical Database for English. *Communications of the ACM*, 38(11), 39-41.
- Fellbaum, C. (1998). *WordNet: An Electronic Lexical Database*. MIT Press.

## Interface Layout

The Synonym Analysis module uses a left-right split layout:

- **Left Panel** (400px): Configuration panel containing corpus selection, POS filtering, search configuration, etc.
- **Right Panel** (flexible width): Results display area with two tabs
  - **Results Table**: Displays synonym analysis results
  - **Visualization**: Provides three visualization methods: network graph, tree view, and list view

## Corpus Selection

### Selecting a Corpus

1. Select the target corpus from the dropdown menu at the top of the left panel
2. The system displays the number of texts in the corpus
3. After selecting a corpus, the system automatically loads all texts in that corpus

### Text Selection Modes

The system provides three text selection modes, same as the Word Frequency Analysis module:

#### All Texts
- Select "All Texts" mode
- Analysis will include all texts in the corpus

#### Filter by Tags
- Select "Filter by Tags" mode
- Select one or more tags from the dropdown menu
- The system filters all texts containing these tags

#### Manual Selection
- Select "Manual Selection" mode
- Use the search box to search texts by filename
- Check the texts you want to analyze in the text list
- Supports "Select All" and "Clear All" quick actions

## POS Filtering

POS filtering is used to limit the analysis scope to words of specific parts of speech.

### POS Options

- **Auto**: System automatically identifies POS based on SpaCy annotations (recommended)
- **Adjective**: Analyze only adjectives
- **Adverb**: Analyze only adverbs
- **Noun**: Analyze only nouns
- **Verb**: Analyze only verbs
- **Pronoun**: Analyze only pronouns (Note: WordNet has limited support for pronouns)

### Usage Tips

- **Auto Mode**: Suitable for most scenarios; the system looks up synonyms based on the actual POS of words in the corpus
- **Specific POS**: Use when you want to analyze a specific word class, e.g., only analyze verb synonym relationships
- **Pronoun Note**: WordNet has limited synonym support for pronouns; selecting pronoun mode may return fewer results

## Search Configuration

### Search Query

Enter keywords in the "Search Query" text box to analyze only words containing the keyword.

- **Supports fuzzy matching**: Entering "happy" will match "happy", "unhappy", "happiness", etc.
- **Leave empty for all**: No input means analyzing all words meeting the criteria

### Frequency Settings

- **Minimum Frequency**: Only analyze words with frequency greater than or equal to this value (default: 1)
- **Maximum Results**: Limit the number of results returned (default: 100, range: 10-500)

### Case Handling

- **Convert to Lowercase**: When checked, all words are converted to lowercase for statistics
- Recommendation: Enable when analyzing English to merge case variants

## Running Analysis

After configuration, click the "Start Analysis" button:

1. The system displays loading progress
2. After analysis completes, results automatically appear in the right panel
3. If errors occur, error messages are displayed in the left panel

**Note**: Synonym analysis is based on the WordNet dictionary and primarily supports English. For Chinese corpora, the system will attempt to find corresponding English synonyms, but results may be limited.

## Results Table

### Statistics

The top of the table displays statistical summary:

- **Total Words**: Total count of all words meeting the criteria
- **Unique Words**: Number of non-duplicate words
- **Selected**: Number of currently selected words (if any)

### Table Columns

| Column | Description |
|--------|-------------|
| Word | Word in the corpus |
| Frequency | Occurrence count of the word in the corpus |
| POS Tags | POS tags of the word in the corpus (may have multiple) |
| Synonym Count | Total number of synonyms found |
| Synonyms | Synonym list (first 5, click to expand for all) |
| Actions | Quick action menu (if enabled) |

### Expanded Row Details

Click the expand button on the left side of a table row to view detailed synset information:

#### All Synonyms Summary
- Displays all synonyms of the word (deduplicated)
- Shown as tags for easy browsing

#### Synset Details
Each synset contains:
- **Synset Name**: Synset identifier in WordNet
- **POS**: POS tag of the synset
- **Definition**: Semantic definition of the synset
- **Examples**: Usage examples (if available)
- **Synonym List**: All synonyms in the synset

### Sorting

Click column headers to sort:

- **Word**: Sort alphabetically
- **Frequency**: Sort by occurrence count
- **Synonym Count**: Sort by number of synonyms

Supports ascending/descending toggle.

### Table Filtering

Enter keywords in the search box at the top of the table to filter words or synonyms in real-time.

### Selection

- **Single Select**: Click the checkbox in a table row to select/deselect words
- **Select All**: Click the checkbox in the header or the "Select All" button in the toolbar

### Quick Actions

The table toolbar provides the following actions:

- **Select All/Deselect All**: Quickly select or deselect all words
- **Copy Selected**: Copy the selected word list to clipboard (one per line)
- **Export CSV**: Export results as CSV file
  - Includes word, frequency, POS tags, synonym count, synonym list, etc.

### Pagination

- Supports 10, 25, 50, 100 rows per page
- Switch pages and rows per page at the bottom of the table

### Cross-module Links

If cross-module linking is enabled, the table displays an "Actions" column providing:

- **Collocation Analysis**: Jump to Collocation Analysis module to analyze co-occurrence relationships
- **Word Sketch**: Jump to Word Sketch module to view grammatical patterns

## Visualization

The Visualization panel provides three view types to help you intuitively understand synonym relationships.

### View Type Switching

Switch view types via top tabs:

- **Network Graph**: Force-directed graph showing word-synonym relationship networks
- **Tree View**: Tree structure showing hierarchical synonym relationships
- **List View**: List format displaying all words and their synonyms

### Network Graph

The network graph uses a force-directed layout to show associations between words and synonyms.

#### Configuration Options

- **Max Nodes**: Set the number of words to display (default: 50, range: 5-200)
- **Color Scheme**: Select color theme for the network graph
  - Default
  - Category
  - Pastel
  - Warm
  - Cool
- **Show Definitions**: Whether to display semantic definitions on mouse hover

#### Interactive Features

- **Drag Nodes**: Drag nodes to adjust positions
- **Zoom**: Use mouse wheel to zoom the view
- **Click Word Nodes**: Click word nodes to jump to results table and select the word
- **Hover Tooltip**: Mouse hover on nodes shows word information and definitions (if enabled)

#### Node Types

- **Word Nodes** (larger circles): Words in the corpus, darker color
- **Synonym Nodes** (smaller circles): Synonyms from WordNet, lighter color

### Tree View

The tree view displays synonym relationships in a hierarchical structure, from root node to words, then to synsets, and finally to specific synonyms.

#### Configuration Options

- **Max Nodes**: Set the number of words to display (default: 5, range: 5-1000)
- **Color Scheme**: Select color theme for the tree view
- **Show Definitions**: Whether to display synset semantic definitions on mouse hover

#### Interactive Features

- **Zoom**: Use mouse wheel to zoom the view
- **Click Word Nodes**: Click word nodes to jump to results table
- **Hover Tooltip**: Mouse hover on nodes shows definitions (if enabled)

#### Hierarchy Structure

- **Root Node**: Root node of all synonyms
- **Word Nodes**: Words in the corpus (shows frequency)
- **Synset Nodes**: WordNet synsets
- **Synonym Nodes**: Specific synonyms

### List View

The list view displays all words and their synonyms in card format, suitable for quick browsing.

#### Configuration Options

- **Max Display Count**: Set the number of words to display (default: 200, range: 5-1000)

#### Display Content

Each card displays:
- **Word Name**: Word in the corpus
- **Frequency**: Occurrence count
- **Synonym Count**: Total number of synonyms found
- **Synonym List**: First 15 synonyms (shown as tags)
- **Definition**: Semantic definition of the first synset (if available)

#### Interactive Features

- **Click Card**: Click card to jump to results table and select the word

### Export Features

All views support export:

- **Export SVG**: Export as vector format, suitable for printing and editing
- **Export PNG**: Export as bitmap format, suitable for inserting into documents

Export buttons are located on the right side of the view settings bar.

**Note**:
- Network and tree views export all visible content
- List view export includes all list items (may require scrolling to view)

## Usage Tips

### Efficient Analysis Workflow

1. **Select Corpus**: Choose appropriate corpus based on research goals
2. **Filter Texts**: Use tags or manual selection to focus on target texts
3. **Set POS**: Select relevant parts of speech based on research questions (or use auto mode)
4. **Configure Search**: Use search query and frequency settings to precisely locate target words
5. **View Results**: View detailed data in the table, expand rows to view synset details
6. **Visualize Analysis**: Use network graph or tree view to discover semantic association patterns
7. **Export Data**: Export results for further analysis

### Common Analysis Scenarios

#### Analyzing Verb Synonyms
1. Select "Verb" POS filter
2. Set minimum frequency (e.g., 5)
3. Run analysis
4. View verb synonym relationship network in the network graph

#### Analyzing Specific Topic Vocabulary
1. Enter topic keyword in search query (e.g., "happy")
2. Use auto POS mode
3. Run analysis
4. View synonym hierarchy structure for the topic in the tree view

#### Building Vocabulary Semantic Network
1. Select all texts
2. Set larger maximum results (e.g., 200)
3. Run analysis
4. View overall semantic network in the network graph
5. Adjust max nodes to control network complexity

### Notes

- Synonym analysis is based on NLTK WordNet dictionary and primarily supports English
- Synonym lookup results for Chinese corpora may be limited
- WordNet has limited support for certain parts of speech (e.g., pronouns)
- Analysis of large corpora may take time; please be patient
- Network and tree views may be slow when node count is high
- Synsets may contain multiple meanings; need to understand in context with definitions
- Some words may have no synonyms, which is normal

# Keyword Extraction

## Overview

The Keyword Extraction module provides two keyword extraction methods: single-document algorithms and keyness comparison. Single-document algorithms extract keywords from a single corpus, while keyness comparison identifies statistically significant keywords by comparing a study corpus against a reference corpus.

## Theoretical Foundation and References

### Single-Document Keyword Extraction Algorithms

#### TF-IDF (Term Frequency-Inverse Document Frequency)

**Principle**: TF-IDF measures word importance by multiplying the frequency of a word in a single document (TF) by its rarity across the entire corpus (IDF).

$$\text{TF-IDF}(t, d, D) = \text{TF}(t, d) \times \text{IDF}(t, D)$$

where $\text{IDF}(t, D) = \log \frac{|D|}{|\{d \in D : t \in d\}|}$

**References**:
- Salton, G., & McGill, M. J. (1983). *Introduction to Modern Information Retrieval*. McGraw-Hill.
- Implementation based on scikit-learn's TfidfVectorizer

#### TextRank

**Principle**: TextRank is a graph-based ranking algorithm inspired by PageRank. It treats words in text as graph nodes and co-occurrence relationships as edges, iteratively calculating importance scores for nodes.

$$WS(V_i) = (1-d) + d \times \sum_{V_j \in In(V_i)} \frac{w_{ji}}{\sum_{V_k \in Out(V_j)} w_{jk}} WS(V_j)$$

**References**:
- Mihalcea, R., & Tarau, P. (2004). TextRank: Bringing Order into Texts. *Proceedings of EMNLP 2004*, 404-411.

#### YAKE!

**Principle**: YAKE! is an unsupervised keyword extraction method that considers multiple statistical features of words: frequency, position, word length, capitalization, and relationship with context words.

**References**:
- Campos, R., Mangaravite, V., Pasquali, A., Jorge, A., Nunes, C., & Jatowt, A. (2020). YAKE! Keyword extraction from single documents using multiple local features. *Information Sciences*, 509, 257-289.

#### RAKE

**Principle**: RAKE (Rapid Automatic Keyword Extraction) segments text by identifying stop words and punctuation, treats remaining word sequences as candidate key phrases, then calculates scores based on word degree and frequency.

$$\text{Score}(w) = \frac{\text{deg}(w)}{\text{freq}(w)}$$

**References**:
- Rose, S., Engel, D., Cramer, N., & Cowley, W. (2010). Automatic Keyword Extraction from Individual Documents. In *Text Mining: Applications and Theory* (pp. 1-20). Wiley.

### Keyness Comparison Statistical Methods

#### Log-Likelihood (G2)

**Principle**: Log-likelihood ratio test, used to compare differences in word distribution between two corpora, the most commonly used keyness test in corpus linguistics.

$$G^2 = 2 \sum_{i} O_i \ln\frac{O_i}{E_i}$$

**References**:
- Dunning, T. (1993). Accurate Methods for the Statistics of Surprise and Coincidence. *Computational Linguistics*, 19(1), 61-74.

#### Chi-Square (X2)

**Principle**: Chi-square test, comparing the difference between observed and expected frequencies.

$$\chi^2 = \sum \frac{(O - E)^2}{E}$$

**References**:
- Rayson, P., & Garside, R. (2000). Comparing corpora using frequency profiling. *Proceedings of the Workshop on Comparing Corpora*, 1-6.

#### Fisher Exact Test

**Principle**: Exact test suitable for small sample data, calculating exact probabilities based on hypergeometric distribution.

**References**:
- Pedersen, T. (1996). Fishing for exactness. *Proceedings of the South-Central SAS Users Group Conference*.

#### Effect Size Measures

- **%DIFF**: Percentage difference
- **Ratio**: Frequency ratio
- **Odds Ratio**: Odds ratio
- **Dice Coefficient**: Dice similarity coefficient
- **Jaccard Index**: Jaccard similarity index
- **MI (Mutual Information)**: Mutual information

**References**:
- Gabrielatos, C. (2018). Keyness Analysis: nature, metrics and techniques. In *Corpus Approaches to Discourse* (pp. 225-258). Routledge.

## Interface Layout

The Keyword Extraction module uses a tab design:

- **Top-level Tabs**: Switch between "Single Document" and "Keyness Comparison" modes
- **Left Panel** (400-420px): Configuration panel containing corpus selection, POS filtering, algorithm/statistic method configuration, etc.
- **Right Panel** (flexible width): Results display area with two tabs
  - **Results Table**: Displays keyword extraction results
  - **Visualization**: Provides three visualization methods: bar chart, pie chart, and word cloud

## Single Document Algorithms

Single-document algorithms extract keywords from the selected corpus without requiring a reference corpus.

### Corpus Selection

Same as the Word Frequency Analysis module, supports three text selection modes:
- **All Texts**: Analyze all texts in the corpus
- **Filter by Tags**: Filter texts by tags
- **Manual Selection**: Manually select specific texts

### POS Filtering

Based on SpaCy Universal POS tagset, supports keep/filter modes, same as the Word Frequency Analysis module.

### Exclude Words

Same design as the Word Frequency module:

- **Remove Stopwords**: When enabled, automatically removes common stopwords based on corpus language (using NLTK stopwords)
  - Shows the current corpus language label when enabled
  - Supports 20+ languages including Chinese, English, etc.
- **Exclude Words List**: Custom words to exclude
  - Enter one word per line
  - These words will be removed from analysis results

**Usage Recommendations**:
- Enable stopwords filter when analyzing content words
- Disable when analyzing function words or grammatical features
- Use the exclusion list to remove domain-specific high-frequency meaningless words

### Algorithm Selection

The system provides four single-document keyword extraction algorithms:

#### TF-IDF (Term Frequency-Inverse Document Frequency)

Measures word importance based on frequency within documents vs. across documents.

**Parameter Configuration**:
- **Max Keywords**: Maximum number of keywords to extract (default: 50, range: 5-500)
- **Min Document Frequency**: Minimum proportion of documents containing the word (default: 0.01, range: 0.01-0.5)
- **Max Document Frequency**: Maximum proportion of documents containing the word (default: 0.95, range: 0.5-1.0)
- **N-gram Range**: Word combination range for keywords (default: 1-2, i.e., single words and two-word combinations)

**Use Cases**:
- Extract representative keywords from document collections
- Identify document-specific important vocabulary
- Suitable for multi-document corpora

#### TextRank (Graph-based Ranking Algorithm)

Graph-based ranking algorithm inspired by PageRank, treating words as nodes and co-occurrence relations as edges.

**Parameter Configuration**:
- **Top N Keywords**: Return top N keywords (default: 50, range: 5-500)
- **Window Size**: Co-occurrence window size (default: 4, range: 2-10)
- **Damping Factor**: Damping factor for PageRank algorithm (default: 0.85, range: 0.5-0.99)
- **Max Iterations**: Maximum number of algorithm iterations (default: 100, range: 10-500)

**Use Cases**:
- Extract keywords from single documents
- Identify semantically related keywords
- Suitable for long documents

#### YAKE! (Yet Another Keyword Extractor)

Unsupervised method using multiple statistical features without external corpus.

**Parameter Configuration**:
- **Top N Keywords**: Number of keywords to extract (default: 50, range: 5-500)
- **Max N-gram Size**: Maximum number of words in keywords (default: 3, range: 1-5)
- **Dedup Threshold**: Similarity threshold for keyword deduplication (default: 0.9, range: 0.1-1.0)
- **Window Size**: Window size for feature extraction (default: 2, range: 1-5)

**Use Cases**:
- Fast keyword extraction
- No training data required
- Suitable for single or multiple documents

#### RAKE (Rapid Automatic Keyword Extraction)

Uses stop words and punctuation to identify candidate phrases.

**Parameter Configuration**:
- **Top N Keywords**: Number of keywords to extract (default: 50, range: 5-500)
- **Min Length**: Minimum number of words in keywords (default: 1, range: 1-5)
- **Max Length**: Maximum number of words in keywords (default: 3, range: 1-10)
- **Min Frequency**: Minimum occurrence count of words (default: 1, range: 1-10)

**Use Cases**:
- Extract phrase keywords
- Identify technical terms and proper nouns
- Suitable for specialized domain documents

### Case Handling

- **Convert to Lowercase**: When checked, all words are converted to lowercase for statistics
- Recommendation: Enable when analyzing English to merge case variants

### Running Analysis

After configuration, click the "Extract Keywords" button to start analysis.

## Keyness Comparison

Keyness comparison identifies words that are significantly overused or underused in the study corpus by comparing it against a reference corpus.

### Corpus Selection

Two corpora need to be selected:

#### Study Corpus (Target Corpus)

The target corpus to analyze. The system identifies words that are significantly overused or underused in this corpus relative to the reference corpus.

- Supports three text selection modes (all, by tags, manual selection)
- Displays number of selected texts

#### Reference Corpus (Comparison Baseline)

The corpus used as a comparison baseline for calculating expected word frequencies. Two reference corpus selection methods are available:

**Method 1: Select Corpus Texts**

- Supports three text selection modes (all, by tags, manual selection)
- Displays number of selected texts
- Suitable for comparison with your own imported corpora

**Method 2: Corpus Resource**

The system includes multiple pre-processed corpus frequency datasets that can be directly used for keyness comparison:

- **Enable**: Toggle the "Corpus Resource" switch on
- **Default Resource**: OANC (Open American National Corpus) total corpus
- **Resource Selection**: Click the resource card to open the selection dialog

**Corpus Resource Selection Dialog**:

- **Search Function**: Enter keywords to search corpus names
- **Corpus Type Filter**: Filter by corpus type (BNC, Brown, NOW, OANC)
- **Tag Filter**: Filter by tags, supports multiple selection (e.g., news, fiction, spoken)
- **Resource Card**: Displays corpus name, word count, file size, and other information
- **Single Selection**: Select one corpus, then the dialog closes and updates the display

**Available Corpus Resources**:

| Corpus | Description | Tags |
|--------|-------------|------|
| BNC | British National Corpus | spoken, written, various domains |
| Brown | Brown Corpus | news, fiction, academic, etc. |
| NOW | News on the Web | news (by country) |
| OANC | Open American National Corpus | various text genres |

**Usage Tips**:
- Study corpus should be your target corpus of interest
- Reference corpus should be a representative baseline corpus (e.g., general corpus)
- Both corpora should use the same language
- Using corpus resources allows quick comparison without importing reference corpora

### POS Filtering

Same as single-document algorithms, supports keep/filter modes.

### Exclude Words

Same as single-document algorithms, consistent with Word Frequency module design:

- **Remove Stopwords**: Automatically removes common stopwords by corpus language (NLTK)
- **Exclude Words List**: Custom words to exclude, one per line

Enabling stopwords filter is recommended during keyness comparison to focus on content word differences.

### Statistic Method Selection

The system provides nine statistical methods for keyness analysis:

#### Log-Likelihood (G²)

Most reliable significance test for corpus comparison, especially suitable for cases with unequal corpus sizes.

**Features**:
- Insensitive to corpus size differences
- Provides statistical significance testing
- Recommended for most scenarios

#### Chi-squared (χ²)

Classic statistical test with Yates correction, testing differences between observed and expected frequencies.

**Features**:
- Classic statistical test method
- Suitable for large samples
- Provides significance testing

#### Log Ratio

Pure effect size measure, showing how many times more frequent a word is in the study corpus.

**Features**:
- Intuitively shows effect size
- Positive values indicate overuse, negative values indicate underuse
- Can set effect size threshold

#### Dice Coefficient

Measures association strength between word and corpus, range [0,1].

**Features**:
- Clear value range
- Suitable for measuring association strength
- Does not consider statistical significance

#### Mutual Information

Information-theoretic measure, measuring how much information about corpus membership a word provides.

**Features**:
- Favors low-frequency words
- Suitable for discovering rare but important words
- Does not consider statistical significance

#### MI³ (Cubed MI)

Cubed form of MI, reducing bias towards low-frequency words.

**Features**:
- Balances high and low frequency words
- Reduces excessive preference for rare words
- Does not consider statistical significance

#### T-score

Favors high-frequency words, suitable for identifying typical collocates.

**Features**:
- Favors high-frequency words
- Suitable for identifying typical collocations
- Does not consider statistical significance

#### Simple Keyness

Simple normalized frequency ratio between corpora.

**Features**:
- Simple and intuitive calculation
- Does not consider statistical significance
- Suitable for quick screening

#### Fisher's Exact Test

Exact test for small samples, computes exact p-value.

**Features**:
- Suitable for small samples
- Computes exact p-value
- Longer computation time

### Frequency Threshold Configuration

- **Min Study Frequency**: Minimum occurrence count in study corpus (default: 3)
- **Min Reference Frequency**: Minimum occurrence count in reference corpus (default: 3)

### Effect Size Threshold (Log Ratio Only)

When selecting Log Ratio statistic, you can set an effect size threshold:
- **Effect Size Threshold**: Minimum effect size (default: 0, range: 0-5)
- Only displays keywords with effect size greater than this value

### Statistical Threshold

Enable statistical threshold to filter results based on academic statistical standards:

- **Enable**: Toggle the "Statistical Threshold" switch on
- **Min Score**: Set the minimum statistical score results must achieve
- **Max p-value**: Set the maximum significance p-value results must fall below

**Academic Standard References**:

| Statistic | Recommended Min Score | Description |
|-----------|----------------------|-------------|
| Log-Likelihood (G) | 6.63 | p < 0.01 |
| Log-Likelihood (G) | 3.84 | p < 0.05 |
| Chi-squared | 6.63 | p < 0.01 |
| Chi-squared | 3.84 | p < 0.05 |
| Log Ratio | 1.0 | Meaningful effect size |

**p-value Standards**:
- Standard significance level: p < 0.05
- Strict significance level: p < 0.01
- Highly significant: p < 0.001

**Usage Recommendations**:
- Academic research recommends using p < 0.01 or LL > 6.63
- Exploratory analysis can use more lenient thresholds
- For Log Ratio, focus on results with |LR| > 1

### Show Negative Keywords

- **Show Negative Keywords**: When checked, displays words significantly underused in the study corpus (negative keywords)
- Negative keywords indicate words with significantly lower frequency in the study corpus compared to the reference corpus

### Case Handling

Same as single-document algorithms, supports convert to lowercase option.

### Running Analysis

After configuration, click the "Analyze Keyness" button to start analysis.

## Results Table

### Statistics

The top of the table displays statistical summary:

**Single Document Algorithms**:
- **Total Keywords**: Total number of extracted keywords

**Keyness Comparison**:
- **Total Keywords**: Total number of identified keywords
- **Study Corpus Size**: Total word count in study corpus
- **Reference Corpus Size**: Total word count in reference corpus

### Table Columns

**Single Document Algorithm Results**:

| Column | Description |
|--------|-------------|
| Rank | Ranking sorted by score |
| Keyword | Extracted keyword |
| Score | Keyword score calculated by algorithm |
| Frequency | Occurrence count in corpus |
| Actions | Quick action menu (if enabled) |

**Keyness Comparison Results**:

| Column | Description |
|--------|-------------|
| Rank | Ranking sorted by score |
| Keyword | Keyword |
| Study Frequency | Occurrence count in study corpus |
| Reference Frequency | Occurrence count in reference corpus |
| Study Normalized | Normalized frequency in study corpus (per million) |
| Reference Normalized | Normalized frequency in reference corpus (per million) |
| Score | Score calculated by statistical method |
| Effect Size | Effect size (Log Ratio) |
| P-value | Statistical significance p-value (if applicable) |
| Significance | Significance level markers (***, **, *, empty) |
| Direction | Overuse (positive) or underuse (negative) |
| Actions | Quick action menu (if enabled) |

### Sorting

Click column headers to sort:
- **Single Document Algorithms**: Sort by rank, keyword, score, frequency
- **Keyness Comparison**: Sort by rank, keyword, study frequency, reference frequency, score, effect size, p-value, etc.

Supports ascending/descending toggle.

### Table Filtering

Enter keywords in the search box at the top of the table to filter keywords in real-time.

### Selection

- **Single Select**: Click checkbox in table rows to select/deselect keywords
- **Select All**: Click checkbox in header or "Select All" button in toolbar

### Quick Actions

The table toolbar provides the following actions:

- **Select All/Deselect All**: Quickly select or deselect all keywords
- **Copy Selected**: Copy selected keyword list to clipboard (one per line)
- **Export CSV**: Export results as CSV file

### Pagination

- Supports 10, 25, 50, 100 rows per page
- Switch pages and rows per page at the bottom of the table

### Cross-module Links

If cross-module linking is enabled, the table displays an "Actions" column providing:

- **Collocation Analysis**: Jump to Collocation Analysis module to analyze co-occurrence relationships
- **Word Sketch**: Jump to Word Sketch module to view grammatical patterns

## Visualization

The Visualization panel provides three chart types to help you intuitively understand keyword distribution.

### Chart Type Switching

Switch chart types via top tabs:

- **Bar Chart**: Suitable for displaying top N keywords
- **Pie Chart**: Suitable for displaying keyword proportion distribution
- **Word Cloud**: Suitable for displaying overall keyword distribution

### Bar Chart

#### Configuration Options

- **Max Display Count**: Set how many keywords to display (default: 20, range: 5-50)
- **Color Scheme**: Select color theme for bars (blue, green, purple, orange, red)
- **Show Percentage**: Whether to display percentage labels on bars

#### Interactive Features

- Click bars to jump to results table and select the keyword
- Chart height automatically adjusts based on display count

**Keyness Comparison Special Display**:
- Positive keywords (overused) and negative keywords (underused) are distinguished by different colors
- Can separately view distribution of positive and negative keywords

### Pie Chart

#### Configuration Options

- **Max Display Count**: Set how many keywords to display (default: 10, range: 5-20)
- **Color Scheme**: Select color theme for pie chart
- **Show Percentage**: Whether to display percentage labels on pie slices

#### Chart Features

- Uses donut chart design
- Displays legend for easy identification
- Click slices to jump to results table

### Word Cloud

#### Configuration Options

- **Max Words**: Set number of words to display in word cloud (default: 100, range: 5-500)
- **Color Mapping**: Select color scheme for word cloud
  - Supports multiple presets: viridis, inferno, plasma, autumn, winter, rainbow, ocean, forest, sunset

#### Chart Features

- Word size automatically adjusts based on score or frequency
- Color maps to different color scales based on score
- Click words to jump to results table

**Keyness Comparison Special Display**:
- Positive and negative keywords can be distinguished using different color schemes

### Export Features

All charts support export:

- **Export SVG**: Export as vector format, suitable for printing and editing
- **Export PNG**: Export as bitmap format, suitable for inserting into documents

Export buttons are located on the right side of the chart settings bar.

## Usage Tips

### Single Document Algorithm Selection Recommendations

#### Choose TF-IDF When:
- You have multiple documents and want to find representative keywords for each document
- Need to identify document-specific important vocabulary
- Corpus contains documents on multiple topics

#### Choose TextRank When:
- You have a single long document and want to extract keywords
- Need to identify semantically related keywords
- Focus on co-occurrence relationships between words

#### Choose YAKE! When:
- Need fast keyword extraction
- No external training data available
- Suitable for single or multiple documents

#### Choose RAKE When:
- Need to extract phrase keywords
- Identify technical terms and proper nouns
- Processing specialized domain documents

### Keyness Comparison Usage Tips

#### Statistic Method Selection

- **General Recommendation**: Log-Likelihood, suitable for most scenarios
- **Need Effect Size**: Log Ratio, intuitively shows effect size
- **Focus on Significance**: Chi-squared or Fisher's Exact Test
- **Focus on Association Strength**: Dice Coefficient
- **Discover Rare Words**: Mutual Information
- **Balance High/Low Frequency**: MI³

#### Corpus Selection Tips

- **Study Corpus**: Select your target corpus of interest (e.g., specific topic, specific author, specific period)
- **Reference Corpus**: Select a representative baseline corpus (e.g., general corpus, balanced corpus)
- **Corpus Size**: Size differences between corpora do not affect Log-Likelihood results
- **Language Consistency**: Ensure both corpora use the same language

#### Frequency Threshold Settings

- **Minimum Frequency**: Setting appropriate frequency thresholds can filter out accidentally occurring words
- **Min Study Frequency**: Recommended 3-5
- **Min Reference Frequency**: Can be set to 0 (if reference corpus is large) or 1-3

#### Negative Keyword Analysis

- Enabling "Show Negative Keywords" can discover words significantly underused in the study corpus
- Negative keyword analysis helps understand corpus characteristics and differences
- Example: Academic corpora may underuse colloquial vocabulary

### Common Analysis Scenarios

#### Extracting Academic Paper Keywords
1. Select "Single Document" tab
2. Choose algorithm: TF-IDF or TextRank
3. Select academic paper corpus
4. Set POS filter: Keep NOUN, ADJ, VERB
5. Run analysis

#### Comparing Corpora from Different Periods
1. Select "Keyness Comparison" tab
2. Study corpus: Select recent corpus
3. Reference corpus: Select earlier corpus
4. Statistic: Log-Likelihood
5. Run analysis to view newly emerging vocabulary

#### Identifying Domain-Specific Terms
1. Select "Single Document" tab
2. Choose algorithm: RAKE
3. Set N-gram range: 2-3 (extract phrases)
4. Select domain-specific corpus
5. Run analysis

#### Analyzing Register Features
1. Select "Keyness Comparison" tab
2. Study corpus: Select specific register corpus (e.g., news, fiction)
3. Reference corpus: Select general corpus
4. Statistic: Log Ratio
5. Enable "Show Negative Keywords"
6. Run analysis to view register-specific vocabulary

### Notes

- Keyword extraction is based on SpaCy annotation data; ensure texts have completed SpaCy annotation
- Analysis of large corpora may take time; please be patient
- Different algorithms may produce different results; recommend choosing appropriate algorithm based on specific needs
- Keyness comparison requires two corpora; ensure both corpora are ready
- Statistical method significance level markers: *** (p<0.001), ** (p<0.01), * (p<0.05)
- Negative keywords indicate words significantly underused in study corpus, helpful for understanding corpus characteristics
- When exporting CSV, large datasets may take some time

# N-gram Analysis

## Overview

The N-gram Analysis module is based on SpaCy annotation data and statistics the frequency of consecutive N-word combinations in the corpus. N-gram analysis helps you discover common word collocations, phrase patterns, language habits, etc., and is an important research tool in corpus linguistics.

## Theoretical Foundation

### What is an N-gram?

An **N-gram** is a sequence of N consecutive words (or characters) in text. In corpus linguistics, N-gram analysis is a fundamental tool for studying word collocations and language patterns.

| N Value | Name | Examples |
|---------|------|----------|
| 2 | Bigram | "natural language", "of the" |
| 3 | Trigram | "natural language processing", "in order to" |
| 4 | 4-gram | "in the United States" |
| 5 | 5-gram | "at the end of the" |
| 6 | 6-gram | "at the beginning of the year" |

### Linguistic Applications

N-gram analysis has various applications in corpus linguistics:

1. **Collocation Analysis**: Identifying habitual word combinations
2. **Phrase Pattern Discovery**: Discovering fixed phrases and expressions
3. **Language Style Analysis**: Comparing language habits across registers or authors
4. **Grammatical Pattern Research**: Studying POS sequences and syntactic patterns
5. **Language Acquisition Research**: Analyzing error patterns in learner language

### Frequency and Distribution

N-gram frequency distributions typically follow **Zipf's Law**: a few N-grams have very high frequencies, while most N-grams appear only once or a few times.

$$f(r) \approx \frac{C}{r^a}$$

where $f(r)$ is the frequency of the N-gram ranked $r$, and $C$ and $a$ are constants.

### Nest N-gram (Nested Grouping)

Meta-Lingo supports the **Nest N-gram** feature, displaying N-grams with containment relationships in hierarchical groups:

- For example: if both "natural language" (2-gram) and "natural language processing" (3-gram) exist
- Nest mode groups them together, facilitating discovery of phrase extension patterns

### References

- Jurafsky, D., & Martin, J. H. (2023). *Speech and Language Processing* (3rd ed.). [https://web.stanford.edu/~jurafsky/slp3/](https://web.stanford.edu/~jurafsky/slp3/)
- Manning, C. D., & Schutze, H. (1999). *Foundations of Statistical Natural Language Processing*. MIT Press.
- Sinclair, J. (1991). *Corpus, Concordance, Collocation*. Oxford University Press.
- Biber, D., Conrad, S., & Reppen, R. (1998). *Corpus Linguistics: Investigating Language Structure and Use*. Cambridge University Press.

## Interface Layout

The N-gram Analysis module uses a left-right split layout:

- **Left Panel** (400px): Configuration panel containing corpus selection, N-value selection, POS filtering, search configuration, etc.
- **Right Panel** (flexible width): Results display area with two tabs
  - **Results Table**: Displays N-gram statistics
  - **Visualization**: Provides four visualization methods: bar chart, network graph, Sankey chart, and word cloud

## Corpus Selection

### Selecting a Corpus

1. Select the target corpus from the dropdown menu at the top of the left panel
2. The system displays the number of texts in the corpus
3. After selecting a corpus, the system automatically loads all texts in that corpus

### Text Selection Modes

The system provides three text selection modes, same as the Word Frequency Analysis module:

#### All Texts
- Select "All Texts" mode
- Analysis will include all texts in the corpus
- Displays total number of texts

#### Filter by Tags
- Select "Filter by Tags" mode
- Select one or more tags from the dropdown menu
- The system filters all texts containing these tags
- Displays the number of filtered texts

#### Manual Selection
- Select "Manual Selection" mode
- Use the search box to search texts by filename
- Check the texts you want to analyze in the text list
- Supports "Select All" and "Clear All" quick actions
- Displays the number of selected texts

### Selection Status Indicator

After selection, the system displays:
- Number of selected texts
- Success/warning indicator (based on selection count)

## N-value Selection

N in N-gram represents the number of consecutive words. The system supports analysis of 2-6 grams.

### Available N Values

- **Bigram (2-gram)**: Two-word combinations, e.g., "the cat", "in the"
- **Trigram (3-gram)**: Three-word combinations, e.g., "the cat sat", "in the house"
- **4-gram**: Four-word combinations
- **5-gram**: Five-word combinations
- **6-gram**: Six-word combinations

### Multiple N-value Selection

- You can select multiple N values simultaneously for analysis
- The system will separately count N-grams for each N value
- Results are merged and displayed, with each N-gram labeled with its N value

**Usage Tips**:
- **Bigram (2-gram)**: Most commonly used, suitable for analyzing common word collocations
- **Trigram (3-gram)**: Suitable for analyzing phrase patterns
- **4-6 gram**: Suitable for analyzing long phrases and fixed expressions

### Nest N-gram Grouping

When "Nest N-gram Grouping" is enabled, the system groups shorter N-grams under longer N-grams that contain them.

**Feature Description**:
- Example: If "the cat" is a bigram and "the cat sat" is a trigram, after enabling grouping, "the cat" will be displayed in the expanded row of "the cat sat"
- Only available when multiple N values are selected
- Helps understand hierarchical relationships of N-grams

**Use Cases**:
- Analyze components of fixed phrases
- Understand hierarchical structure of word collocations
- Discover expansion patterns of phrases

## POS Filtering

POS filtering is based on the SpaCy Universal POS tagset, allowing you to analyze only words of specific parts of speech.

### Filter Modes

#### Keep Mode
- Select "Keep Mode"
- Only count N-grams containing your selected POS tags
- Example: Selecting NOUN and VERB will only count N-grams containing nouns and verbs

#### Filter Mode
- Select "Filter Mode"
- Exclude N-grams containing your selected POS tags
- Example: Selecting PUNCT will exclude N-grams containing punctuation

**Note**: POS filtering for N-grams requires all words in the N-gram to meet the filter criteria.

### POS Tag Categories

The system categorizes POS tags into three groups for easy selection:

#### Content Words
- **NOUN**: Noun
- **VERB**: Verb
- **ADJ**: Adjective
- **ADV**: Adverb
- **PROPN**: Proper noun

#### Function Words
- **ADP**: Adposition
- **AUX**: Auxiliary verb
- **CCONJ**: Coordinating conjunction
- **DET**: Determiner
- **PART**: Particle
- **PRON**: Pronoun
- **SCONJ**: Subordinating conjunction

#### Other
- **INTJ**: Interjection
- **NUM**: Numeral
- **PUNCT**: Punctuation
- **SYM**: Symbol
- **X**: Other

### Quick Actions

- **Select All**: Quickly select all POS tags
- **Clear All**: Clear all selections

## Search Configuration

The Search Configuration panel provides various filtering and search options to help you precisely locate target N-grams.

### Frequency Range

Set the frequency range for N-grams:

- **Minimum Frequency**: Only display N-grams with frequency greater than or equal to this value (default: 2)
- **Maximum Frequency**: Only display N-grams with frequency less than or equal to this value (optional, set to 0 for no limit)

### Minimum Word Length

- **Minimum Word Length**: Set the minimum character length for each word in N-grams (default: 1)
- Example: Setting to 2 will exclude single-character words (e.g., "a", "I")

### Case Handling

- **Convert to Lowercase**: When checked, all words are converted to lowercase for statistics
- Recommendation: Enable when analyzing English to merge case variants

### Search Types

#### All
- No search filtering, count all N-grams meeting the criteria

#### Starts With
- Only count N-grams starting with the specified string
- Example: Enter "the" to count "the cat", "the house", etc.

#### Ends With
- Only count N-grams ending with the specified string
- Example: Enter "cat" to count "the cat", "a cat", etc.

#### Contains
- Only count N-grams containing the specified string
- Example: Enter "cat" to count "the cat", "cat sat", "the cat sat", etc.

#### Contains Word
- Only count N-grams containing the specified word (full word match)
- Example: Enter "cat" to count "the cat", "cat sat", etc., but will not match "cat" in "category"

#### Regular Expression (Regex)
- Use regular expressions for advanced matching
- Supports full regular expression syntax
- Example: `^the\s+\w+` matches N-grams starting with "the" followed by a word

#### Wordlist
- Enter a word list (one per line)
- Only count N-grams containing words in the list
- Suitable for analyzing collocations of specific vocabulary sets

### Exclude Words

Enter words to exclude in the "Exclude Words" text box (one per line). N-grams containing these words will not appear in the statistics.

**Use Cases**:
- Exclude stop words
- Exclude specific interference words
- Exclude proper nouns like names and places

## Running Analysis

After configuration, click the "Start Analysis" button:

1. The system displays loading progress
2. After analysis completes, results automatically appear in the right panel
3. If errors occur, error messages are displayed in the left panel

**Note**:
- Analysis of large corpora or multiple N values may take time
- Nest N-gram grouping increases processing time
- Recommend testing with smaller N values or fewer texts first

## Results Table

### Statistics

The top of the table displays statistical summary:

- **Total N-grams**: Total count of all N-grams meeting the criteria
- **Unique N-grams**: Number of non-duplicate N-grams
- **Selected**: Number of currently selected N-grams (if any)

### Table Columns

| Column | Description |
|--------|-------------|
| Rank | Ranking sorted by frequency |
| N-gram | The N-gram itself |
| N-value Label | Displays the N value of the N-gram (e.g., "2-gram", "3-gram") |
| Frequency | Occurrence count |
| Percentage | Percentage of total N-grams |
| Actions | Quick action menu (if enabled) |

### Nest N-gram Expansion

If Nest N-gram grouping is enabled:

- Expand button (▼/▲) appears on the left side of the table
- Click expand button to view shorter N-grams contained in this N-gram
- Expanded rows show sub N-grams and their frequencies
- Helps understand hierarchical relationships of N-grams

### Sorting

Click column headers to sort:

- **Rank**: Sort by frequency ranking
- **N-gram**: Sort alphabetically
- **Frequency**: Sort by occurrence count
- **Percentage**: Sort by percentage
- **N-value**: Sort by N value

Supports ascending/descending toggle.

### Table Filtering

Enter keywords in the search box at the top of the table to filter N-grams in real-time.

### Selection

- **Single Select**: Click checkbox in table rows to select/deselect N-grams
- **Select All**: Click checkbox in header or "Select All" button in toolbar

### Quick Actions

The table toolbar provides the following actions:

- **Select All/Deselect All**: Quickly select or deselect all N-grams
- **Copy Selected**: Copy selected N-gram list to clipboard (format: N-gram\tFrequency\tPercentage)
- **Export CSV**: Export results as CSV file
  - Includes N-gram, N value, frequency, percentage, etc.

### Pagination

- Supports 10, 25, 50, 100 rows per page
- Switch pages and rows per page at the bottom of the table

### Cross-module Links

If cross-module linking is enabled, the table displays an "Actions" column providing:

- **Collocation Analysis**: Jump to Collocation Analysis module to analyze co-occurrence relationships

## Visualization

The Visualization panel provides four chart types to help you intuitively understand N-gram distribution and relationships.

### Chart Type Switching

Switch chart types via top tabs:

- **Bar Chart**: Suitable for displaying top N high-frequency N-grams
- **Network Graph**: Suitable for displaying relationships between N-grams
- **Sankey Chart**: Suitable for displaying N-gram flow and transitions
- **Word Cloud**: Suitable for displaying overall N-gram distribution

### Bar Chart

#### Configuration Options

- **Max Display Count**: Set how many N-grams to display (default: 20, range: 5-50)
- **Color Scheme**: Select color theme for bars (blue, green, purple, orange, red, teal)
- **Show Percentage**: Whether to display percentage labels on bars

#### Interactive Features

- Click bars to jump to results table and select the N-gram
- Chart height automatically adjusts based on display count

### Network Graph

The network graph uses a force-directed layout to show relationships between N-grams.

#### Configuration Options

- **Max Nodes**: Set the number of N-grams to display (default: 50, range: 5-300)
- **Color Scheme**: Select color theme for the network graph

#### Interactive Features

- **Drag Nodes**: Drag nodes to adjust positions
- **Zoom**: Use mouse wheel to zoom the view
- **Click Nodes**: Click nodes to jump to results table and select the N-gram

#### Node Relationships

- Lines between nodes represent relationships between N-grams
- Node size automatically adjusts based on frequency
- Different N values may be distinguished by different colors

### Sankey Chart

The Sankey chart displays N-gram flow and transition patterns, especially suitable for displaying results of multi-N-value analysis.

#### Configuration Options

- **Max Nodes**: Set the number of N-grams to display (default: 50, range: 5-100)
- **Color Scheme**: Select color theme for the Sankey chart

#### Interactive Features

- **Zoom**: Use mouse wheel to zoom the view
- **Drag**: Drag the chart to adjust position
- **Click Nodes**: Click nodes to jump to results table

#### Chart Features

- Left nodes represent the starting part of N-grams
- Right nodes represent the ending part of N-grams
- Flow line thickness represents frequency size
- Suitable for analyzing transition patterns of N-grams

### Word Cloud

#### Configuration Options

- **Max Words**: Set number of N-grams to display in word cloud (default: 100, range: 5-500)
- **Color Mapping**: Select color scheme for word cloud
  - Supports multiple presets: viridis, inferno, plasma, autumn, winter, rainbow, ocean, forest, sunset

#### Chart Features

- N-gram size automatically adjusts based on frequency
- Color maps to different color scales based on frequency
- Click N-grams to jump to results table

### Export Features

All charts support export:

- **Export SVG**: Export as vector format, suitable for printing and editing
- **Export PNG**: Export as bitmap format, suitable for inserting into documents

Export buttons are located on the right side of the chart settings bar.

## Usage Tips

### Efficient Analysis Workflow

1. **Select Corpus**: Choose appropriate corpus based on research goals
2. **Filter Texts**: Use tags or manual selection to focus on target texts
3. **Select N Values**: Choose appropriate N values based on research questions (recommend starting with 2-gram)
4. **Set POS**: Select relevant parts of speech based on research questions
5. **Configure Search**: Use search and exclude functions to precisely locate target N-grams
6. **View Results**: View detailed data in the table
7. **Visualize Analysis**: Use charts to discover patterns and trends
8. **Export Data**: Export results for further analysis

### Common Analysis Scenarios

#### Analyzing Common Word Collocations
1. Select Bigram (2-gram)
2. Set POS filter: Keep content words (NOUN, VERB, ADJ, ADV)
3. Set minimum frequency (e.g., 10)
4. Enable "Convert to Lowercase"
5. Run analysis

#### Analyzing Fixed Phrases
1. Select Trigram or 4-gram
2. Set minimum frequency (e.g., 5)
3. Enable Nest N-gram grouping
4. Run analysis
5. Expand long N-grams to view their components

#### Analyzing Collocations of Specific Vocabulary
1. Select "Contains Word" search type
2. Enter target word (e.g., "cat")
3. Select multiple N values (2-4)
4. Run analysis
5. View collocation network of the word in the network graph

#### Analyzing Register-Specific Phrases
1. Select multiple N values (2-4)
2. Set POS filter: Keep content words
3. Set appropriate frequency range
4. Run analysis
5. View phrase transition patterns in the Sankey chart

### N-value Selection Recommendations

- **Bigram (2-gram)**:
  - Most commonly used, suitable for analyzing common word collocations
  - Moderate number of results, easy to analyze
  - Suitable as a starting point

- **Trigram (3-gram)**:
  - Suitable for analyzing phrase patterns
  - Can discover fixed expressions
  - Larger number of results

- **4-6 gram**:
  - Suitable for analyzing long phrases and fixed expressions
  - Number of results may be very large
  - Recommend setting higher minimum frequency threshold

### Nest N-gram Usage Tips

- **When to Enable**:
  - Multiple N values are selected
  - Want to understand hierarchical relationships of N-grams
  - Analyze components of fixed phrases

- **Notes**:
  - Enabling increases processing time
  - Table displays more information
  - Suitable for in-depth analysis of specific N-grams

### Notes

- N-gram analysis is based on SpaCy annotation data; ensure texts have completed SpaCy annotation
- Analysis of large corpora or multiple N values may take time; please be patient
- Larger N values result in exponential growth in possible N-gram combinations
- Recommend setting appropriate minimum frequency threshold to filter out accidentally occurring combinations
- POS filtering requires all words in the N-gram to meet filter criteria
- Nest N-gram grouping feature requires selecting multiple N values
- Network and Sankey charts may be slow when node count is high
- When exporting CSV, large datasets may take some time

# Collocation

## Overview

The Collocation Analysis module provides KWIC (Key Word In Context) search functionality to help you find and analyze occurrences of specific words or patterns in the corpus. The module supports multiple search modes, CQL (Corpus Query Language) queries, POS filtering, result sorting, and visualization features.

## CQL Syntax Guide

Meta-Lingo implements a custom CQL (Corpus Query Language) engine, following Sketch Engine standards. CQL is the standard language for advanced queries in corpus linguistics.

### Basic Syntax

#### Token Matching

Each token (word) is represented by square brackets `[]`, with matching conditions inside:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `word` | Word form (original) | `[word="running"]` |
| `lemma` | Lemma (dictionary form) | `[lemma="run"]` |
| `pos` | POS (Universal POS) | `[pos="NOUN"]` |
| `tag` | Fine-grained POS (Penn Treebank) | `[tag="NNS"]` |
| `dep` | Dependency relation | `[dep="nsubj"]` |

#### Any Token

- `[]`: Match any single token
- `[]{n}`: Match n any tokens
- `[]{m,n}`: Match m to n any tokens

### Logical Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `&` | AND | `[pos="NOUN" & lemma="test"]` |
| `\|` | OR | `[pos="NOUN" \| pos="VERB"]` |
| `!` | NOT | `[!pos="PUNCT"]` |

### Regular Expressions

CQL supports regular expressions in attribute values:

| Pattern | Description | Example |
|---------|-------------|---------|
| `.*` | Match any character sequence | `[word=".*ing"]` matches words ending in -ing |
| `^` | Match start | `[word="^pre.*"]` matches words starting with pre- |
| `$` | Match end | `[lemma=".*tion$"]` matches lemmas ending in -tion |
| `[A-Z]` | Character range | `[word="^[A-Z].*"]` matches capitalized words |
| `?` | Optional character | `[word="colou?r"]` matches color or colour |

### Sequence Query Examples

#### Basic Sequence

```cql
[lemma="make"] [pos="DET"] [pos="NOUN"]
```

Matches: make + determiner + noun (e.g., "make a decision")

#### Sequence with Gap

```cql
[lemma="look"] []{0,2} [word="at"]
```

Matches: look + 0-2 any words + at (e.g., "look at", "look carefully at")

#### Complex Combination

```cql
[pos="VERB" & !lemma="be"] [] [pos="ADJ"] [pos="NOUN"]
```

Matches: non-be verb + any word + adjective + noun

### POS Tag Reference (Universal POS)

| Tag | Description | Examples |
|-----|-------------|----------|
| ADJ | Adjective | big, old, green |
| ADP | Adposition | in, to, during |
| ADV | Adverb | very, well, exactly |
| AUX | Auxiliary verb | is, has, will |
| CCONJ | Coordinating conjunction | and, or, but |
| DET | Determiner | a, the, this |
| INTJ | Interjection | oh, wow, yes |
| NOUN | Noun | girl, cat, tree |
| NUM | Numeral | 1, 2019, one |
| PART | Particle | 's, not, to |
| PRON | Pronoun | I, you, he |
| PROPN | Proper noun | Mary, London, NASA |
| PUNCT | Punctuation | ., !, ? |
| SCONJ | Subordinating conjunction | if, while, that |
| SYM | Symbol | $, %, + |
| VERB | Verb | run, eat, write |
| X | Other | - |

### Common Query Templates

#### Collocation Patterns

```cql
// Adjective + Noun
[pos="ADJ"] [pos="NOUN"]

// Verb + Noun Object
[pos="VERB"] [pos="DET"]? [pos="NOUN"]

// Prepositional Phrase
[pos="ADP"] [pos="DET"]? [pos="ADJ"]* [pos="NOUN"]
```

#### Grammatical Structures

```cql
// Passive Voice
[lemma="be"] [pos="VERB" & word=".*ed"]

// Progressive
[lemma="be"] [word=".*ing"]

// Infinitive
[word="to"] [pos="VERB"]
```

#### Lexical Patterns

```cql
// Adverbs ending in -ly
[pos="ADV" & word=".*ly"]

// Nouns ending in -tion
[pos="NOUN" & word=".*tion"]

// Compound Word Pattern
[pos="NOUN"] [pos="NOUN"]
```

### CQL Builder

If you're unfamiliar with CQL syntax, you can use the **CQL Builder**:

1. Click the "CQL Builder" button in the search panel
2. Use the visual interface to add token conditions
3. Select attributes (word/lemma/pos, etc.) and values
4. Add logical operators
5. Preview the generated CQL query in real-time
6. Save commonly used templates for future use

### References

- Sketch Engine CQL Documentation: [https://www.sketchengine.eu/documentation/corpus-querying/](https://www.sketchengine.eu/documentation/corpus-querying/)
- CQP Query Language Tutorial: [https://cwb.sourceforge.io/files/CQP_Tutorial/](https://cwb.sourceforge.io/files/CQP_Tutorial/)

## Interface Layout

The Collocation Analysis module uses a left-right split layout:

- **Left Panel** (400px): Configuration panel containing corpus selection, POS filtering, search configuration, etc.
- **Right Panel** (flexible width): Results display area with two tabs
  - **Results Table**: Displays KWIC search results
  - **Visualization**: Provides two visualization methods: density plot and ridge plot

## Corpus Selection

### Selecting a Corpus

1. Select the target corpus from the dropdown menu at the top of the left panel
2. The system displays the number of texts in the corpus
3. After selecting a corpus, the system automatically loads all texts in that corpus

### Text Selection Modes

The system provides three text selection modes, same as other analysis modules:

#### All Texts
- Select "All Texts" mode
- Search will include all texts in the corpus
- Displays total number of texts

#### Filter by Tags
- Select "Filter by Tags" mode
- Select one or more tags from the dropdown menu
- The system filters all texts containing these tags
- Displays the number of filtered texts

#### Manual Selection
- Select "Manual Selection" mode
- Use the search box to search texts by filename
- Check the texts you want to search in the text list
- Supports "Select All" and "Clear All" quick actions
- Displays the number of selected texts

### Selection Status Indicator

After selection, the system displays:
- Number of selected texts
- Success/warning indicator (based on selection count)

## POS Filtering

POS filtering allows you to restrict search results to only include words with specific parts of speech.

### Filter Types

The system supports three POS tag sets:

#### Universal POS
- Based on SpaCy Universal POS tagset
- Includes: NOUN, VERB, ADJ, ADV, PRON, DET, ADP, AUX, CCONJ, SCONJ, PART, INTJ, NUM, PUNCT, SYM, X
- Suitable for most analysis scenarios

#### Penn Treebank
- Based on Penn Treebank tagset
- More fine-grained POS classification
- Suitable for scenarios requiring precise POS matching

#### Dependency Relations
- Based on SpaCy dependency relation tags
- Includes: nsubj, dobj, amod, det, prep, etc.
- Suitable for grammatical analysis scenarios

### Filter Modes

- **Keep Mode**: Only display results containing selected POS tags
- **Filter Mode**: Exclude results containing selected POS tags

## Search Configuration

### Search Modes

The system provides six search modes to meet different search needs:

#### Simple

The simplest search mode with wildcard and basic syntax support.

**Supported Wildcards**:
- `*`: Match any characters (including zero characters)
- `?`: Match a single character
- `|`: OR operator, match one of multiple options
- `--`: Hyphen variant, match words with or without hyphens

**Examples**:
- `m*`: Match all words starting with "m" (e.g., "make", "many", "more")
- `???t`: Match four-character words ending with "t" (e.g., "test", "that", "what")
- `return|go back`: Match "return" or "go back"
- `multi--billion`: Match "multibillion" or "multi-billion"

#### Lemma

Search based on lemma (root form), matching all variants of a word.

**Features**:
- Supports regular expressions
- Automatically matches all morphological variants of a word

**Examples**:
- `go`: Matches "go", "goes", "went", "going", "gone"
- `b.*`: Matches all words with lemmas starting with "b"

#### Phrase

Exact phrase matching with regular expression support.

**Features**:
- Matches complete phrase sequences
- Supports multi-line input (for long phrases)
- Supports regular expressions

**Examples**:
- `the cat sat`: Exact match for phrase "the cat sat"
- `.*ing.*`: Match phrases containing "ing"

#### Word

Exact word form matching, case-sensitive.

**Features**:
- Case-sensitive
- Exact matching, no word form variation
- Supports regular expressions

**Examples**:
- `Test`: Only matches "Test" (not "test")
- `test`: Only matches "test" (not "Test")

#### Character

Search for words containing specific characters or strings.

**Features**:
- Matches parts of words containing specified characters
- Case-insensitive

**Examples**:
- `ck`: Match words containing "ck" (e.g., "check", "back", "lock")
- `ing`: Match words containing "ing" (e.g., "going", "singing", "thing")

#### CQL (Corpus Query Language)

Use CQL (Corpus Query Language) for advanced queries with complex syntax and semantic matching.

**CQL Syntax**:
- `[word="text"]`: Match word form
- `[lemma="go"]`: Match lemma
- `[pos="NOUN"]`: Match POS (Universal POS)
- `[tag="NN"]`: Match fine-grained POS (Penn Treebank)
- `[dep="nsubj"]`: Match dependency relation

**Operators**:
- `&`: AND
- `|`: OR
- `!`: NOT
- `[]`: Any token
- `[]{2}`: 2 any tokens
- `[]{1,3}`: 1-3 any tokens

**Examples**:
- `[word="test"]`: Match word form "test"
- `[pos="NOUN" & lemma="test"]`: Match nouns with lemma "test"
- `[lemma="make"] [] [pos="NOUN"]`: Match "make" + any + noun
- `[word=".*ing"]`: Match word forms ending in "ing"

**CQL Builder**:
- Click the "CQL Builder" button in the search panel (or builder icon in title bar)
- Use visual interface to build CQL queries
- Supports template management and real-time preview

### Search Value

Enter the corresponding search value in the search box based on the selected search mode:

- **Simple**: Enter search word and wildcards
- **Lemma**: Enter lemma (supports regular expressions)
- **Phrase**: Enter phrase (supports multi-line)
- **Word**: Enter word form (supports regular expressions)
- **Character**: Enter character or string
- **CQL**: Enter CQL query expression (supports multi-line, with syntax validation)

### Context Size

Set the context length for KWIC result display (how many words to show on left and right):

- **Range**: 1-15 words
- **Default**: 5 words
- **Recommendation**: Adjust based on research needs; longer context helps understand context

### Case Handling

- **Convert to Lowercase**: When checked, search is case-insensitive (not supported in CQL mode)
- Recommendation: Enable when analyzing English to match all case variants

## Running Search

After configuration, click the "Start Search" button:

1. The system displays loading progress
2. After search completes, results automatically appear in the right panel
3. If errors occur, error messages are displayed in the left panel

**Note**:
- Large corpora or complex queries may take time
- CQL queries perform real-time syntax validation
- Search results may be very large; recommend using filter and sort functions

## Results Table

### Statistics

The top of the table displays search statistics:

- **Total**: Total number of search results
- **Showing**: Range of results displayed on current page
- **Filtered**: Number of results after filtering (if filter is applied)

### Table Columns

| Column | Description |
|--------|-------------|
| # | Result index |
| Source | Text filename |
| Left Context | Context to the left of keyword (right-aligned) |
| Keyword | Matched keyword (highlighted) |
| Right Context | Context to the right of keyword (left-aligned) |
| POS | POS tag of keyword |
| Expand | Expand/collapse button (view extended context) |

### Context Color Marking

To facilitate identification of context positions, the system uses color marking:

- **Left Context**: The 3 words closest to the keyword use different colors (red, green, purple)
- **Right Context**: The 3 words closest to the keyword use different colors (red, green, purple)
- Other words use default color

### Highlight Metaphor

The system supports highlighting metaphor words in KWIC results:

**Enable Method**:
- Find the "Highlight Metaphor" switch in the toolbar
- Click the switch to enable or disable highlighting

**Display Effect**:
- When enabled, if the search term is annotated as a metaphor, it will be highlighted with an **amber background**
- Helps quickly identify contexts of metaphorical usage

**Technical Notes**:
- This feature depends on metaphor annotation data
- Ensure the corpus has completed metaphor annotation (English only)
- Highlighting only applies to the search term itself

### Extended Context

Click the expand button on a table row to view longer context:

- **Default Range**: ±200 characters
- **Expand Function**: Click "Show more before" or "Show more after" buttons to expand context
- **Highlight**: Keywords are highlighted in extended context
- **Source Info**: Displays text source, position, and context range

### Sorting

Click the "Sort" button in the toolbar to open the sort dialog:

#### Sort Methods

- **Left Context**: Sort by left context
- **Right Context**: Sort by right context
- **Frequency**: Sort by keyword frequency (requires backend support)

#### Sort Levels

You can set multiple sort levels (up to 3 levels):

1. **Position Selection**:
   - `3L`, `2L`, `1L`: Positions in left context (3L farthest, 1L nearest)
   - `KWIC`: Keyword itself
   - `1R`, `2R`, `3R`: Positions in right context (1R nearest, 3R farthest)

2. **Attribute Selection**:
   - `word`: Word form
   - `lemma`: Lemma
   - `pos`: POS

3. **Options**:
   - `ignoreCase`: Ignore case
   - `retrograde`: Reverse sort

#### Sort Direction

- **Ascending**: Sort from small to large
- **Descending**: Sort from large to small

**Usage Tips**:
- Sorting by left context helps discover common collocations
- Sorting by right context helps discover subsequent patterns
- Multi-level sorting can organize results more precisely

### Filtering

Click the "Filter" button in the toolbar to open the filter dialog:

#### Quick Filters

- **Hide Sub-hits**: Hide results contained within other matches
- **Only First Hit per Document**: Show only the first match in each document

#### Query Filter

Use query conditions to further filter results:

1. **Query Type**: Select query type (Simple, Word, Lemma, Phrase, Character, CQL)
2. **Query Value**: Enter query condition
3. **Range Type**:
   - **Token Range**: Specify range of how many words on left and right
   - **Sentence Range**: Search within entire sentence
   - **Custom Range**: Custom search range
4. **Contain/Exclude**:
   - **Containing**: Only show results containing query condition
   - **Excluding**: Exclude results containing query condition
5. **Exclude Keyword**: Whether to include keyword itself in search range

### Export

Click the "Export CSV" button in the toolbar to export results as CSV file:

- Includes information from all columns
- Supports Chinese encoding (UTF-8 with BOM)
- Filename includes date information

### Pagination

- Supports 10, 20, 50, 100 rows per page
- Switch pages and rows per page at the bottom of the table

## Visualization

The Visualization panel provides two chart types to help you intuitively understand distribution patterns of search results.

### Chart Type Switching

Switch chart types via top tabs:

- **Density Plot**: Shows position distribution of keywords in text
- **Ridge Plot**: Shows keyword distribution grouped by document

### Density Plot

The density plot shows the position distribution density of keywords in text.

#### Chart Features

- X-axis: Relative position in text (0-100%)
- Y-axis: Density value
- Curve: Shows distribution density of keywords at different positions
- Color: Displayed according to color scheme

#### Configuration Options

- **Color Scheme**: Select color theme for chart (blue, green, purple, orange, red)

#### Use Cases

- Analyze distribution patterns of keywords in text
- Discover typical occurrence positions of keywords
- Identify text structure features

### Ridge Plot

The ridge plot shows keyword distribution grouped by document.

#### Chart Features

- X-axis: Relative position in text (0-100%)
- Y-axis: Document groups
- Ridges: Distribution curve for each document
- Color: Displayed according to color scheme

#### Configuration Options

- **Color Scheme**: Select color theme for chart
- **Max Docs**: Set maximum number of documents to display (default: 10, range: 1-50)

#### Use Cases

- Compare keyword distribution across different documents
- Discover distribution differences between documents
- Identify features of specific documents

### Export Features

All charts support export:

- **Export SVG**: Export as vector format, suitable for printing and editing
- **Export PNG**: Export as bitmap format, suitable for inserting into documents

Export buttons are located on the right side of the chart settings bar.

## Usage Tips

### Efficient Search Workflow

1. **Select Corpus**: Choose appropriate corpus based on research goals
2. **Filter Texts**: Use tags or manual selection to focus on target texts
3. **Select Search Mode**: Choose appropriate mode based on search needs
4. **Enter Search Value**: Enter search word or query expression
5. **Set Context**: Adjust context length to balance information and readability
6. **Run Search**: Click search button
7. **View Results**: View KWIC results in table
8. **Sort and Filter**: Use sort and filter functions to precisely locate target results
9. **Visualize Analysis**: Use charts to discover distribution patterns
10. **Export Data**: Export results for further analysis

### Search Mode Selection Recommendations

#### Use Simple Mode When:
- Need quick search for common words
- Need to use wildcards for fuzzy matching
- Search needs are relatively simple

#### Use Lemma Mode When:
- Need to match all morphological variants of a word
- Analyze grammatical variants of words
- Don't care about specific word forms

#### Use Phrase Mode When:
- Need exact phrase matching
- Search fixed expressions
- Analyze multi-word combinations

#### Use Word Mode When:
- Need case sensitivity
- Exact match for specific word forms
- Analyze proper nouns

#### Use Character Mode When:
- Need to search for words containing specific characters
- Analyze spelling features of words
- Discover word patterns

#### Use CQL Mode When:
- Need complex syntax and semantic matching
- Need to combine multiple conditions
- Perform advanced corpus queries

### CQL Query Tips

#### Basic Queries

- `[word="test"]`: Match word form "test"
- `[lemma="go"]`: Match all variants of lemma "go"
- `[pos="NOUN"]`: Match all nouns

#### Combined Queries

- `[pos="NOUN" & lemma="test"]`: Noun with lemma "test"
- `[pos="NOUN" | pos="VERB"]`: Noun or verb
- `[!pos="PUNCT"]`: Not punctuation

#### Sequence Queries

- `[lemma="make"] [] [pos="NOUN"]`: make + any + noun
- `[word="the"] []{2} [pos="NOUN"]`: the + 2 any + noun
- `[lemma="go"] []{1,3} [pos="NOUN"]`: go + 1-3 any + noun

#### Regular Expressions

- `[word=".*ing"]`: Word forms ending in "ing"
- `[lemma="b.*"]`: Lemmas starting with "b"
- `[word="^[A-Z].*"]`: Word forms starting with uppercase letter

### Common Analysis Scenarios

#### Analyzing Word Collocations
1. Use Simple or Lemma mode to search target word
2. Set appropriate context length (5-10)
3. Sort by left or right context
4. View extended context to understand full context

#### Analyzing Grammatical Patterns
1. Use CQL mode to build grammatical queries
2. Example: `[pos="VERB"] [] [pos="NOUN"]` to find verb+noun patterns
3. Use POS filtering to further restrict results

#### Analyzing Phrase Usage
1. Use Phrase mode to search target phrase
2. View density plot to understand phrase distribution in text
3. Use ridge plot to compare usage across different documents

#### Discovering Language Patterns
1. Use Character mode to search specific character combinations
2. Use regular expressions in CQL mode to search patterns
3. Combine sort and filter functions to discover patterns

### Notes

- KWIC search is based on SpaCy annotation data; ensure texts have completed SpaCy annotation
- Large corpora or complex queries may take time; please be patient
- CQL queries perform real-time syntax validation; incorrect queries display error messages
- Search results may be very large; recommend using filter and sort functions
- Context length affects result readability; recommend adjusting based on research needs
- Extended context feature increases server load; recommend moderate use
- When exporting CSV, large datasets may take some time
- Visualization charts may be slow when result count is very large

# Semantic Analysis

This module provides semantic analysis functionality based on the USAS semantic annotation system.

## Theoretical Foundation and References

### USAS Semantic Annotation System

USAS (UCREL Semantic Analysis System) is a semantic annotation system developed by the UCREL research center at Lancaster University, categorizing words into 21 major semantic domains and hundreds of subdomains.

**Official Documentation and Tools**:
- PyMUSAS Official Documentation: [https://ucrel.github.io/pymusas/](https://ucrel.github.io/pymusas/)

### Hybrid Annotation Method

Meta-Lingo supports the hybrid annotation mode, combining rule-based and neural network methods for semantic disambiguation.

**Reference Paper**:
- Hybrid Method Paper: [https://arxiv.org/pdf/2601.09648](https://arxiv.org/pdf/2601.09648)

### MIPVU Metaphor Annotation Method

MIPVU (Metaphor Identification Procedure VU) is a metaphor identification method developed by Vrije Universiteit Amsterdam, and is the most widely used metaphor annotation standard in corpus linguistics.

**Core Concepts**:
- **Basic Meaning**: A word's meaning in other contexts that is more concrete, body-related, or historically earlier
- **Contextual Meaning**: The actual meaning of a word in the current context
- **Metaphor Determination**: If the contextual meaning differs from the basic meaning but can be understood through comparison, classify as metaphor

**Reference**:
- Steen, G., Dorst, L., Herrmann, J., Kaal, A., Krennmayr, T., & Pasma, T. (2010). *A method for linguistic metaphor identification: From MIP to MIPVU*. John Benjamins Publishing.

---

## Metaphor Analysis

### Overview

The Metaphor Analysis module is based on the MIPVU (Metaphor Identification Procedure VU) annotation method, using a hybrid detection approach to automatically identify metaphorical words in English texts. This module combines rule filtering and deep learning models to efficiently and accurately annotate metaphorical expressions in text.

**Supported Language**: English only

### Theoretical Foundation and References

#### MIPVU Annotation Method

MIPVU (Metaphor Identification Procedure VU) is a metaphor identification method developed by Vrije Universiteit Amsterdam, and is the most widely used metaphor annotation standard in corpus linguistics. The method is based on comparing the "basic meaning" and "contextual meaning" of words to determine whether a word has metaphorical usage.

**Core Principles**:
1. Determine the contextual meaning of a word
2. Determine whether the word has a more basic meaning (more concrete, body-related, or historically earlier in other contexts)
3. If the contextual meaning differs from the basic meaning but can be understood through comparison, classify as metaphor

**Reference**:
- Steen, G., Dorst, L., Herrmann, J., Kaal, A., Krennmayr, T., & Pasma, T. (2010). *A method for linguistic metaphor identification: From MIP to MIPVU*. John Benjamins Publishing.

#### HiTZ Metaphor Detection Model

This system uses the pre-trained metaphor detection model developed by the HiTZ research team (University of the Basque Country) as a core component.

**Model Information**:
- **Model Name**: deberta-large-metaphor-detection-en
- **Base Architecture**: DeBERTa-large
- **Task Type**: Token Classification
- **Source**: [HuggingFace - HiTZ/deberta-large-metaphor-detection-en](https://huggingface.co/HiTZ/deberta-large-metaphor-detection-en)

**Reference**:
- Sanchez-Bayona, E., & Agerri, R. (2022). Leveraging a New Spanish Corpus for Multilingual and Cross-lingual Metaphor Detection. *Proceedings of the 26th Conference on Computational Natural Language Learning (CoNLL)*, 228-240.

#### DeBERTa Model

**Reference**:
- He, P., Liu, X., Gao, J., & Chen, W. (2021). DeBERTa: Decoding-enhanced BERT with Disentangled Attention. *International Conference on Learning Representations*.

### Detection Method

Meta-Lingo employs a four-step hybrid detection approach, combining rule filtering and dual-model integration:

#### Step 1: Word Form Filtering

Uses the MIPVU mapping word list (`metaphor_filter.json`) for initial filtering:
- **Word List Source**: Based on VUA corpus training set statistics
- **Selection Criteria**: Words appearing > 10 times and 100% non-metaphorical
- **Word List Size**: 1,098 high-frequency non-metaphor words/phrases
- **Matching Method**: Exact word form matching (lowercase)
- **Output**: Matched words are directly annotated as non-metaphor

#### Step 2: SpaCy Rule Filtering

Grammar-based rule filtering using SpaCy annotation data:

**POS Filtering**:
- CD (Cardinal numbers): such as numbers, years
- NNP (Proper nouns): such as names, places
- SYM (Symbols): such as punctuation, special symbols

**Grammar Pattern Filtering**:
- "to" + verb: "to" in infinitives is non-metaphorical

**High-Confidence Rules**:
Rules based on dependency relations and word forms (literal rate > 99%):

| Dependency | Applicable Words | Description |
|-----------|-----------------|-------------|
| det | the, a, an, some, no, any | Determiners |
| neg | n't, not, never | Negation words |
| mark | if, as, cos, because | Clause markers |
| advmod | so, just, when, very, only, really, too, more | Adverb modifiers |
| predet | all | Pre-determiners |
| intj | well | Interjections |
| agent | *(any)* | Passive agent |

**Note**: Demonstrative pronouns (this, that, these, those) have metaphor rates of 73-87% and will **not** be filtered by rules.

#### Step 3: HiTZ Model Prediction

Uses the HiTZ pre-trained model for metaphor judgment:
- **Input**: Complete sentence
- **Output**: Metaphor label for each word
- **Label Mapping**:
  - LABEL_0 / LABEL_1 -> Metaphor
  - LABEL_2 -> Non-metaphor (pending)

#### Step 4: IDRRP Model Secondary Detection

Addresses the HiTZ model's limitations on function words with the IDRRP model (fine-tuned specifically for IN, DT, RB, RP POS tags):

**Trigger Conditions**:
- Step 3 judged as non-metaphor
- POS is IN (preposition), DT (determiner), RB (adverb), or RP (particle)

**IDRRP Model**:
- **Model Name**: deberta-v3-large-metaphor-in-dt-rb-rp
- **Base Architecture**: microsoft/deberta-v3-large
- **Target POS**: IN, DT, RB, RP
- **Judgment Threshold**: P(metaphor) >= 0.4
- **Source**: [HuggingFace - tommyleo2077/deberta-v3-large-metaphor-in-dt-rb-rp](https://huggingface.co/tommyleo2077/deberta-v3-large-metaphor-in-dt-rb-rp)

### Detection Reliability

Evaluation results based on VUA corpus test set (10 files, 23,588 words):

#### Overall Performance Comparison

| Approach | F1 Score | Precision | Recall |
|----------|----------|-----------|--------|
| HiTZ Single Model | 60.6% | 89.90% | 45.67% |
| **Hybrid Approach** | **78.7%** | 76.86% | **80.53%** |
| **Improvement** | **+18.1%** | -13.04% | **+34.86%** |

#### Analysis by POS

| Evaluation Scope | F1 Score | Precision | Recall |
|-----------------|----------|-----------|--------|
| HiTZ on IN/DT/RB/RP | 9.0% | 93.22% | 4.74% |
| IDRRP on IN/DT/RB/RP | **72.1%** | 65.45% | 80.17% |
| HiTZ on other POS | 84.5% | 89.74% | 79.76% |

#### Key Findings

1. **HiTZ Model Limitations**: F1 of only 9.0% on prepositions, determiners, adverbs, and particles
2. **Hybrid Approach Advantages**: The IDRRP model improves F1 for these POS to 72.1%
3. **Overall Improvement**: Hybrid approach outperforms single model on all 10 test files

### Interface Layout

The Metaphor Analysis module uses a three-column layout:

- **Left Panel** (300px):
  - Corpus selection
  - Text selection
  - POS filter (optional display of metaphors for specific POS)

- **Middle Panel** (flexible width):
  - **Table View**: Word-by-word metaphor annotation results
  - **Text View**: Highlight metaphor words in original text

- **Right Panel** (350px):
  - Statistics (metaphor count, ratio, etc.)
  - Visualization charts (bar chart, pie chart, word cloud)

### Corpus Selection

#### Select Corpus

1. Select target corpus from dropdown menu in left panel
2. System displays the number of texts in the corpus
3. **Note**: Metaphor analysis only supports English corpora

#### Text Selection Mode

Three text selection modes are available:

- **All Texts**: Analyze all texts in the corpus
- **Filter by Tag**: Filter texts by tags
- **Manual Selection**: Manually select specific texts

### POS Filtering

The left panel provides a POS filter to display metaphor results for specific POS only:

- **All POS**: Display all metaphors
- **Noun (NOUN)**: Only noun metaphors
- **Verb (VERB)**: Only verb metaphors
- **Adjective (ADJ)**: Only adjective metaphors
- **Adverb (ADV)**: Only adverb metaphors
- **Preposition (ADP)**: Only preposition metaphors
- **Other**: Determiners, particles, etc.

### Running Analysis

After configuration, click the "Start Analysis" button:

1. System displays loading progress
2. Upon completion, results appear in middle and right panels
3. Error messages display if issues occur

**Notes**:
- Metaphor analysis is based on SpaCy annotation data; ensure texts have completed SpaCy annotation
- Large corpus analysis may take time; please be patient
- Only English texts are supported

### Result Display

#### Table View

The table displays each annotated metaphor word:

| Column | Description |
|--------|-------------|
| Word | Original form of metaphor word |
| Lemma | Dictionary form of word |
| POS | SpaCy Universal POS tag |
| Source | Text file where word occurs |
| Position | Position in text |

#### Text View

Highlights metaphor words in original text:
- Metaphor words highlighted with amber background
- Click highlighted words to view details

### Statistics

The right panel displays summary statistics:

- **Total Words**: Total words analyzed
- **Metaphor Count**: Detected metaphor count
- **Metaphor Rate**: Percentage of metaphor words
- **Distribution by POS**: Metaphor count by POS

### Visualization

Three visualization charts are available:

#### Bar Chart

- Shows metaphor count distribution by POS
- Supports color scheme selection
- Click bars to jump to corresponding POS results

#### Pie Chart

- Shows proportion of metaphors by POS
- Donut chart design
- Hover for detailed data

#### Word Cloud

- Displays high-frequency metaphor words
- Word size adjusted by frequency
- Supports color mapping selection

### Export Functions

- **Export CSV**: Export metaphor annotation results as CSV file
- **Export Charts**: Supports SVG and PNG formats

### Integration Features

#### Re-annotate Button

In the corpus detail page, metaphor re-annotation can be performed:
- Select text and click "Metaphor Re-annotate" button
- System will re-run metaphor detection process

#### Automatic Annotation

When uploading new texts, the system automatically performs metaphor annotation (English texts only).

#### Re-annotation After Editing

After saving text edits, the system automatically triggers metaphor re-annotation.

### Usage Tips

#### Efficient Analysis Workflow

1. **Select Corpus**: Choose an English corpus
2. **Filter Texts**: Use tags or manual selection to focus on target texts
3. **Run Analysis**: Click analysis button
4. **View Results**: Review metaphor annotations in table and text views
5. **Filter by POS**: Use POS filter to focus on specific metaphor types
6. **Visualization Analysis**: Use charts to understand metaphor distribution
7. **Export Data**: Export results for further analysis

#### Common Analysis Scenarios

**Analyzing Metaphor Use in Academic Texts**:
1. Select academic text corpus
2. Run metaphor analysis
3. Review noun and verb metaphor distribution
4. Focus on preposition metaphors (e.g., "in terms of")

**Analyzing Metaphors in News Reports**:
1. Select news corpus
2. Run metaphor analysis
3. Use word cloud to discover high-frequency metaphor words
4. Compare metaphor rates across different news topics

**Analyzing Metaphor Style in Literary Works**:
1. Select literary corpus
2. Run metaphor analysis
3. Review overall metaphor rate
4. Analyze metaphor usage preferences by POS

### Notes

- Metaphor analysis only supports English texts
- Analysis is based on SpaCy annotation data; ensure texts have completed SpaCy annotation
- Detection results are automatic annotations; errors may occur
- Some metaphorical expressions (e.g., dead metaphors) may not be detected
- Large corpus analysis may take time
- Recommend combining with manual verification

---

## Semantic Domain Analysis

### Overview

The Semantic Domain Analysis module is based on USAS (UCREL Semantic Analysis System) annotation data, performing semantic domain classification and statistical analysis on words in the corpus. USAS is a multi-level semantic annotation system that categorizes words into different semantic domains, helping researchers understand semantic features and topic distribution of the corpus.

### Interface Layout

The Semantic Domain Analysis module uses a left-right split layout:

- **Left Panel** (400px): Configuration panel containing corpus selection, result mode selection, POS filtering, search configuration, etc.
- **Right Panel** (flexible width): Results display area with two tabs
  - **Results Table**: Displays semantic domain statistics
  - **Visualization**: Provides two visualization methods: bar chart and pie chart

### Corpus Selection

#### Selecting a Corpus

1. Select the target corpus from the dropdown menu at the top of the left panel
2. The system displays the number of texts in the corpus
3. After selecting a corpus, the system automatically loads all texts in that corpus

#### Text Selection Modes

The system provides three text selection modes, same as other analysis modules:

- **All Texts**
  - Select "All Texts" mode
  - Analysis will include all texts in the corpus
  - Displays total number of texts

- **Filter by Tags**
  - Select "Filter by Tags" mode
  - Select one or more tags from the dropdown menu
  - The system filters all texts containing these tags
  - Displays the number of filtered texts

- **Manual Selection**
  - Select "Manual Selection" mode
  - Use the search box to search texts by filename
  - Check the texts you want to analyze in the text list
  - Supports "Select All" and "Clear All" quick actions
  - Displays the number of selected texts

#### Selection Status Indicator

After selection, the system displays:
- Number of selected texts
- Success/warning indicator (based on selection count)

### Result Mode Selection

The system provides two result display modes:

#### By Domain

Statistics on the frequency and proportion of each semantic domain.

**Features**:
- Displays semantic domain code, name, and major category
- Statistics on total frequency and percentage for each semantic domain
- Can view all words contained in each semantic domain
- Suitable for analyzing overall semantic distribution of the corpus

**Table Columns**:
- Rank
- Semantic Domain Code
- Semantic Domain Name
- Major Category
- Frequency
- Percentage
- Actions (View Words)

#### By Word

Statistics on the semantic domain to which each word belongs and its frequency.

**Features**:
- Displays word, semantic domain, and POS
- Statistics on frequency and percentage for each word-semantic domain combination
- Can jump to other analysis modules (collocation analysis, word sketch)
- Suitable for analyzing semantic features of specific words

**Table Columns**:
- Rank
- Word
- Semantic Domain Code
- Semantic Domain Name
- POS
- Frequency
- Percentage
- Actions (Cross-module Links)

#### Highlight Metaphor Words

In "By Word" mode, the system supports highlighting metaphor words:

**Enable Method**:
- Find the "Highlight Metaphor Words" switch in the toolbar
- Click the switch to enable or disable highlighting

**Display Effect**:
- When enabled, metaphor words are displayed in **green bold** style
- Metaphor words in the table are easily identifiable

**CSV Export**:
- When exporting CSV, metaphor words are marked with `**word**`
- Example: `**metaphorical_word**`

**Technical Notes**:
- This feature depends on the `is_metaphor` field returned by the backend
- Ensure texts have completed metaphor annotation
- Only available in "By Word" mode

**Usage Tips**:
- **By Domain**: Suitable for analyzing overall semantic features and topic distribution of the corpus
- **By Word**: Suitable for analyzing semantic classification and usage of specific words

### POS Filtering

POS filtering is based on the SpaCy Universal POS tagset, allowing you to analyze only words with specific parts of speech.

#### Filter Modes

- **Keep Mode**: Only count words containing your selected POS tags. Example: Selecting NOUN and VERB will only count semantic domains of nouns and verbs
- **Filter Mode**: Exclude words containing your selected POS tags. Example: Selecting PUNCT will exclude semantic domains of punctuation

#### POS Tag Categories

The system categorizes POS tags into three groups for easy selection:

**Content Words**:
- **NOUN**: Noun
- **VERB**: Verb
- **ADJ**: Adjective
- **ADV**: Adverb
- **PROPN**: Proper noun

**Function Words**:
- **ADP**: Adposition
- **AUX**: Auxiliary verb
- **CCONJ**: Coordinating conjunction
- **DET**: Determiner
- **PART**: Particle
- **PRON**: Pronoun
- **SCONJ**: Subordinating conjunction

**Other**:
- **INTJ**: Interjection
- **NUM**: Numeral
- **PUNCT**: Punctuation
- **SYM**: Symbol
- **X**: Other

#### Quick Actions

- **Select All**: Quickly select all POS tags
- **Clear All**: Clear all selections

### Search Configuration

The Search Configuration panel provides various filtering options to help you precisely locate target semantic domains or words.

#### Frequency Range

Set the frequency range for semantic domains or words:

- **Minimum Frequency**: Only display semantic domains/words with frequency greater than or equal to this value (default: 1)
- **Maximum Frequency**: Only display semantic domains/words with frequency less than or equal to this value (optional, set to 0 for no limit)

#### Case Handling

- **Convert to Lowercase**: When checked, all words are converted to lowercase for statistics
- Recommendation: Enable when analyzing English to merge case variants

#### Search Types

- **All**: No search filtering, count all semantic domains/words meeting the criteria
- **Starts With**: Only count semantic domain codes or words starting with the specified string. Example: Enter "A" to count all semantic domains starting with "A" (e.g., "A1", "A2")
- **Ends With**: Only count semantic domain codes or words ending with the specified string. Example: Enter "1" to count all semantic domains ending with "1" (e.g., "A1", "B1")
- **Contains**: Only count semantic domain codes or words containing the specified string. Example: Enter "time" to count words containing "time"
- **Regular Expression (Regex)**: Use regular expressions for advanced matching, supports full regular expression syntax. Example: `^A.*` matches semantic domain codes starting with "A"
- **Wordlist**: Enter a word list (one per line), only count results containing words in the list, suitable for analyzing semantic domain distribution of specific vocabulary sets

#### Exclude Words

Enter words to exclude in the "Exclude Words" text box (one per line). Results containing these words will not appear in the statistics.

**Use Cases**:
- Exclude stop words
- Exclude specific interference words
- Exclude proper nouns like names and places

### Running Analysis

After configuration, click the "Start Analysis" button:

1. The system displays loading progress
2. After analysis completes, results automatically appear in the right panel
3. If errors occur, error messages are displayed in the left panel

**Note**:
- Semantic domain analysis is based on USAS annotation data; ensure texts have completed USAS annotation
- Analysis of large corpora may take time; please be patient
- Recommend testing with smaller text collections first

### Results Table

#### Statistics

The top of the table displays statistical summary:

- **Total Tokens**: Total count of all words meeting the criteria
- **Unique Domains**: Number of non-duplicate semantic domains
- **Unique Words**: Number of non-duplicate words
- **Result Count**: Total number of current results

#### Table Columns

**By Domain Mode**:

| Column | Description |
|--------|-------------|
| Rank | Ranking sorted by frequency |
| Domain Code | USAS semantic domain code (e.g., "A1", "B2") |
| Domain Name | Full name of semantic domain |
| Major Category | Major category to which the semantic domain belongs (21 major categories) |
| Frequency | Occurrence count of the semantic domain |
| Percentage | Percentage of total tokens |
| Actions | View all words contained in the semantic domain |

**By Word Mode**:

| Column | Description |
|--------|-------------|
| Rank | Ranking sorted by frequency |
| Word | The word itself |
| Domain Code | Semantic domain code to which the word belongs |
| Domain Name | Semantic domain name to which the word belongs |
| POS | POS tag of the word |
| Frequency | Occurrence count of the word-semantic domain combination |
| Percentage | Percentage of total tokens |
| Actions | Cross-module links (collocation analysis, word sketch) |

#### Sorting

Click column headers to sort:

- **Rank**: Sort by frequency ranking
- **Domain/Word**: Sort alphabetically
- **Frequency**: Sort by occurrence count
- **Percentage**: Sort by percentage

Supports ascending/descending toggle.

#### View Domain Words

In "By Domain" mode, click the "View Words" button (info icon) in a table row to view all words contained in that semantic domain:

- Displays a dialog listing all words in that semantic domain
- Shows frequency for each word
- Can jump to other analysis modules (collocation analysis, word sketch)
- Displays total word count for that semantic domain

#### Cross-module Links

In "By Word" mode, the table displays an "Actions" column providing:

- **Collocation Analysis**: Jump to Collocation Analysis module to analyze co-occurrence relationships
- **Word Sketch**: Jump to Word Sketch module to view grammatical patterns

#### Export

Click the "Export" button at the top of the table to export results as CSV file:

- **By Domain Mode**: Includes rank, domain code, domain name, major category, frequency, percentage
- **By Word Mode**: Includes rank, word, domain code, domain name, POS, frequency, percentage
- Filename includes date and mode information

#### Pagination

- Supports 10, 25, 50, 100 rows per page
- Switch pages and rows per page at the bottom of the table

### Visualization

The Visualization panel provides two chart types to help you intuitively understand semantic domain distribution.

#### Chart Type Switching

Switch chart types via top tabs:

- **Bar Chart**: Suitable for displaying top N high-frequency semantic domains
- **Pie Chart**: Suitable for displaying semantic domain proportion distribution

#### Bar Chart

**Configuration Options**:
- **Max Display Count**: Set how many semantic domains to display (default: 20, range: 5-50)
- **Color Scheme**: Select color theme for bars (blue, green, purple, orange, red)
- **Show Percentage**: Whether to display percentage labels on bars

**Interactive Features**:
- Click bars to jump to results table (if click callback is enabled)
- Chart height automatically adjusts based on display count

**Chart Features**:
- X-axis: Semantic domain code or name
- Y-axis: Frequency or percentage
- Bar color: Displayed according to color scheme
- Labels: Display frequency or percentage (if enabled)

#### Pie Chart

**Configuration Options**:
- **Max Display Count**: Set how many semantic domains to display (default: 10, range: 5-20)
- **Color Scheme**: Select color theme for pie chart
- **Show Percentage**: Whether to display percentage labels on pie slices

**Chart Features**:
- Uses donut chart design
- Displays legend for easy identification
- Click slices to jump to results table (if click callback is enabled)
- Colors automatically assigned according to color scheme

#### Export Features

All charts support export:

- **Export SVG**: Export as vector format, suitable for printing and editing
- **Export PNG**: Export as bitmap format, suitable for inserting into documents

Export buttons are located on the right side of the chart settings bar.

### USAS Semantic Domain System

#### Overview

USAS (UCREL Semantic Analysis System) is a multi-level semantic annotation system that categorizes words into different semantic domains. The system includes 21 major categories, each containing multiple sub-semantic domains.

#### 21 Major Categories

1. **A**: General & Abstract Terms
2. **B**: The Body & The Individual
3. **C**: Arts & Crafts
4. **E**: Emotional Actions, States & Processes
5. **F**: Food & Farming
6. **G**: Government & Public
7. **H**: Architecture, Housing & The Home
8. **I**: Money & Commerce
9. **K**: Entertainment, Sports & Games
10. **L**: Life & Living Things
11. **M**: Movement, Location, Travel & Transport
12. **N**: Numbers & Measurement
13. **O**: Substances, Materials, Objects & Equipment
14. **P**: Education
15. **Q**: Language & Communication
16. **S**: Social Actions, States & Processes
17. **T**: Time
18. **W**: The World & Our Environment
19. **X**: Psychological Actions, States & Processes
20. **Y**: Science & Technology
21. **Z**: Names & Grammatical Words

#### Semantic Domain Code Format

Semantic domain codes typically consist of an uppercase letter (representing major category) and a number (representing subcategory), for example:
- **A1**: General actions, making, etc.
- **B1**: Anatomy & Physiology
- **E1**: Happy

Some semantic domains may contain finer classifications, indicated by decimal points or additional letters.

#### Semantic Tag Suffixes

USAS semantic tags may include special suffixes to convey additional semantic information:

| Suffix | Meaning | Example | Description |
|--------|---------|---------|-------------|
| **+** | Positive | `A5.1+` | Indicates positive evaluation or meaning, e.g., "good", "excellent" |
| **-** | Negative | `A5.1-` | Indicates negative evaluation or meaning, e.g., "bad", "terrible" |
| **++** | Strongly positive | `E2++` | Indicates strongly positive emotion, e.g., "love", "adore" |
| **--** | Strongly negative | `E2--` | Indicates strongly negative emotion, e.g., "hate", "despise" |
| **_MWE** | Multi-word expression | `A1.1.1_MWE` | Indicates the tag comes from multi-word expression recognition, e.g., "give up", "in front of" |

**Suffix Usage Notes**:

1. **Polarity Suffixes (+/-)**:
   - No suffix: Neutral or polarity not obvious
   - `+`: Positive meaning
   - `-`: Negative meaning
   - `++`/`--`: Strongly positive/negative meaning

2. **MWE Suffix**:
   - Only appears in Rule-based mode and Hybrid mode
   - Neural mode does not recognize multi-word expressions, so it will not produce `_MWE` suffixes
   - All words in a multi-word expression share the same tag with `_MWE` suffix

3. **Compound Tags**:
   - Some words may be assigned compound tags, such as `N3.8+/A2.1`
   - Multiple semantic domains separated by `/` indicate the word belongs to multiple semantic categories
   - In semantic domain analysis statistics, each component of a compound tag is counted separately

### USAS Tagging Modes

The system supports three USAS tagging modes, which can be selected in "Application Settings". Different tagging modes have different technical characteristics and applicable scenarios.

#### Rule-Based Mode

Rule-based mode is the system's default tagging method, implemented based on the PyMUSAS rule-based tagger.

**Technical Principles**:

1. **Dictionary Lookup**: PyMUSAS uses pre-compiled semantic dictionaries (containing single words and multi-word expressions) to look up candidate semantic tags based on word form and part-of-speech. Each word may match multiple candidate tags.

2. **Multi-Word Expression Recognition (MWE)**: The system can recognize multi-word expressions (such as "give up", "in front of"), which are assigned semantic tags as a whole rather than split into individual words. MWE tags are suffixed with `_MWE` for distinction.

3. **Disambiguation Processing**: When a word has multiple candidate tags, the system attempts disambiguation strategies in **strict priority order**. Once a strategy successfully selects a tag, subsequent strategies are not executed:

   **Priority 1 - Text Type Priority**:
   - Checks the text type selected during upload (such as medical, legal, sports)
   - According to the priority semantic domain list corresponding to the text type, checks candidate tags in order
   - If a candidate tag belongs to a priority semantic domain, immediately selects that tag and disambiguation ends
   - Example: When text type is "medical", tags like B1 (Anatomy), B2 (Health & Disease) have priority
   
   **Priority 2 - Discourse Domain Recognition**:
   - Only executed if Text Type Priority fails to select a tag
   - Counts the semantic tag distribution of all words in the entire text
   - Calculates the occurrence ratio of 21 major categories (A-Z)
   - Identifies the dominant semantic domain (category with >20% proportion)
   - If a candidate tag belongs to the major category of the dominant domain, selects that tag
   - Example: If category N (Numbers & Measurement) accounts for 35% of the text, N-category candidate tags are prioritized
   
   **Priority 3 - One-Sense-Per-Discourse Rule**:
   - Only executed if the previous two strategies fail to select a tag
   - Based on the linguistic assumption that "the same lemma should maintain the same meaning within the same text"
   - Counts all semantic tag votes for the same lemma in the text
   - If a tag's vote share exceeds 50% and that tag is in the current candidate list, selects that tag
   - Example: If "bank" appears 5 times in the text and 4 times is tagged as I1.1 (Finance), I1.1 is prioritized
   
   **Default Selection**:
   - If all three strategies above fail to select a tag, selects the first tag in the candidate list

4. **Compound Tag Processing**: Some words may be annotated with compound tags (such as `A3+/Q2.2`), which the system will split into independent tags for statistics.

**Advantages**:
- Supports multi-word expression (MWE) recognition
- Fast processing speed with low resource consumption
- Highly interpretable annotation results
- Supports compound tags and fine-grained semantic classification

**Disadvantages**:
- Depends on dictionary coverage; words not in the dictionary cannot be annotated (marked as Z99 unknown)
- Disambiguation rules may not be accurate in some cases

#### Neural Mode

Neural mode uses the pre-trained deep learning model PyMUSAS-Neural-Multilingual-Base-BEM for annotation.

**Technical Principles**:

1. **Semantic Embedding**: The model is fine-tuned based on multilingual ModernBERT architecture and can convert words and their context into high-dimensional semantic vectors.

2. **Prediction Mechanism**: The model treats semantic tag prediction as a Word Sense Disambiguation task. For each word, the model calculates the similarity between its contextual embedding and each semantic tag embedding, selecting the tag with the highest similarity.

3. **Single Tag Output**: In this mode, the system sets `top_n=1`, outputting only one semantic tag per word without additional disambiguation processing.

4. **Context Awareness**: Neural networks can use the contextual information of words for prediction. Even if a word is not in the dictionary, its semantics can be inferred from context.

5. **Sentence-by-Sentence Processing**: To ensure context completeness and handle long texts, the system processes text sentence by sentence. Each word is predicted within the full context of its sentence.

**Advantages**:
- High coverage, able to predict tags for all words
- Uses contextual information for more accurate handling of polysemous words
- Dictionary-independent, can handle new words and out-of-vocabulary words
- Sentence-by-sentence processing supports texts of any length

**Disadvantages**:
- Does not support multi-word expression (MWE) recognition
- Higher computational resource consumption
- Only outputs single semantic tags, does not support compound tags
- Slower inference speed

#### Hybrid Mode

Hybrid mode combines the advantages of both rule-based and neural network methods, making it the most comprehensive solution among the three modes.

**Technical Principles**:

1. **Rule First**: First use the PyMUSAS rule-based tagger to annotate all words and obtain candidate semantic tags (including multi-word expression recognition).

2. **Neural Matching**: For words with multiple candidate tags (non-MWE, non-Z99), use neural network with `top_n=5` predictions to match against rule candidates in priority order. Matching compares only the base semantic domain name (excluding suffixes like +, -, _MWE). If matched, the original suffix from the rule candidate is preserved. The neural network processes text **sentence by sentence** to preserve full context.

3. **Unknown Word Backoff**: For words marked as Z99 (unknown), use neural network `top_n=1` for prediction within the context of their sentence.

4. **Disambiguation Processing**: For multi-candidate words where neural matching failed, disambiguation strategies are executed in priority order (Text Type Priority > Discourse Domain Recognition > One-Sense-Per-Discourse Rule).

5. **Final Fallback**: When all disambiguation strategies fail, use neural network `top_n=1` as the final fallback.

**Detailed Workflow**:

**Step 1 - Rule Annotation**: Use the PyMUSAS rule-based tagger on the input text to obtain candidate semantic tag lists (including multi-word expression recognition).

**Step 2 - Token Classification**: Classify words into three categories:
- **Z99 Words**: Unknown words that the rule tagger cannot recognize
- **Multi-tag Words**: Polysemous words with multiple candidate tags (non-MWE)
- **Single-tag Words**: Words with only one candidate tag, or MWE words, keep as-is

**Step 3 - Neural Network Processing**:
- **Z99 Words**: Call neural network `top_n=1`, directly obtain final tag
- **Multi-tag Words**: Call neural network `top_n=5`, match against rule candidates in priority order:
  - Matching rule: Compare only base semantic domain names (remove +, -, _MWE suffixes)
  - Match success: Select the corresponding rule candidate tag (preserve original suffix)
  - Match failure: Mark as "pending disambiguation"

**Step 4 - Disambiguation Processing**: For words where neural matching failed, execute disambiguation in priority order (stops on success):
- **Priority 1**: Text Type Priority - if matched, select that tag; otherwise continue
- **Priority 2**: Discourse Domain Recognition - if matched, select that tag; otherwise continue
- **Priority 3**: One-Sense-Per-Discourse Rule - if votes >50%, select that tag; otherwise mark as "pending fallback"

**Step 5 - Final Fallback**: For words where all disambiguation strategies failed, call neural network `top_n=1` to obtain the final tag.

**Step 6 - Output Results**: Integrate all word annotation results and output the final annotated text.

**Advantages**:
- Combines the advantages of both rule mode and neural network mode
- Supports multi-word expression recognition
- High coverage (neural network supplements unknown words and disambiguation failures)
- Triple neural fallback mechanism: multi-tag matching + unknown word backoff + disambiguation failure fallback
- Neural network and rule candidates collaborate on decisions, preserving rule suffix information
- Annotation quality typically better than single modes

**Disadvantages**:
- Highest computational resource consumption
- Slowest processing speed
- Requires loading both rule model and neural network model

#### Mode Selection Recommendations

| Scenario | Recommended Mode | Reason |
|----------|------------------|--------|
| Quick analysis | Rule-Based | Fast speed, low resource consumption |
| Contains many technical terms | Hybrid | Neural network can supplement technical vocabulary |
| Requires high coverage | Neural / Hybrid | Can handle unknown words |
| Focus on multi-word expressions | Rule-Based / Hybrid | Supports MWE recognition |
| Resource-constrained environment | Rule-Based | No GPU required |
| Pursuing highest accuracy | Hybrid | Combines advantages of both methods |

#### Mode Settings

You can select the USAS tagging mode in the "Application Settings" page:

1. Go to the "Application Settings" page
2. Find the "USAS Tagging Mode" settings panel
3. Select the desired mode (Rule-Based / Neural / Hybrid)
4. The system will automatically save the settings

The configured mode will apply to:
- Automatic USAS annotation during corpus upload
- USAS re-annotation in the corpus detail page
- Annotation process in the semantic domain analysis module

**Note**: Neural mode and Hybrid mode require the neural network model files to be installed. If the model is not installed, these two options will be displayed as unavailable.

### Usage Tips

#### Efficient Analysis Workflow

1. **Select Corpus**: Choose appropriate corpus based on research goals
2. **Filter Texts**: Use tags or manual selection to focus on target texts
3. **Select Result Mode**: Choose appropriate mode based on research questions (by domain or by word)
4. **Set POS Filter**: Select relevant parts of speech based on research questions
5. **Configure Search**: Use search and exclude functions to precisely locate target semantic domains or words
6. **Run Analysis**: Click analysis button
7. **View Results**: View detailed data in table
8. **Visualize Analysis**: Use charts to discover semantic distribution patterns
9. **Deep Analysis**: Click semantic domain to view contained words, or jump to other analysis modules
10. **Export Data**: Export results for further analysis

#### Result Mode Selection Recommendations

**Use "By Domain" Mode When**:
- Want to understand overall semantic features of the corpus
- Analyze topic distribution and semantic tendencies
- Compare semantic domain distribution across different corpora
- Discover main semantic categories of the corpus

**Use "By Word" Mode When**:
- Want to understand semantic classification of specific words
- Analyze word polysemy (a word may belong to multiple semantic domains)
- Study semantic usage of words
- Need to jump to other analysis modules for in-depth analysis

#### Common Analysis Scenarios

**Analyzing Semantic Features of Corpus**:
1. Select "By Domain" mode
2. Select target corpus
3. Set POS filter: Keep content words (NOUN, VERB, ADJ, ADV)
4. Run analysis
5. View bar chart or pie chart to understand semantic distribution
6. Click high-frequency semantic domains to view contained words

**Analyzing Semantic Classification of Specific Words**:
1. Select "By Word" mode
2. Use search function to filter target words
3. Run analysis
4. View semantic domains to which words belong
5. Click action buttons to jump to collocation analysis or word sketch

**Comparing Semantic Domain Distribution Across Corpora**:
1. Perform semantic domain analysis on two corpora separately
2. Use "By Domain" mode
3. Export results for comparison
4. Analyze differences in semantic domain distribution

**Discovering Topic Tendencies of Corpus**:
1. Select "By Domain" mode
2. View highest frequency semantic domains
3. Analyze major categories to which these semantic domains belong
4. Combine semantic domain names to understand topic tendencies of the corpus

### Notes

- Semantic domain analysis is based on USAS annotation data; ensure texts have completed USAS annotation
- Analysis of large corpora may take time; please be patient
- USAS annotation may be incomplete; some words may not have semantic domain tags
- A word may belong to multiple semantic domains (polysemy); the system counts them separately
- Semantic domain codes and names are based on USAS standards; refer to USAS documentation for detailed meanings
- When exporting CSV, large datasets may take some time
- Visualization charts may be slow when result count is very large
- View domain words feature requires additional server requests; please be patient

# Word Sketch Analysis

## Overview

The Word Sketch Analysis module is based on SpaCy dependency parsing annotation data, analyzing grammatical collocation patterns of words. The module provides two analysis modes: **Word Sketch** (grammatical collocation analysis for a single word) and **Word Sketch Difference** (collocation comparison analysis for two words), helping researchers deeply understand grammatical behavior and collocation features of words.

## Implementation Principles

### Technical Foundation

Word Sketch functionality is based on the following technologies:

- **SpaCy Dependency Parsing**: Extracts syntactic relationships between words
- **Universal Dependencies**: Standardized dependency relation label set
- **logDice Statistics**: Statistical method for measuring collocation strength

### Dependency Parsing

Meta-Lingo uses SpaCy for dependency parsing, identifying grammatical relationships between words. Each token has a **head** (governor) and a **dep** (dependency relation type).

For example, in the sentence "The quick brown fox jumps over the lazy dog":
- "fox" is the subject (nsubj) of "jumps"
- "quick" and "brown" are modifiers (amod) of "fox"
- "dog" is the object (pobj) of "over"

### Grammatical Relation Categories

The system categorizes dependency relations into **50 grammatical relations**, covering:

| Category | Relation Types | Examples |
|----------|---------------|----------|
| Subject Relations | nsubj, nsubjpass, csubj | "fox jumps" (fox is subject of jumps) |
| Object Relations | dobj, iobj, pobj | "eat apple" (apple is object of eat) |
| Modifier Relations | amod, advmod, nmod | "big house" (big modifies house) |
| Prepositional Relations | prep, pcomp | "look at" (at is prep of look) |
| Clause Relations | advcl, relcl, ccomp | Adverbial clauses, relative clauses |
| Coordination Relations | conj, cc | "bread and butter" |
| Other Relations | det, aux, mark, case | Determiners, auxiliaries, etc. |

### logDice Score Calculation

**logDice** is a statistical method for measuring collocation strength, proposed by Sketch Engine, with the following characteristics:

- Range: theoretically -infinity to 14, commonly 0-10
- Independent of corpus size
- Easy to interpret: higher score means more typical collocation

Calculation formula:

$$\text{logDice} = 14 + \log_2 \frac{2 \times f_{xy}}{f_x + f_y}$$

where:
- $f_{xy}$: Co-occurrence frequency of words x and y
- $f_x$: Frequency of word x
- $f_y$: Frequency of word y

**Score Interpretation**:
| Score Range | Collocation Strength |
|-------------|---------------------|
| > 7 | Very strong collocation |
| 5-7 | Strong collocation |
| 3-5 | Medium collocation |
| < 3 | Weak collocation |

### Word Sketch Difference Principle

Word Sketch Difference is used to compare collocation differences between two words:

1. Calculate Word Sketch for both words separately
2. Find common grammatical relation types
3. Calculate logDice difference for each collocate between the two words
4. Sort by difference magnitude, showing collocates biased toward one word

Difference score calculation:

$$\text{Diff} = \text{logDice}(w_1, c) - \text{logDice}(w_2, c)$$

where $c$ is the collocate, and $w_1$ and $w_2$ are the two compared words.

### References

- Kilgarriff, A., Rychly, P., Smrz, P., & Tugwell, D. (2004). The Sketch Engine. *Proceedings of EURALEX 2004*, 105-116.
- Kilgarriff, A., & Tugwell, D. (2001). Word Sketch: Extraction and Display of Significant Collocations for Lexicography. *Proceedings of ACL Workshop on COLLOCATION*, 32-38.
- Rychly, P. (2008). A Lexicographer-Friendly Association Score. *Proceedings of RASLAN*, 6-9.

## Interface Layout

The Word Sketch Analysis module uses a top-level tab design:

- **Top-level Tabs**: Switch between "Word Sketch" and "Word Sketch Difference" modes
- **Left Panel** (400px): Configuration panel containing corpus selection, search configuration, etc.
- **Right Panel** (flexible width): Results display area with two tabs
  - **Analysis Results**: Displays grammatical relation cards or comparison tables
  - **Visualization**: Provides network graph visualization

## Word Sketch

### Corpus Selection

Same as other analysis modules, supports three text selection modes:
- **All Texts**: Analyze all texts in the corpus
- **Filter by Tags**: Filter texts by tags
- **Manual Selection**: Manually select specific texts

### Search Configuration

#### Search Word

Enter the word to analyze in the "Search Word" input box:

- Supports entering word form or lemma
- System automatically matches based on POS filter
- Press Enter to quickly run analysis

#### POS Filter

Select the POS of the target word to help the system identify the word more accurately:

- **Auto**: System automatically identifies word POS
- **Adjective**: Limit to adjectives
- **Adverb**: Limit to adverbs
- **Noun**: Limit to nouns
- **Verb**: Limit to verbs
- **Pronoun**: Limit to pronouns

**Usage Tips**:
- If a word has multiple POS, recommend selecting "Auto" to let the system automatically identify
- If you know the word's POS, selecting the corresponding POS can improve accuracy

#### Results per Relation

Set the number of collocates to display in each grammatical relation card:

- **Range**: 5-100 (default: 12)
- Controls the number of collocates displayed in each relation card
- Can view more results via "Show More" button

#### Minimum Frequency

Set the minimum occurrence frequency for collocates:

- **Range**: 1-100 (default: 2)
- Only display collocates with frequency greater than or equal to this value
- Recommend setting to 2-3 to filter out accidentally occurring collocations

#### Minimum Score

Set the minimum logDice score for collocates:

- **Range**: 0-14 (default: 0, step: 0.5)
- logDice score measures collocation strength; higher scores indicate stronger collocations
- Recommend setting to 0 to view all collocations, or 3-5 to view strong collocations

### Running Analysis

After configuration, click the "Start Analysis" button:

1. The system displays loading progress
2. After analysis completes, results automatically appear in the right panel
3. All relation cards are expanded by default
4. If errors occur, error messages are displayed in the left panel

**Note**:
- Word Sketch analysis is based on SpaCy dependency parsing annotation data; ensure texts have completed SpaCy annotation
- Analysis of large corpora may take time; please be patient
- If a word appears very few times in the corpus, it may not be possible to extract sufficient grammatical relations

## Analysis Results

### Statistics Summary

The top of results displays statistical summary:

- **Target Word**: The word being analyzed
- **Total Instances**: Total occurrence count of the word in the corpus
- **Relation Count**: Number of grammatical relation types identified

### Grammatical Relation Cards

The system uses BERTopic-style cards to display each grammatical relation:

#### Card Structure

Each relation card contains:

1. **Card Header**:
   - **Relation Name**: Name of the grammatical relation (e.g., "Subject", "Object", "Modifier", etc.)
   - **Collocation Count**: Shows currently displayed collocate count / total collocate count
   - **Expand/Collapse Button**: Click to expand or collapse card content

2. **Card Content** (when expanded):
   - **Collocate Table**: Displays all collocates for this relation
   - **Table Columns**:
     - **Collocate**: Word that forms this grammatical relation with the target word
     - **Frequency**: Occurrence count of the collocate
     - **Score**: logDice score (collocation strength)
     - **Actions**: Quick action menu (if enabled)

3. **Show More/Less Button**:
   - If collocate count exceeds initial display count, "Show More" button appears
   - Click to display more collocates (increases by the set display count each time)
   - If more are displayed, "Show Less" button appears to restore initial display count

#### Grammatical Relation Types

The system supports 50 grammatical relation templates, automatically selecting relevant relations based on target word POS:

**Verb (VERB) Relations** (15 types):
- Subject
- Direct Object
- Indirect Object
- Prepositional Object
- Modifier
- etc.

**Noun (NOUN) Relations** (15 types):
- Modifier
- Possessive
- Prepositional Modifier
- etc.

**Adjective (ADJ) Relations** (10 types):
- Modified Noun
- Compared With
- etc.

**Adverb (ADV) Relations** (10 types):
- Modified Verb
- Modified Adjective
- etc.

### Sorting and Filtering

- **Sort by Score**: Collocates sorted by logDice score from high to low
- **Sort by Frequency**: Can click table column headers to sort
- **Minimum Frequency Filter**: Filter low-frequency collocations via "Minimum Frequency" parameter
- **Minimum Score Filter**: Filter weak collocations via "Minimum Score" parameter

### Quick Actions

In the collocate table, each collocate provides a quick action menu:

- **Collocation Analysis**: Jump to Collocation Analysis module to analyze co-occurrence relationships
- **Word Sketch**: Jump to Word Sketch Analysis module to analyze grammatical collocations

### Expand/Collapse Function

- **Expand All**: Click "Expand All" button in toolbar to expand all relation cards
- **Collapse All**: Click "Collapse All" button in toolbar to collapse all relation cards
- **Individual Expand/Collapse**: Click expand/collapse button in each card header

## Word Sketch Difference

### Corpus Selection

Same as Word Sketch mode, supports three text selection modes.

### Search Configuration

#### Word 1 and Word 2

Enter the two words to compare in "Word 1" and "Word 2" input boxes:

- Supports entering word form or lemma
- System automatically matches based on POS filter
- Both words should have the same POS for effective comparison

#### POS Filter

Select POS for both words, same as Word Sketch mode.

#### Minimum Frequency

Set minimum occurrence frequency for collocates, same as Word Sketch mode.

#### Compare Mode

Select matching method for comparison:

- **Lemmas**: Match based on lemmas (recommended)
  - Example: "go" and "goes" are treated as the same word
  - Suitable for most comparison scenarios
- **Word Form**: Match based on word forms
  - Example: "go" and "goes" are treated as different words
  - Suitable for scenarios requiring word form distinction

### Running Analysis

After configuration, click the "Start Analysis" button to begin comparison analysis.

## Comparison Results

### Statistics Summary

The top of results displays comparison statistics:

- **Word 1 Total Relations**: Number of grammatical relation types for word 1
- **Word 2 Total Relations**: Number of grammatical relation types for word 2
- **Common Relations**: Number of grammatical relation types shared by both words

### Grammatical Relation Cards

Relation cards in comparison mode display collocation comparison for both words:

#### Card Structure

Each relation card contains:

1. **Card Header**:
   - **Relation Name**: Name of the grammatical relation
   - **Statistics**: Shows shared, word 1 only, word 2 only collocate counts
   - **Expand/Collapse Button**

2. **Card Content** (when expanded):
   - **Comparison Table**: Displays all collocates for this relation and their comparison data
   - **Table Columns**:
     - **Collocate**: The collocate itself
     - **Word 1 Frequency**: Occurrence count in word 1's collocations
     - **Word 1 Score**: logDice score with word 1
     - **Word 2 Frequency**: Occurrence count in word 2's collocations
     - **Word 2 Score**: logDice score with word 2
     - **Score Difference**: Difference between the two scores (positive means word 1 is stronger, negative means word 2 is stronger)
     - **Actions**: Quick action menu

#### Color Coding

The system uses color coding to help you quickly identify collocation differences:

- **Blue Series** (score difference ≥ 2): Word 1's collocation is stronger
  - Deep Blue (≥ 6): Word 1 is significantly stronger
  - Blue (≥ 4): Word 1 is stronger
  - Light Blue (≥ 2): Word 1 is slightly stronger
- **Gray** (-2 < score difference < 2): Both words have similar collocation strength
- **Red Series** (score difference ≤ -2): Word 2's collocation is stronger
  - Light Red (≤ -2): Word 2 is slightly stronger
  - Red (≤ -4): Word 2 is stronger
  - Deep Red (≤ -6): Word 2 is significantly stronger

**Table Row Background Color**:
- Different background shades based on score difference
- Blue background indicates word 1's collocation is stronger
- Red background indicates word 2's collocation is stronger
- Transparent background indicates similar collocation strength

**Table Left Indicator Bar**:
- Each table row has a colored indicator bar on the left
- Color corresponds to score difference for quick identification

#### Collocation Categories

Collocates in comparison results are divided into three categories:

1. **Shared Collocations**: Collocates present in both words
   - Shows frequencies and scores for both words
   - Judge which word's collocation is stronger via score difference

2. **Word 1 Only**: Collocates only present in word 1
   - Only shows word 1's frequency and score
   - Highlighted in blue

3. **Word 2 Only**: Collocates only present in word 2
   - Only shows word 2's frequency and score
   - Highlighted in red

### Sorting

- **Sort by Score Difference**: Default sort by score difference from high to low (word 1 stronger → word 2 stronger)
- **Sort by Frequency**: Can click table column headers to sort

### Quick Actions

Same as Word Sketch mode, each collocate provides a quick action menu.

## Visualization

The Visualization panel provides network graph visualization to help you intuitively understand grammatical collocation relationships of words.

### Network Graph

#### Chart Features

- **Node Types**:
  - **Center Node** (blue): Target word (Word Sketch) or two comparison words (Word Sketch Difference)
  - **Relation Node** (orange): Grammatical relation type
  - **Collocate Node** (green): Collocate

- **Links**:
  - Center node → Relation node: Indicates word has this grammatical relation
  - Relation node → Collocate node: Indicates collocates for this relation
  - Link thickness represents frequency or strength

#### Configuration Options

- **Relation Filter**: Select relations to display ("All" or specific relation)
- **Max Words per Relation**: Set number of collocates to display per relation (default: 10, range: 5-30)

#### Interactive Features

- **Drag Nodes**: Drag nodes to adjust positions
- **Zoom**: Use mouse wheel to zoom view
- **Click Nodes**: Click nodes to view detailed information
- **Legend**: Shows node type and color correspondence

#### Word Sketch Difference Special Display

In comparison mode:

- **Center Nodes**: Display two comparison words
- **Color Coding**: Collocate nodes use different colors based on score difference
  - Blue: Word 1's collocation is stronger
  - Red: Word 2's collocation is stronger
  - Gray: Similar collocation strength

### Export Features

Network graph supports export:

- **Export SVG**: Export as vector format, suitable for printing and editing
- **Export PNG**: Export as bitmap format, suitable for inserting into documents

Export buttons are located on the right side of the chart settings bar.

## logDice Score

### Overview

logDice is a statistical method for measuring word collocation strength, calculated based on Dice coefficient and frequency information.

### Score Range

- **Range**: Usually 0-14
- **High Score** (> 10): Very strong collocation, words frequently appear together
- **Medium Score** (5-10): Strong collocation
- **Low Score** (< 5): Weak collocation, may be accidental occurrence

### Score Interpretation

- **Higher Score**: Indicates stronger collocation between two words, more likely to be fixed collocation or idiomatic usage
- **Lower Score**: Indicates weaker collocation between two words, may be accidental occurrence

### Usage Tips

- Setting "Minimum Score" to 3-5 can filter out weak collocations, focusing only on strong collocations
- In comparison analysis, score difference greater than 2 usually indicates meaningful difference

## Usage Tips

### Efficient Analysis Workflow

1. **Select Corpus**: Choose appropriate corpus based on research goals
2. **Filter Texts**: Use tags or manual selection to focus on target texts
3. **Enter Word**: Enter word to analyze
4. **Select POS**: If word has multiple POS, select appropriate POS
5. **Set Parameters**: Adjust minimum frequency and minimum score to balance result count and relevance
6. **Run Analysis**: Click analysis button
7. **View Results**: View grammatical collocations in relation cards
8. **Deep Analysis**: Click collocates for further analysis
9. **Visualize**: Use network graph to intuitively understand collocation relationships

### Word Sketch Usage Tips

#### Analyzing Grammatical Behavior of Single Word
1. Select "Word Sketch" tab
2. Enter target word
3. Select appropriate POS
4. Run analysis
5. View collocates under various grammatical relations
6. Focus on high-scoring strong collocations

#### Discovering Fixed Collocations and Idiomatic Usage
1. Set higher minimum score (e.g., 5-7)
2. View high-scoring collocates
3. These are usually fixed collocations or idiomatic usage

#### Analyzing Grammatical Functions of Words
1. View collocates under different grammatical relations
2. Understand word usage in different grammatical positions
3. Discover typical grammatical patterns of words

### Word Sketch Difference Usage Tips

#### Comparing Usage Differences of Synonyms
1. Select "Word Sketch Difference" tab
2. Enter two synonyms
3. Select same POS
4. Run comparison analysis
5. View shared and unique collocations
6. Understand usage differences via score differences

#### Comparing Different POS of Same Root
1. Enter different POS forms of the same root
2. Select corresponding POS respectively
3. Run comparison analysis
4. Understand impact of POS conversion on collocations

#### Discovering Semantic Differences of Words
1. Compare two related words
2. View unique collocations to understand unique usage of words
3. View score differences of shared collocations to understand usage preferences

### Common Analysis Scenarios

#### Analyzing Typical Collocations of Verbs
1. Select "Word Sketch" mode
2. Enter target verb
3. Select "Verb" POS
4. Run analysis
5. View collocates under "Direct Object", "Subject" relations

#### Analyzing Modifiers of Nouns
1. Select "Word Sketch" mode
2. Enter target noun
3. Select "Noun" POS
4. Run analysis
5. View adjective collocates under "Modifier" relation

#### Comparing Usage of Near Synonyms
1. Select "Word Sketch Difference" mode
2. Enter two near synonyms (e.g., "big" and "large")
3. Select same POS
4. Run comparison analysis
5. View unique collocations and score differences

#### Analyzing Grammatical Variations of Words
1. Select "Word Sketch Difference" mode
2. Enter different forms of the same word (e.g., "go" and "went")
3. Select "Verb" POS
4. Run comparison analysis
5. Understand collocation differences of different forms

### Notes

- Word Sketch analysis is based on SpaCy dependency parsing annotation data; ensure texts have completed SpaCy annotation
- Analysis of large corpora may take time; please be patient
- If a word appears very few times in the corpus, it may not be possible to extract sufficient grammatical relations
- logDice scores are based on statistical calculations; high scores do not necessarily indicate semantic relevance
- Grammatical relation identification depends on accuracy of SpaCy's dependency parsing analysis
- Some grammatical relations may not be correctly identified due to annotation errors
- In comparison analysis, ensure both words have the same POS; otherwise comparison results may be inaccurate
- Color coding is for reference only; specific interpretation requires linguistic knowledge
- When exporting charts, if node count is high, it may take some time

# Bibliographic Visualization

## Overview

The Bibliographic Visualization module is used to manage and analyze academic literature data. It supports importing Refworks format literature data from Web of Science (WOS) and CNKI (China National Knowledge Infrastructure), and provides various visualization analysis functions, including collaboration networks, keyword co-occurrence, timezone views, and burst detection.

## Interface Layout

The Bibliographic Visualization module uses a top-level tab design:

- **Upload**: Create libraries and upload Refworks files
- **Libraries**: View and manage all libraries
- **Library Detail**: View entry lists, filtering, and details
- **Visualization**: Generate various visualization charts

## Library Management

### Creating a Library

Create a new library in the "Upload" tab:

1. **Library Name**: Enter the library name (required)
2. **Source Type**: Select the data source type
   - **Web of Science (WOS)**: For Refworks files exported from Web of Science
   - **CNKI (China National Knowledge Infrastructure)**: For Refworks files exported from CNKI
3. **Description**: Optional, add description for the library
4. Click "Create" button to create the library

**Notes**:
- Library name cannot be empty
- Source type cannot be changed after creation; ensure correct selection
- A library can only contain literature from one source type

### Viewing Library List

In the "Libraries" tab:

- **Card View**: Each library is displayed as a card
- **Statistics**:
  - Number of entries
  - Creation date
  - Source type label
- **Actions**:
  - **View**: Click "View" button to enter library detail
  - **Delete**: Click delete icon to delete library (will delete all entries)

### Library Detail

In the "Library Detail" tab:

- **Header Information**:
  - Library name
  - Source type label
  - Total entries
  - Year range (if available)
  - "Add More" button: Upload more literature to this library

- **Filter Panel**: Provides various filter conditions (see below)

- **Entry Table**:
  - **Columns**: Title, Authors, Year, Journal, Citations, Actions
  - **Pagination**: Supports pagination (10/25/50/100 entries per page)
  - **Actions**:
    - **View Details**: Click row or view button to view entry details
    - **Delete**: Delete a single entry

## Uploading Literature

### Upload Process

1. **Select Library**: In the "Upload" tab, ensure a library is selected or created
2. **Select File**:
   - Drag and drop file to upload area, or
   - Click upload area to select file
3. **File Requirements**:
   - File format: Refworks (.txt)
   - File size: Recommended not exceeding 50MB
4. **Upload**: Click "Upload" button to start upload
5. **View Results**: After upload completes, displays:
   - Number of successfully added entries
   - Number of skipped entries (if any)
   - Parse errors (if any)

### File Formats

The system supports two Refworks formats:

#### Web of Science (WOS) Format

WOS exported Refworks files typically contain fields such as:
- PT (Publication Type)
- AU (Author)
- AF (Author Full Name)
- TI (Title)
- SO (Source/Journal)
- PY (Publication Year)
- VL (Volume)
- IS (Issue)
- BP (Beginning Page)
- EP (Ending Page)
- DI (DOI)
- TC (Times Cited)
- etc.

#### CNKI Format

CNKI exported Refworks files typically contain fields such as:
- Title
- Author
- Institution
- Keywords
- Abstract
- Journal
- Year
- etc.

**Notes**:
- Ensure file format matches the source type selected when creating the library
- If format doesn't match, system will attempt to parse but may not correctly extract all information
- Recommend re-exporting from original data source to ensure correct format

## Filtering

In the "Library Detail" and "Visualization" tabs, you can use the filter panel to filter literature:

### Year Range

Use slider to select year range:

- **Minimum**: Earliest year in library
- **Maximum**: Latest year in library
- **Operation**: Drag slider ends to select start and end years

### Author Filter

- **Autocomplete**: Enter author name, system displays matching author list
- **Free Input**: Can also directly enter author name (supports partial matching)

### Institution Filter

- **Autocomplete**: Enter institution name, system displays matching institution list
- **Free Input**: Can also directly enter institution name (supports partial matching)

### Keyword Filter

- **Autocomplete**: Enter keyword, system displays matching keyword list
- **Free Input**: Can also directly enter keyword (supports partial matching)

### Journal Filter

- **Autocomplete**: Enter journal name, system displays matching journal list
- **Free Input**: Can also directly enter journal name (supports partial matching)

### Document Type Filter

- **Dropdown**: Select document type from dropdown list
- **Options**: Displayed based on actual document types in library

### Country Filter

- **Autocomplete**: Enter country name, system displays matching country list
- **Free Input**: Can also directly enter country name (supports partial matching)

### Clear Filters

- Click "Clear Filters" button to clear all filter conditions
- Filter panel displays "Active Filters" label when filters are active

## Visualization Analysis

In the "Visualization" tab, you can generate various visualization charts:

### Chart Types

The system provides three main chart types:

1. **Network**: Collaboration and co-occurrence networks
2. **Timezone**: Display literature distribution by time period
3. **Burst**: Detect burst trends for keywords or authors

### Network Graph

Network graphs are used to display collaboration and co-occurrence relationships using force-directed graph layout.

#### Network Types

Four network types can be selected:

1. **Keyword Co-occurrence Network**:
   - Displays co-occurrence relationships between keywords
   - Nodes: Keywords
   - Links: Keywords appear in the same literature
   - Node size: Keyword frequency
   - Link thickness: Co-occurrence strength

2. **Co-author Network**:
   - Displays collaboration relationships between authors
   - Nodes: Authors
   - Links: Authors co-publish literature
   - Node size: Number of publications by author
   - Link thickness: Collaboration strength

3. **Co-institution Network**:
   - Displays collaboration relationships between institutions
   - Nodes: Institutions
   - Links: Institutions co-publish literature
   - Node size: Number of publications by institution
   - Link thickness: Collaboration strength

4. **Co-country Network**:
   - Displays collaboration relationships between countries
   - Nodes: Countries
   - Links: Countries co-publish literature
   - Node size: Number of publications by country
   - Link thickness: Collaboration strength

#### Configuration Parameters

- **Min Weight**:
  - Range: 1-10 (default: 1)
  - Only display links with weight greater than or equal to this value
  - Used to filter weak relationships, highlight strong relationships

- **Max Nodes**:
  - Range: 10-300 (default: 100)
  - Limit number of nodes displayed
  - System prioritizes nodes with higher weights

- **Color Scheme**:
  - Select color scheme for chart
  - Options: Blue, Green, Purple, Orange, Red, Teal

#### Interactive Features

- **Drag Nodes**: Can drag nodes to adjust positions
- **Zoom**: Use mouse wheel to zoom view
- **Pan**: Hold left mouse button and drag to pan view
- **Hover Tooltip**: Mouse hover on nodes or links displays detailed information
- **Node Information**:
  - Node name
  - Node weight (frequency or count)
  - Number of connected nodes

### Timezone View

Timezone view displays literature distribution by time period, helping understand temporal evolution of research topics.

#### Configuration Parameters

- **Top N**:
  - Range: 5-50 (default: 10)
  - Display top N keywords or authors for each time period
  - Used to control number of items displayed

- **Time Slice**:
  - Default: 1 year
  - Can adjust time slice length
  - Longer slices smooth data, shorter slices show finer-grained temporal changes

- **Color Scheme**: Select color scheme for chart

#### Chart Features

- **Vertical Layout**: Each time period displayed as a row
- **Color Coding**: Use color intensity to represent frequency or importance
- **Hover Tooltip**: Mouse hover displays detailed information

### Burst Detection

Burst detection is used to identify burst trends of keywords or authors in specific time periods, similar to CiteSpace's burst detection function.

#### Burst Types

Two burst types can be selected:

1. **Keyword Burst**:
   - Detect keyword bursts in specific time periods
   - Help identify research hotspots and trend changes

2. **Author Burst**:
   - Detect author bursts in specific time periods
   - Help identify active researchers

#### Configuration Parameters

- **Burst Type**: Select "Keyword" or "Author"
- **Color Scheme**: Select color scheme for chart

#### Chart Features

- **Gantt Chart Style**: Use Gantt chart to display burst time periods
- **Gray Background**: Non-burst periods displayed in gray
- **Colored Bars**: Burst periods displayed as colored bars
- **Merged Display**: Multiple burst periods for same term merged into single row
- **Hover Tooltip**: Mouse hover displays burst details:
  - Burst start time
  - Burst end time
  - Burst strength
  - Frequency during burst period

#### Burst Strength

Burst strength indicates significance of burst:
- **High Strength**: Indicates very significant burst
- **Medium Strength**: Indicates moderate burst
- **Low Strength**: Indicates slight burst

### Filter Panel

In the visualization page, the filter panel is located above the chart:

- **Expand/Collapse**: Click filter panel header to expand or collapse filter options
- **Active Filters**: If filters are active, displays "Active Filters" label
- **Filter Conditions**: Same filtering functionality as library detail page

**Notes**:
- Filter conditions affect visualization results
- After modifying filter conditions, chart automatically updates
- Some filter conditions may result in no data, chart displays empty state

## Export Features

All visualization charts support export:

### Export SVG

- **Format**: SVG (vector graphics)
- **Advantages**: Scalable, suitable for printing and editing
- **Usage**: Insert into papers, reports, etc.

### Export PNG

- **Format**: PNG (bitmap)
- **Advantages**: Good compatibility, suitable for web display
- **Usage**: Insert into presentations, web pages, etc.

### Export Operation

1. Click export button on the right side of chart settings bar
2. Select export format (SVG or PNG)
3. File automatically downloads

**Notes**:
- When exporting SVG, if chart is complex, file may be large
- When exporting PNG, system uses high resolution (2x) to ensure clarity
- Exporting large charts may take some time

## Usage Tips

### Efficient Analysis Workflow

1. **Create Library**: Create library based on data source type
2. **Upload Literature**: Upload Refworks format literature files
3. **View Details**: View and filter literature in library detail
4. **Generate Visualization**: Switch to visualization tab to generate charts
5. **Adjust Parameters**: Adjust visualization parameters as needed
6. **Apply Filters**: Use filter panel to focus on specific literature
7. **Export Results**: Export charts for reports or papers

### Network Graph Usage Tips

#### Analyzing Collaboration
1. Select "Co-author Network" or "Co-institution Network"
2. Adjust "Min Weight" to filter weak relationships
3. Adjust "Max Nodes" to control display count
4. Observe network structure, identify core researchers and institutions

#### Analyzing Research Topics
1. Select "Keyword Co-occurrence Network"
2. Adjust parameters to highlight strong relationships
3. Observe keyword clusters, identify research topics
4. Combine with timezone view to understand topic evolution

#### Analyzing International Collaboration
1. Select "Co-country Network"
2. Observe collaboration patterns between countries
3. Identify international collaboration hotspot regions

### Timezone View Usage Tips

#### Understanding Research Trends
1. Adjust "Top N" to control number of items displayed
2. Observe changes in keywords or authors across different time periods
3. Identify rise and decline of research hotspots

#### Discovering Emerging Topics
1. Focus on new keywords appearing in recent time periods
2. Combine with burst detection to confirm emerging topics
3. Analyze development trajectory of emerging topics

### Burst Detection Usage Tips

#### Identifying Research Hotspots
1. Select "Keyword Burst"
2. View keywords with high burst strength
3. Analyze burst time periods, understand hotspot duration
4. Combine with timezone view to understand hotspot evolution

#### Discovering Active Researchers
1. Select "Author Burst"
2. View authors with high burst strength
3. Analyze burst time periods, understand active research periods
4. Combine with collaboration network to understand research teams

### Common Analysis Scenarios

#### Literature Review Preparation
1. Upload literature from related fields
2. Use keyword co-occurrence network to identify main research topics
3. Use timezone view to understand research development history
4. Use burst detection to identify latest research hotspots
5. Export charts for literature review

#### Research Team Analysis
1. Upload literature from team members
2. Use co-author network to analyze collaboration relationships
3. Use co-institution network to analyze institutional collaboration
4. Use timezone view to understand team research history
5. Use burst detection to identify team research hotspots

#### Field Trend Analysis
1. Upload literature from specific field
2. Use keyword co-occurrence network to identify research topics
3. Use timezone view to analyze topic evolution
4. Use burst detection to identify emerging trends
5. Combine with filtering to focus on specific time periods or topics

### Notes

- Bibliographic visualization is based on uploaded literature data; ensure data is complete and accurate
- Visualization of large libraries may take time; please be patient
- Network graphs may be slow when node count is high; recommend adjusting "Max Nodes"
- Filter conditions affect visualization results; ensure filter conditions are correct
- When exporting charts, if chart is complex, it may take some time
- Refworks file format must be correct; otherwise may not parse correctly
- Different data sources (WOS/CNKI) may have different fields; some visualizations may not apply to all data sources
- Burst detection algorithm is based on statistical methods; results are for reference only
- Network graph layout is automatically calculated; may vary slightly each refresh
- Timezone view time slice settings affect display granularity; recommend adjusting based on data volume

# Annotation Mode

## Overview

The Annotation Mode module is used for framework-based annotation of text and multimedia content. The module supports two annotation modes: **Text Annotation** and **Multimodal Annotation** (video/audio), helping researchers systematically annotate and analyze corpus data.

## Interface Layout

The Annotation Mode module uses a top-level tab design:

- **Text Annotation**: Annotate plain text
- **Multimodal Annotation**: Annotate video and audio
- **Annotation History**: View and manage saved annotation archives
- **Framework Manager**: Create and manage annotation frameworks
- **Inter-Coder Reliability**: Calculate annotation consistency between multiple coders

## Text Annotation

### Interface Layout

Text annotation uses a left-right split layout:

- **Left Panel** (adjustable width, default 400px):
  - **Framework Settings**: Select annotation framework
  - **Framework Tree Visualization**: Display framework hierarchy, click labels to select for annotation
  - **Selected Label Display**: Display currently selected label and its definition
  - **Corpus Selection**: Select corpus and text files
  - **Archive Management**: View, load, rename, delete annotation archives

- **Right Panel** (flexible width):
  - **Toolbar**: Export, syntax visualization, save, and other functions
  - **Text Annotation Area**: Display text by sentences, support text selection annotation
  - **Annotation Table**: Display detailed information of all annotations

### Framework Selection

1. **Select Framework**:
   - Select the annotation framework to use from the "Framework Settings" dropdown
   - Frameworks are organized by category, showing framework name and category
   - Click "Refresh Frameworks" button to reload framework list

2. **Framework Tree Visualization**:
   - Framework tree displays all labels in hierarchical structure
   - Click labels to select for annotation
   - Selected labels are highlighted
   - Label colors distinguish different label types

3. **Selected Label**:
   - After selecting a label, label information is displayed in the middle of the left panel
   - Shows label name and definition (if available)
   - Label color is applied to annotations

### Corpus and Text Selection

1. **Select Corpus**:
   - Select corpus from "Corpus Selection" dropdown
   - Only corpora containing text files will display text list

2. **Select Text**:
   - Select text file to annotate from text list
   - Click text filename to load text content
   - System automatically loads SpaCy annotation data (if available)

### Text Annotation

#### Sentence Display

Text is split by sentences, each sentence displayed on a single line:

- **Automatic Sentence Splitting**: Uses SpaCy sentence splitting results (if available), otherwise uses regex
- **Horizontal Scrolling**: Long sentences scroll horizontally, no line breaks
- **Overall Scrolling**: Entire text container can scroll vertically

#### Text Selection Annotation

1. **Select Text**:
   - Drag mouse in text to select text to annotate
   - Selected text is highlighted

2. **Create Annotation**:
   - After selecting text, if a label is selected, annotation is automatically created
   - If no label is selected, a prompt is displayed
   - Annotation is displayed as a label block directly below the selected text

3. **Label Block Display**:
   - **Precise Alignment**: Label block left and right boundaries precisely align with selected text boundaries
   - **Color Coding**: Label blocks use label colors
   - **Layered Display**: If multiple annotations overlap, larger labels are on top (closer to text), smaller labels below
   - **Click to Delete**: Click label block to delete annotation

#### Cross-Overlap Detection

System prohibits cross-overlap annotations, only allows complete containment or no overlap:

- **Complete Containment**: New annotation completely contained within existing annotation, or existing annotation completely contained within new annotation
- **No Overlap**: New annotation completely non-overlapping with existing annotations
- **Cross-Overlap**: If new annotation crosses with existing annotation (partial overlap but not complete containment), system rejects and displays warning

#### SpaCy Pre-Annotation

If text has completed SpaCy annotation, system automatically displays:

- **Part-of-Speech (POS)**: Can toggle display/hide
- **Named Entity Recognition (NER)**: Can toggle display/hide
- **Pre-annotation Information**: Display POS and NER information in annotation table

### Annotation Table

Annotation table displays detailed information of all annotations:

- **Columns**:
  - **Text**: Annotated text content
  - **Label**: Label name used for annotation
  - **Position**: Start and end positions of annotation in text
  - **POS**: Part-of-speech of annotated text (if available)
  - **NER**: Named entity of annotated text (if available)
  - **Remark**: Annotation remark (editable)
  - **Actions**: Delete button

- **Features**:
  - **Highlight Display**: When hovering over table row, corresponding annotation is highlighted in text
  - **Edit Remark**: Click remark column to edit remark information
  - **Delete Annotation**: Click delete button to delete annotation

### Syntax Visualization

System supports viewing sentence syntax structure:

1. **Open Syntax Visualization**:
   - Click "View Syntax Structure" button in toolbar
   - Only available when text has completed SpaCy annotation

2. **Syntax Types**:
   - **Constituency Syntax**: Uses benepar model to generate syntax tree (D3.js visualization)
   - **Dependency Syntax**: Uses SpaCy displacy to render dependency graph

3. **Switch Sentences**:
   - Use up/down arrow controls to switch between different sentences
   - Display current sentence position in text

### Auto-Annotation

System supports automatically generating annotations based on specific frameworks, reducing manual annotation workload. The auto-annotation button is located to the right of the "View Syntax Structure" button (green icon).

#### Supported Frameworks

Auto-annotation is only available when the following frameworks are loaded:

| Framework | Auto-Annotation Type | Description |
|-----------|---------------------|-------------|
| **MIPVU** | Metaphor Annotation | Auto-annotate with `indirect` (indirect metaphor) label |
| **Halliday-Theme** | Theme/Rheme Annotation | Auto-annotate `theme` and `rheme` |
| **Berry-Theme** | Theme/Rheme Annotation | Auto-annotate `theme` and `rheme` |

When other frameworks are loaded, the auto-annotation button will be disabled (shown in gray).

#### MIPVU Auto-Annotation

When the MIPVU framework is loaded, clicking the auto-annotation button will:

1. **Read MIPVU Annotation Data**: Get the MIPVU metaphor detection results for the text from corpus management
2. **Identify Metaphors**: Find all words with `is_metaphor=true`
3. **Create Annotations**: Create `indirect` (indirect metaphor) labels for each metaphor word

**Prerequisites**:
- Text must have completed MIPVU metaphor detection (done in Corpus Management)
- If no MIPVU data exists, it will display "MIPVU annotation data not found"

#### Theme/Rheme Auto-Annotation

When Halliday-Theme or Berry-Theme framework is loaded, clicking the auto-annotation button will:

1. **Analyze Sentence Structure**: Use SpaCy dependency parsing
2. **Identify Theme**: The portion from sentence start to the first topical theme (usually the subject)
3. **Identify Rheme**: The portion after the theme to sentence end
4. **Create Annotations**: Create `theme` and `rheme` labels for each sentence

**Theoretical Basis** (Systemic Functional Linguistics - SFL):
- **Theme**: The starting point of the clause, including textual theme (conjunctions), interpersonal theme (modal adjuncts), and topical theme (usually the subject)
- **Rheme**: The portion after the theme, containing the main information of the sentence

**Annotation Characteristics**:
- Phrase-level annotation, not word-by-word (e.g., "The Duke" is annotated as theme as a whole)
- Automatically skips existing annotations with the same position and label to avoid duplicates

**Prerequisites**:
- Text must have completed SpaCy annotation
- If no SpaCy data exists, it will display "SpaCy annotation data not found"

#### Usage Steps

1. **Select Text**: Select the text to annotate in the left panel
2. **Select Framework**: Select MIPVU, Halliday-Theme, or Berry-Theme framework
3. **Click Auto-Annotate**: Click the green auto-annotation button in the toolbar
4. **View Results**: System will display the number of annotations successfully added
5. **Manual Adjustment**: You can continue to manually add, modify, or delete annotations
6. **Save**: Click "Save" button to save the annotation archive

### Saving Annotations

1. **Open Save Dialog**:
   - Click "Save" button in toolbar
   - Only available when framework is selected and annotations exist

2. **Enter Coder Name**:
   - Coder name is optional
   - Used to identify different coders in inter-coder reliability analysis
   - If archive already exists, uses saved coder name

3. **Save**:
   - Click "Save" button to save annotations
   - System creates or updates annotation archive
   - Success message displayed after save

### Archive Management

In "Archives" section of left panel:

- **View Archives**: Display all annotation archives for current corpus
- **Load Archive**: Click archive name to load archive
- **Rename Archive**: Click edit icon to rename archive
- **Delete Archive**: Click delete icon to delete archive

Archive information includes:
- Text name
- Annotation count
- Save timestamp

### Export Features

System supports exporting annotation results as images:

1. **Export PNG**:
   - Click "Export PNG" button in toolbar
   - Export as PNG bitmap format
   - Suitable for inserting into documents and presentations

2. **Export SVG**:
   - Click "Export SVG" button in toolbar
   - Export as SVG vector format
   - Suitable for printing and editing

**Export Features**:
- Adaptive background ensures clear display on different backgrounds
- Automatic margin padding ensures edges are not cropped
- Long sentences displayed completely without truncation

## Multimodal Annotation

### Interface Layout

Multimodal annotation uses left-right split layout, similar to text annotation:

- **Left Panel**: Framework selection, framework tree, corpus selection, archive management
- **Right Panel**:
  - **Media Player**: Video or audio player
  - **Transcript Annotation Area**: Display transcript text, support text selection annotation
  - **Multi-Track Timeline**: Display YOLO tracks, transcript segments, user annotations, keyframes

### Media Selection

1. **Select Corpus**: Select corpus containing video or audio files
2. **Select Media**: Select video or audio file to annotate from media list
3. **Auto-Load**: After selecting media, system automatically loads:
   - Media file path
   - Transcript text (if available)
   - YOLO detection results (if available)
   - CLIP classification results (if available)

### Video Annotation

#### Video Playback Control

- **Play/Pause**: Control video playback
- **Time Jump**: -5s/+5s buttons for quick jumping
- **Frame Control**: Previous/Next frame buttons for precise control
- **Timeline**: Drag timeline to jump to specified position

#### Bounding Box Mode

1. **Enable Bounding Box Mode**:
   - Click "Bounding Box Mode" button to enable
   - Can draw bounding boxes on video frames

2. **Draw Bounding Box**:
   - Drag mouse on video frame to draw bounding box
   - Bounding boxes use video original coordinates for accuracy
   - Can adjust bounding box size and position

3. **Frame Tracking System**:
   - **Frame Interval Setting**: Set tracking frame interval
   - **Track to Previous/Next Frame**: Apply current box selection to previous or next frame
   - **Confirm Box Selection**: Confirm current frame box selection
   - **Save Sequence**: Save multi-frame box selection sequence

4. **Keyframe Interpolation**:
   - Set box selections for multiple keyframes
   - System automatically linearly interpolates to generate intermediate frame box selections
   - Reduces manual annotation workload

#### YOLO Overlay Display

If video has completed YOLO detection:

- **Real-time Display**: Real-time display of YOLO detection boxes during video playback
- **Coordinate Mapping**: Uses video original coordinates to ensure detection box positions are accurate
- **Multi-Object Tracking**: Display tracking trajectories of multiple objects

### Audio Annotation

#### Audio Playback Control

- **Play/Pause**: Control audio playback
- **Time Jump**: -5s/+5s buttons for quick jumping
- **Waveform Display**: Display audio waveform, support range selection

#### Transcript Annotation

- **Transcript Display**: Display audio transcript text (if available)
- **Text Selection Annotation**: Same as text annotation, supports text selection annotation
- **Time Alignment**: Annotations aligned with audio time

### Multi-Track Timeline

Multi-track timeline displays various information:

1. **YOLO Track**:
   - Display YOLO detected object tracking
   - Different objects use different colors

2. **Transcript Segment Track**:
   - Display transcript text time segments
   - Each segment displays corresponding text content

3. **User Annotation Track**:
   - Display user-created annotations
   - Annotations arranged in chronological order

4. **Keyframe Markers**:
   - Mark keyframe positions
   - Used for frame tracking and interpolation

#### DAW Paradigm Timeline

Timeline uses DAW (Digital Audio Workstation) paradigm playback needle behavior:

- **Start Movement**: Playback needle starts moving from current position
- **Center Scrolling**: When playback needle moves to view center, timeline starts scrolling
- **End Movement**: Playback needle stops when reaching timeline end

### Save and Export

Multimodal annotation save and export functions are the same as text annotation:

- **Save Annotations**: Save video/audio annotation archives
- **Export Features**: Export annotation results as images (if applicable)

## Annotation History

Annotation History page displays all saved annotation archives:

- **Archive List**: Display all archives organized by corpus
- **Archive Information**:
  - Text/Media name
  - Annotation count
  - Coder name
  - Save time
  - Framework used

- **Actions**:
  - **View Details**: View detailed annotation information
  - **Delete**: Delete archive

## Framework Manager

Framework Manager page is used to create and manage annotation frameworks:

- **Framework List**: Display all frameworks, organized by category
- **Create Framework**: Create new annotation framework
- **Edit Framework**: Edit existing framework structure and labels
- **Delete Framework**: Delete unnecessary frameworks
- **Framework Visualization**: Use D3.js tree visualization to display framework structure

## Inter-Coder Reliability

The Inter-Coder Reliability module is used to calculate annotation consistency between multiple coders, an essential tool for evaluating annotation quality in content analysis and qualitative research.

### Interface Layout

The Inter-Coder Reliability module uses a multi-panel layout:

- **Data Source Panel**: Select annotation archives or upload annotation files
- **Calculation Panel**: Select reliability coefficients to calculate and parameters
- **Results Panel**: Display calculation results and detailed statistics

### Data Sources

#### Select from Corpus Archives

1. Select target corpus
2. Select annotation archives to analyze (multiple selection supported)
3. System will automatically load archive contents

#### Upload Local Files

1. Click upload area to select JSON format annotation files
2. Drag and drop multiple files supported
3. System will validate file format and content consistency

### Index-Label Matrix Calculation

This software uses a character index-based binary matrix approach to calculate reliability coefficients.

#### Matrix Construction Principle

For each coder, the system constructs a `text length × number of labels` binary matrix:

- **Rows**: Each character position (index) in the text
- **Columns**: All labels in the annotation framework
- **Values**: 1 if a label covers that character position, 0 otherwise

#### Handling Overlapping Annotations

This method naturally supports overlapping annotations:

- **Multiple labels at same position**: The same character position can be annotated with multiple labels simultaneously (multiple 1s in that row)
- **Nested annotations**: When a larger range label contains a smaller one, both are recorded as 1 at corresponding positions
- **Different coders using different labels**: When different coders use different labels at the same position, each coder's matrix reflects their choice

#### Calculation Units

Reliability is calculated using "character index-label" pairs as basic units:

- **N Decisions**: Number of coders × text length × number of labels
- **Agreement**: All coders have the same value (all 1 or all 0) for a "character index-label" pair
- **Disagreement**: Coders have different values for a "character index-label" pair

### Supported Reliability Coefficients

#### 1. Average Pairwise Percent Agreement

**Use Case**: Quick assessment of overall agreement between two or more coders

**Calculation Principle**:

For each pair of coders i and j:

$$\text{Percent Agreement}(i,j) = \frac{\text{Number of agreements}}{\text{Total positions}}$$

Where:
- **Number of agreements**: Count of positions where both coders' matrices have the same value
- **Total positions**: Text length × Number of labels

**For multiple coders**:

$$\text{Average Pairwise Percent Agreement} = \frac{\sum(\text{all pairwise agreements})}{\text{Number of pairs}}$$

**Interpretation**:
- Range: 0 to 1 (usually displayed as percentage)
- Above 0.80: High agreement
- 0.60-0.80: Moderate agreement
- Below 0.60: Low agreement

**Limitation**: Does not account for chance agreement; may overestimate actual agreement when category distribution is uneven

---

#### 2. Fleiss' Kappa

**Use Case**: Evaluating agreement among three or more coders; extension of Cohen's Kappa for multiple coders

**Calculation Principle**:

$$\kappa = \frac{\bar{P} - \bar{P}_e}{1 - \bar{P}_e}$$

Where:

**Observed Agreement $\bar{P}$**:

For each "character index-label" pair i:

$$P_i = \frac{\sum n_{ij}^2 - n}{n \times (n-1)}$$

- $n_{ij}$: Number of coders selecting category j at position i
- n: Total number of coders

Then average:

$$\bar{P} = \frac{1}{N} \sum P_i$$

- N: Total positions (character index-label pairs)

**Expected Agreement $\bar{P}_e$**:

$$\bar{P}_e = \sum p_j^2$$

- $p_j$: Overall proportion of category j being selected

**Interpretation**:
- Range: -1 to 1
- 0.81-1.00: Almost Perfect agreement
- 0.61-0.80: Substantial agreement
- 0.41-0.60: Moderate agreement
- 0.21-0.40: Fair agreement
- 0.00-0.20: Slight agreement
- < 0: Below chance level

---

#### 3. Average Pairwise Cohen's Kappa

**Use Case**: Evaluating agreement between two coders, correcting for chance agreement

**Calculation Principle**:

For each pair of coders:

$$\kappa = \frac{P_o - P_e}{1 - P_e}$$

Where:

**Observed Agreement $P_o$**:

$$P_o = \frac{\text{Number of agreements}}{\text{Total positions}}$$

**Expected Agreement $P_e$**:

$$P_e = \sum (p_{1c} \times p_{2c})$$

- $p_{1c}$: Proportion of coder 1 selecting category c
- $p_{2c}$: Proportion of coder 2 selecting category c

**For multiple coders**:

$$\text{Average Pairwise Cohen's Kappa} = \frac{\sum(\text{all pairwise Kappa values})}{\text{Number of pairs}}$$

**Interpretation**: Same interpretation scale as Fleiss' Kappa

---

#### 4. Krippendorff's Alpha

**Use Case**: Most versatile reliability coefficient, supports multiple levels of measurement, can handle missing data

**Basic Principle**:

$$\alpha = 1 - \frac{D_o}{D_e}$$

Where:
- $D_o$: Observed disagreement
- $D_e$: Expected disagreement by chance

**Coincidence Matrix Calculation**:

The system first constructs a coincidence matrix O, where:
- o_ck: Number of times categories c and k co-occur (weighted count)

For each unit (character position), if m coders made annotations:
- Each pair of values (c, k) contributes 1/(m-1) to the coincidence matrix

**Key Statistics**:

- **Σc·o_cc (Observed Agreement)**: Sum of diagonal elements in coincidence matrix, representing degree to which coders chose the same category
- **Σc·n_c(n_c-1) (Expected Agreement Base)**: Expected value calculated from marginal frequencies

**Difference Function δ (by Level of Measurement)**:

Krippendorff's Alpha supports four levels of measurement, each using different difference functions:

**Nominal Level**:

$$\delta^2(c, k) = \begin{cases} 0 & \text{if } c = k \\ 1 & \text{if } c \neq k \end{cases}$$

Use for: Unordered categorical data (e.g., label types, gender)

**Ordinal Level**:

$$\delta^2(c, k) = \left[\sum_{g=c}^{k} n_g - \frac{n_c + n_k}{2}\right]^2$$

- $n_g$: Marginal frequency of category g
- Sum ranges from c to k (inclusive)

This function considers cumulative frequencies of intermediate categories, reflecting the concept of distance on an ordinal scale.

Use for: Ordered categorical data (e.g., Likert scales, ratings)

**Interval Level**:

$$\delta^2(c, k) = (c - k)^2$$

Use for: Equal-interval numerical data (e.g., temperature, dates)

**Ratio Level**:

$$\delta^2(c, k) = \left[\frac{c - k}{c + k}\right]^2$$

Use for: Numerical data with absolute zero (e.g., frequencies, distances)

**Final Calculation**:

$$D_o = \frac{1}{n} \sum_c \sum_k o_{ck} \times \delta^2(c, k)$$

$$D_e = \frac{1}{n(n-1)} \sum_c \sum_k n_c \times n_k \times \delta^2(c, k)$$

$$\alpha = 1 - \frac{D_o}{D_e}$$

**Interpretation**:
- Range: -1 to 1
- α ≥ 0.80: Acceptable reliability level
- 0.67 ≤ α < 0.80: Can be used with caution
- α < 0.67: Insufficient reliability

**Reference**: Krippendorff, K. (2004). Content Analysis: An Introduction to Its Methodology. Sage Publications.

---

#### 5. Recall & Precision

**Use Case**: When you have a "gold standard" (reference annotation), use this to evaluate other coders' accuracy against the standard

**Prerequisites**: You need to select one archive as the "Gold Standard" in the Data Source panel

**Calculation Principle**:

Calculates each coder's annotation accuracy based on the gold standard:

**Recall**:

$$\text{Recall} = \frac{\text{True Positives}}{\text{Total Gold Standard Annotations}}$$

- **True Positives**: Number of coder annotations that exactly match gold standard annotations
- **Total Gold Standard Annotations**: Total number of annotations in the gold standard
- Recall measures whether the coder "found all" annotations in the gold standard

**Precision**:

$$\text{Precision} = \frac{\text{True Positives}}{\text{Total Coder Annotations}}$$

- **True Positives**: Number of coder annotations that exactly match gold standard annotations
- **Total Coder Annotations**: Total number of annotations created by the coder
- Precision measures whether the coder's annotations are "correct"

**F1 Score**:

$$F_1 = \frac{2 \times \text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$$

- F1 score is the harmonic mean of precision and recall
- Comprehensively reflects the coder's annotation quality

**Matching Rules**:
- Annotation matching is based on: start position, end position, and label name
- All three must match exactly to count as a True Positive

**Results Display**:
- **By Coder**: Shows each coder's recall, precision, and F1 score
- **By Label**: Shows recall, precision, and F1 score for each label
- Coder names use the names saved in the archive files

**Interpretation**:
- Range: 0 to 1 (usually displayed as percentage)
- 0.90 and above: Excellent
- 0.80-0.90: Good
- 0.70-0.80: Fair
- 0.60-0.70: Moderate
- 0.50-0.60: Poor
- Below 0.50: Very Poor

**Usage Suggestions**:
- Use expert annotations as gold standard to evaluate training effectiveness for new coders
- Compare different coders' differences from gold standard when establishing annotation guidelines
- Use together with other reliability coefficients for comprehensive annotation quality assessment

### Gold Standard Selection

In the Data Source panel, after selecting multiple annotation archives, you can designate one as the "Gold Standard":

1. **Select Archives**: First select the annotation archives to analyze (at least 2)
2. **Designate Gold Standard**: Below the archive list, use radio buttons to select one archive as gold standard
3. **Enable Calculation**: In the Calculation panel, the "Recall & Precision" option will be automatically enabled

**Notes**:
- Recall and Precision can only be calculated after selecting a gold standard
- The gold standard should be created by an expert or experienced coder
- Other coders' annotations will be compared against the gold standard

### Results Panel

#### Data Overview

Displays basic statistics:
- **N Coders**: Number of coders participating in annotation
- **N Cases**: Text length (number of character indices)
- **N Decisions**: Total "coder-position-label" decisions
- **N Labels**: Total number of labels in annotation framework

#### Coefficient Cards

Each calculated coefficient is displayed as an independent card:

- **Coefficient Value**: Main reliability value
- **Observed Agreement**: Actually observed agreement level
- **Expected Agreement**: Expected agreement by chance
- **Pairwise Details** (Percent Agreement and Cohen's Kappa only): Detailed scores for each coder pair

#### Krippendorff's Alpha Details

- **Level of Measurement**: Shows the measurement level used (nominal/ordinal/interval/ratio)
- **N Decisions**: Total decisions used in calculation
- **Σc·o_cc**: Coincidence matrix statistic (observed agreement)
- **Σc·n_c(n_c-1)**: Marginal frequency statistic (expected agreement base)

### Report Export

#### HTML Report

- Includes all calculated coefficients and detailed statistics
- Formatted tables and interpretations
- Generation timestamp

#### CSV Report

- Tabular format of coefficient values and statistics
- Suitable for further data analysis

### Usage Recommendations

#### Coefficient Selection

- **Quick Assessment**: Use Percent Agreement
- **Two Coders**: Use Cohen's Kappa
- **Multiple Coders**: Use Fleiss' Kappa
- **Rigorous Assessment**: Use Krippendorff's Alpha

#### Level of Measurement Selection (Krippendorff's Alpha)

- **Label Classification**: Choose Nominal
- **Rating Scales**: Choose Ordinal
- **Numerical Scores**: Choose Interval or Ratio

#### Result Interpretation Notes

- Different coefficients may have different interpretation standards
- Results should be interpreted in context of research background and annotation task complexity
- Low agreement may indicate need to revise annotation guidelines or provide coder training

## Usage Tips

### Efficient Annotation Workflow

1. **Prepare Framework**: Create or select annotation framework in Framework Manager
2. **Select Corpus**: Select corpus to annotate
3. **Select Text/Media**: Select text or media file to annotate
4. **Select Label**: Click label in framework tree to select
5. **Perform Annotation**: Select text for annotation, or draw boxes in video
6. **View Table**: View and manage annotations in annotation table
7. **Save Archive**: Regularly save annotation progress
8. **Export Results**: Export annotation results for reports or papers

### Text Annotation Tips

#### Handling Long Texts
1. Use sentence display, each sentence on one line for easy viewing
2. Use overall scrolling to browse entire text
3. Use annotation table to quickly locate annotation positions

#### Handling Overlapping Annotations
1. Understand layering rules: larger labels on top, smaller labels below
2. Avoid cross-overlap: only allow complete containment or no overlap
3. Use annotation table to view layer relationships of all annotations

#### Utilizing SpaCy Pre-Annotation
1. Ensure text has completed SpaCy annotation
2. Use POS and NER information to assist annotation
3. View pre-annotation information in annotation table

### Multimodal Annotation Tips

#### Video Annotation
1. **Use Frame Tracking**: Use frame tracking system to reduce repetitive annotation
2. **Keyframe Interpolation**: Set keyframes, let system automatically interpolate
3. **Combine YOLO**: Use YOLO detection results to assist annotation
4. **Precise Control**: Use frame control buttons for precise video position control

#### Audio Annotation
1. **Combine Transcript**: Use transcript text for annotation
2. **Time Alignment**: Pay attention to alignment between annotations and audio time
3. **Waveform Assistance**: Use waveform display to assist positioning

### Common Annotation Scenarios

#### Text Sentiment Analysis
1. Create sentiment analysis framework (positive, negative, neutral, etc.)
2. Select text for annotation
3. Annotate emotional expressions in text
4. Save and export results

#### Video Object Detection
1. Select video file
2. Enable bounding box mode
3. Draw bounding boxes on keyframes
4. Use frame tracking to apply to other frames
5. Save annotation results

#### Multimodal Content Analysis
1. Select video or audio file
2. Combine transcript text and video/audio for annotation
3. Use multi-track timeline to view time alignment
4. Save multimodal annotation results

### Notes

- Before annotation, ensure framework is selected; otherwise cannot create annotations
- Text annotation prohibits cross-overlap, only allows complete containment or no overlap
- Multimodal annotation requires media files to be correctly uploaded and processed
- When saving annotations, coder name is saved for subsequent reliability analysis
- When exporting images, if text is very long, may take some time
- Syntax visualization requires text to have completed SpaCy annotation
- Video annotation frame tracking function can greatly improve annotation efficiency
- Annotation archives are bound to corpus; switching corpus switches archive list
- Deleting archive permanently deletes annotation data; please be cautious
- Once framework is created, modifying framework structure may affect existing annotations

# Topic Modeling

## Overview

The Topic Modeling module provides four topic modeling methods: **BERTopic**, **LDA**, **LSA**, and **NMF**, helping researchers automatically discover and extract topics from text corpora. Each method has its characteristics and applicable scenarios, and users can choose the appropriate method based on research needs.

## Interface Layout

The Topic Modeling module uses a top-level tab design:

- **BERTopic**: Topic modeling based on SBERT embeddings and clustering
- **LDA**: Latent Dirichlet Allocation topic modeling
- **LSA**: Latent Semantic Analysis topic modeling
- **NMF**: Non-negative Matrix Factorization topic modeling

Each tab uses a left-right split layout:

- **Left Panel** (450px): Configuration panel containing corpus selection, preprocessing, parameter configuration, etc.
- **Right Panel** (flexible width): Results display area with two tabs
  - **Analysis Results**: Display topic cards, topic tables, statistics
  - **Visualization**: Provide various D3.js visualization charts

## BERTopic

### Overview

BERTopic is a topic modeling method based on BERT embeddings and clustering, using SBERT (Sentence-BERT) models to generate text embeddings, then discovering topics through dimensionality reduction and clustering algorithms.

### Workflow

BERTopic workflow includes the following steps:

1. **Preprocessing**: Chunk and preprocess text
2. **Embedding**: Generate text embedding vectors using SBERT model
3. **Dimensionality Reduction**: Reduce embedding dimensions using UMAP or PCA
4. **Clustering**: Perform clustering using HDBSCAN, BIRCH, or K-Means
5. **Topic Representation**: Extract topic keywords using c-TF-IDF or other methods
6. **Topic Naming**: Optionally use Ollama to generate topic names

### Corpus Selection

Same as other analysis modules, supports three text selection modes:
- **All Texts**: Analyze all texts in the corpus
- **Filter by Tags**: Filter texts by tags
- **Manual Selection**: Manually select specific texts

### Preprocessing Configuration

The preprocessing panel is used to configure text chunking and preprocessing options:

#### Chunking Configuration

- **Chunking Method**:
  - **By Sentence**: Chunk by sentence boundaries
  - **By Character Count**: Chunk by character count
  - **By Token Count**: Chunk by token count (recommended)

- **Max Tokens**:
  - Range: 100-512 (default: 512)
  - Controls maximum token count per chunk
  - Sentences exceeding limit will be skipped or truncated

- **Overlap Tokens**:
  - Range: 0-100 (default: 0)
  - Sets overlap token count between adjacent chunks
  - Helps maintain context continuity

- **Min Chunk Size**:
  - Range: 1-100 (default: 1)
  - Sets minimum token count for chunks
  - Chunks smaller than this value will be discarded

#### Preprocessing Preview

- **Preview Function**: Click "Preview Preprocessing" button to view preprocessing results
- **Preview Content**:
  - Display original and processed text for first 10 chunks
  - Display token count and word count statistics
  - Display whether SpaCy annotation was used

**Notes**:
- If sentence exceeds token limit, error message will be displayed
- If chunk exceeds token limit, recommend reducing max tokens setting
- Preprocessing preview helps understand text processing effects

### Embedding Configuration

The embedding panel is used to generate and manage text embeddings:

#### Generate Embedding

1. **Click "Generate Embedding" Button**:
   - System uses SBERT model (paraphrase-multilingual-MiniLM-L12-v2) to generate text embeddings
   - Embedding process may take time depending on text count

2. **Embedding Information**:
   - **Model Name**: Display SBERT model used
   - **Embedding Dimension**: Display embedding vector dimension (usually 384)
   - **Document Count**: Display number of documents processed

#### Embedding File Management

- **Embedding List**: Display all embedding files for current corpus
- **Embedding Information**:
  - Embedding ID
  - Creation time
  - Document count
  - Preprocessing configuration summary

- **Actions**:
  - **Select Embedding**: Click embedding file to select for analysis
  - **Rename Embedding**: Click edit icon to rename embedding file
  - **Delete Embedding**: Click delete icon to delete embedding file

**Notes**:
- Embedding files are bound to corpus and preprocessing configuration
- If preprocessing configuration changes, need to regenerate embeddings
- Embedding files can be reused to avoid repeated computation

### Dynamic Topic Analysis

Dynamic topic analysis is used to analyze topic changes over time:

#### Configuration Options

- **Enable Dynamic Topics**: Check to enable dynamic topic analysis
- **Date Format**:
  - **Year Only**: Use only year information
  - **Full Date**: Use complete date information

- **Number of Time Periods**:
  - Range: 2-50 (default: auto)
  - Set number of time periods
  - If set to auto, system automatically determines based on data

- **Evolution Tuning**: Whether to adjust topic evolution
- **Global Tuning**: Whether to perform global adjustment

**Notes**:
- Dynamic topic analysis requires texts to contain date metadata
- Date format must be correct; otherwise analysis may fail
- Number of time periods affects analysis granularity

### Analysis Configuration

The analysis panel is used to configure BERTopic analysis parameters:

#### Dimensionality Reduction Configuration

- **Reduction Method**:
  - **UMAP**: Uniform Manifold Approximation and Projection (recommended)
  - **PCA**: Principal Component Analysis

- **UMAP Parameters**:
  - **Neighbors (n_neighbors)**: Range 2-100 (default: 15)
  - **Components (n_components)**: Range 2-10 (default: 5)
  - **Min Distance (min_dist)**: Range 0.0-1.0 (default: 0.1)
  - **Distance Metric (metric)**: cosine, euclidean, etc. (default: cosine)
  - **Random State (random_state)**: For result reproducibility

- **PCA Parameters**:
  - **Components (n_components)**: Range 2-10 (default: 5)

#### Clustering Configuration

- **Clustering Method**:
  - **HDBSCAN**: Density-based hierarchical clustering (recommended)
  - **BIRCH**: Balanced Iterative Reducing and Clustering
  - **K-Means**: K-means clustering

- **HDBSCAN Parameters**:
  - **Min Cluster Size (min_cluster_size)**: Range 2-50 (default: 5)
  - **Min Samples (min_samples)**: Range 1-50 (default: auto)
  - **Distance Metric (metric)**: euclidean, manhattan, etc. (default: euclidean)
  - **Cluster Selection Method (cluster_selection_method)**: eom, leaf (default: eom)
  - **Allow Single Cluster (allow_single_cluster)**: Whether to allow all documents in one cluster

- **BIRCH Parameters**:
  - **Threshold (threshold)**: Range 0.1-2.0 (default: 0.5)
  - **Branching Factor (branching_factor)**: Range 2-100 (default: 50)
  - **Number of Clusters (n_clusters)**: Range 2-100 (default: auto)

- **K-Means Parameters**:
  - **Number of Clusters (n_clusters)**: Range 2-100 (default: 5)
  - **Initialization Method (init)**: k-means++, random (default: k-means++)
  - **Max Iterations (max_iter)**: Range 10-1000 (default: 300)

#### Vectorizer Configuration

- **Vectorizer Type**:
  - **CountVectorizer**: Term frequency vectorizer (default)
  - **TfidfVectorizer**: TF-IDF vectorizer

- **Common Parameters**:
  - **Min Document Frequency (min_df)**: Range 0.0-1.0 or 1-100 (default: 1)
  - **Max Document Frequency (max_df)**: Range 0.0-1.0 (default: 1.0)
  - **N-gram Range (ngram_range)**: 1-1, 1-2, 2-2, etc. (default: 1-1)
  - **Remove Stopwords**: Whether to remove stopwords (default: yes)

#### Topic Representation Models

- **c-TF-IDF**: Default method, TF-IDF-based topic representation
- **KeyBERTInspired**: Keyword extraction based on KeyBERT
  - **Top N Words**: Range 5-20 (default: 10)
  - **Representative Documents**: Range 1-20 (default: 5)
  - **Sample Count**: Range 100-1000 (default: 500)
  - **Candidate Words**: Range 50-200 (default: 100)

- **MaximalMarginalRelevance (MMR)**: Maximum Marginal Relevance, optimizes diversity
  - **Diversity**: Range 0.0-1.0 (default: 0.3)
  - **Top N Words**: Range 5-20 (default: 10)

- **PartOfSpeech**: POS-based topic representation (only supports lg models)
  - **Top N Words**: Range 5-20 (default: 10)
  - **POS Patterns**: e.g., [['NOUN'], ['ADJ', 'NOUN']]

#### Outlier Handling

- **Enable Outlier Handling**: Whether to handle outlier documents
- **Handling Strategy**:
  - **distributions**: Distribution-based strategy
  - **probabilities**: Probability-based strategy
  - **c-tf-idf**: c-TF-IDF-based strategy
  - **embeddings**: Embedding-based strategy

- **Threshold**: Range 0.0-1.0 (default: 0.0)
- **Outlier Estimation**:
  - Click "Estimate Outliers" button to estimate outlier count after processing
  - Need to run analysis first before estimation
  - Estimation results show current and estimated outlier counts

### Running Analysis

After configuration, click "Start Analysis" button:

1. System displays loading progress
2. After analysis completes, results automatically appear in right panel
3. If errors occur, error messages are displayed in configuration panel

**Notes**:
- Analysis process may take time depending on text count and parameter settings
- Large corpus analysis may take minutes or longer
- Recommend testing parameter settings on small-scale data first

### Analysis Results

#### Statistics Summary

Top of results displays statistics summary:

- **Topic Count**: Number of topics identified
- **Document Count**: Total number of documents analyzed
- **Outlier Count**: Number of documents marked as outliers
- **Average Topic Probability**: Average probability of documents belonging to topics

#### Topic Cards

Each topic is displayed as a card:

- **Topic ID**: Topic number (-1 indicates outliers)
- **Topic Name**: Topic name (can be customized or generated using Ollama)
- **Document Count**: Number of documents belonging to this topic
- **Keywords**: Topic keywords and their weights
- **Actions**:
  - **Edit Label**: Customize topic name
  - **Generate Name**: Generate topic name using Ollama (requires Ollama connection)
  - **View Documents**: View documents belonging to this topic
  - **Merge Topics**: Select multiple topics to merge

#### Topic Table

Topic table displays detailed information of all topics:

- **Columns**:
  - **Topic ID**: Topic number
  - **Topic Name**: Topic name
  - **Document Count**: Number of documents belonging to this topic
  - **Keywords**: Topic keywords (configurable display count, 1-20)

- **Features**:
  - **Sorting**: Can sort by document count
  - **Export CSV**: Export topic data as CSV file
  - **Keyword Count Configuration**: Set number of keywords displayed in table

#### Topic Operations

- **Generate Topic Names**:
  - Click "Generate Topic Names" button
  - Requires Ollama service connection
  - System generates names for all topics

- **Merge Topics**:
  - Select multiple topics
  - Click "Merge Topics" button
  - System merges selected topics

- **Edit Label**:
  - Click edit icon in topic card or table
  - Enter custom label
  - After saving, label is applied to visualizations and exports

### Visualization

The visualization panel provides various D3.js visualization charts:

#### Topic Word Bar Chart (Barchart)

- **Features**: Horizontal bar chart displaying keywords and their weights for each topic
- **Configuration Parameters**:
  - **Top N Topics**: Display top N topics (default: 8)
  - **Words per Topic**: Number of keywords displayed per topic (default: 5)
  - **Use Custom Labels**: Whether to use custom topic labels

#### Document Scatter Plot (Documents)

- **Features**: Document distribution plot after UMAP dimensionality reduction, showing document positions in topic space
- **Configuration Parameters**:
  - **Hide Document Hover**: Whether to hide document hover tooltips
  - **Sample Size**: Number of documents displayed (default: 2000)
  - **Use Custom Labels**: Whether to use custom topic labels

- **Interactive Features**:
  - **Click Legend**: Toggle topic display/hide
  - **Hover Documents**: Display document information
  - **Outlier Display**: Outlier documents displayed in gray

#### Similarity Heatmap (Heatmap)

- **Features**: Topic similarity matrix showing similarity between topics
- **Configuration Parameters**:
  - **Top N Topics**: Display top N topics
  - **Number of Clusters**: Cluster topics for display
  - **Use Custom Labels**: Whether to use custom topic labels

#### Term Rank (Term Rank)

- **Features**: Word weight decay line chart showing word weight rankings for each topic
- **Configuration Parameters**:
  - **Log Scale**: Whether to use log scale
  - **Word Count**: Number of words displayed (default: 30)
  - **Use Custom Labels**: Whether to use custom topic labels

- **Interactive Features**:
  - **Hover Topic**: Highlight this topic, fade others
  - **Click Legend**: Toggle topic display/hide

#### Topics over Time (Topics over Time)

- **Features**: Line chart showing topic frequency changes over time (requires dynamic topics enabled)
- **Configuration Parameters**:
  - **Top N Topics**: Display top N topics
  - **Normalize Frequency**: Whether to normalize frequency
  - **Use Custom Labels**: Whether to use custom topic labels

- **Interactive Features**:
  - **Click Legend**: Toggle topic display/hide
  - **Hover Data Points**: Display detailed time frequency information

#### Export Features

All visualization charts support export:

- **Export SVG**: Export as vector format, suitable for printing and editing
- **Export PNG**: Export as bitmap format, suitable for inserting into documents

## LDA

### Overview

LDA (Latent Dirichlet Allocation) is a probability-based topic modeling method that assumes documents are generated from a mixture of multiple topics, with each topic represented by a distribution of words.

### Workflow

LDA workflow includes the following steps:

1. **Preprocessing**: Tokenize text, POS filtering, stopword removal, etc.
2. **Build Document-Word Matrix**: Convert text to document-term frequency matrix
3. **Train LDA Model**: Train LDA model using Gensim or Scikit-learn
4. **Extract Topics**: Extract topics and keywords from trained model
5. **Dynamic Topic Analysis** (optional): Analyze topic changes over time

### Corpus Selection

Same as other analysis modules, supports three text selection modes.

### Preprocessing Configuration

LDA preprocessing panel is used to configure text preprocessing options:

#### Language-Aware Preprocessing

- **Chinese**: Use jieba tokenization
- **English**: Use SpaCy tokenization

#### POS Filtering

- **POS Filtering Mode**:
  - **Keep Mode**: Only keep selected POS
  - **Filter Mode**: Filter out selected POS

- **POS Options**:
  - **SpaCy Universal POS**: NOUN, VERB, ADJ, ADV, etc.
  - Supports multiple selection

#### Other Preprocessing Options

- **Remove Stopwords**: Whether to remove stopwords
- **Lemmatization**: Whether to perform lemmatization
- **Lowercase**: Whether to convert to lowercase
- **Min Word Length**: Set minimum word length

#### Preprocessing Preview

- **Preview Function**: Click "Preview Preprocessing" button to view preprocessing results
- **Preview Content**:
  - Display original and processed text
  - Display word count statistics
  - Display whether SpaCy annotation was used

### Dynamic Topic Analysis

LDA supports dynamic topic analysis for analyzing topic changes over time:

#### Configuration Options

- **Enable Dynamic Topics**: Check to enable dynamic topic analysis
- **Date Format**:
  - **Year Only**: Use only year information
  - **Full Date**: Use complete date information

- **Number of Time Periods (nr_bins)**:
  - Range: 2-50 (default: auto)
  - Set number of time periods

- **Evolution Tuning (evolution_tuning)**: Whether to adjust topic evolution
- **Global Tuning (global_tuning)**: Whether to perform global adjustment

### LDA Parameter Configuration

#### Basic Parameters

- **Number of Topics (num_topics)**: Range 2-100 (default: 5)
- **Number of Keywords (num_keywords)**: Range 5-50 (default: 10)

#### Engine Selection

- **Gensim**: Use Gensim library (recommended, supports more features)
- **Scikit-learn**: Use Scikit-learn library

#### Alpha Parameter (Prior for Topic Distribution)

- **Mode**:
  - **symmetric**: Symmetric distribution (all topics have equal weights)
  - **asymmetric**: Asymmetric distribution (topic weights can differ)
  - **auto**: Automatic selection
  - **custom**: Custom distribution

- **Custom Alpha**:
  - Click "Custom" to set Alpha value for each topic
  - Use sliders to adjust weight for each topic
  - Can reset to uniform distribution

#### Eta Parameter (Prior for Word Distribution)

- **Mode**:
  - **symmetric**: Symmetric distribution
  - **auto**: Automatic selection

#### Iteration Parameters

- **Iterations**: Range 10-1000 (default: 50)
- **Update Frequency (update_every)**: Range 1-100 (default: 0, means no update)
- **Evaluation Frequency (eval_every)**: Range 1-100 (default: 10)

#### Random Seed

- **Random State (random_state)**: For result reproducibility

### Model Evaluation Metrics

LDA provides various evaluation metrics:

- **Perplexity**: Measures model fit to data, lower is better
- **Coherence**: Measures semantic consistency of topics, higher is better
- **Log Likelihood**: Model likelihood value

### Topic Number Optimization

LDA supports topic number optimization:

1. **Open Optimization Dialog**: Click "Optimize Topic Number" button
2. **Set Range**:
   - **Min Topics**: Range 2-20 (default: 2)
   - **Max Topics**: Range 2-50 (default: 20)
   - **Step Size**: Range 1-10 (default: 2)

3. **Run Optimization**:
   - System tests different topic numbers within specified range
   - Calculates coherence score for each topic number
   - Displays coherence curve chart

4. **Select Optimal Topic Number**:
   - View coherence curve
   - Select topic number with highest coherence
   - Apply to parameter configuration

### Running Analysis

After configuration, click "Start Analysis" button to run LDA analysis.

### Analysis Results

#### Statistics Summary

- **Topic Count**: Number of topics identified
- **Document Count**: Total number of documents analyzed
- **Evaluation Metrics**: Perplexity, coherence, log likelihood

#### Topic Cards and Table

Similar to BERTopic, displays topic keywords, document counts, etc.

#### Dynamic Topic Results

If dynamic topic analysis is enabled, displays:

- **Topic Time Evolution Line Chart**: Shows topic frequency changes over time
- **Topic Similarity Heatmap**: Shows similarity between topics in different time periods
- **Topic Evolution Sankey Chart**: Shows topic flow between different time periods

### Visualization

LDA visualization panel provides various charts:

- **Topic Word Bar Chart**: Displays keywords and their weights for each topic
- **Topic Distribution Pie Chart**: Displays document distribution of topics
- **Document Distribution Chart**: Displays topic distribution of documents
- **Topic Time Evolution Chart** (if dynamic topics enabled): Shows topic changes over time
- **Topic Similarity Heatmap** (if dynamic topics enabled): Shows topic similarity
- **Topic Evolution Sankey Chart** (if dynamic topics enabled): Shows topic flow

## LSA

### Overview

LSA (Latent Semantic Analysis) is a matrix factorization-based topic modeling method that uses Singular Value Decomposition (SVD) to discover latent semantic relationships between documents and words.

### Workflow

LSA workflow includes the following steps:

1. **Preprocessing**: Tokenize text, POS filtering, stopword removal, etc.
2. **Build TF-IDF Matrix**: Convert text to TF-IDF document-word matrix
3. **SVD Decomposition**: Perform singular value decomposition using TruncatedSVD
4. **Extract Topics**: Extract topics and keywords from decomposition results

### Corpus Selection

Same as other analysis modules, supports three text selection modes.

### Preprocessing Configuration

LSA preprocessing configuration is the same as LDA, including language-aware preprocessing, POS filtering, etc.

### LSA Parameter Configuration

#### Basic Parameters

- **Number of Topics (num_topics)**: Range 2-100 (default: 5)
- **Number of Keywords (num_keywords)**: Range 5-50 (default: 10)

#### SVD Algorithm

- **Algorithm Type**:
  - **arpack**: Use ARPACK solver (recommended)
  - **randomized**: Use randomized algorithm (suitable for large-scale data)

#### Advanced Parameters

- **Max Features (n_components)**: Range 2-1000 (default: auto)
- **Iterations (n_iter)**: Range 1-100 (default: 5)
- **Convergence Tolerance (tol)**: Range 0.0-1.0 (default: 0.0)
- **Random State (random_state)**: For result reproducibility

### Model Evaluation Metrics

LSA provides the following evaluation metrics:

- **Explained Variance Ratio**: Variance proportion explained by each topic
- **Cumulative Variance**: Cumulative explained variance proportion
- **Singular Value Sum**: Sum of all singular values

### Topic Number Optimization

LSA supports topic number optimization:

1. **Open Optimization Dialog**: Click "Optimize Topic Number" button
2. **Set Range**: Set min, max topic numbers and step size
3. **Run Optimization**:
   - System tests different topic numbers within specified range
   - Calculates explained variance for each topic number
   - Displays explained variance curve chart

4. **Select Optimal Topic Number**:
   - View explained variance curve
   - Select topic number with higher explained variance (usually choose curve inflection point)
   - Apply to parameter configuration

### Running Analysis

After configuration, click "Start Analysis" button to run LSA analysis.

### Analysis Results

#### Statistics Summary

- **Topic Count**: Number of topics identified
- **Document Count**: Total number of documents analyzed
- **Evaluation Metrics**: Explained variance ratio, cumulative variance, singular value sum

#### Topic Cards and Table

Similar to BERTopic, displays topic keywords, document counts, etc.

### Visualization

LSA visualization panel provides various charts:

- **Topic Word Bar Chart**: Displays keywords and their weights for each topic
- **Variance Chart**: Displays explained variance for each topic
- **Document Distribution Chart**: Displays topic distribution of documents

## NMF

### Overview

NMF (Non-negative Matrix Factorization) is a matrix factorization-based topic modeling method that decomposes document-word matrix into two non-negative matrices representing document-topic distribution and topic-word distribution respectively.

### Workflow

NMF workflow includes the following steps:

1. **Preprocessing**: Tokenize text, POS filtering, stopword removal, etc.
2. **Build TF-IDF Matrix**: Convert text to TF-IDF document-word matrix
3. **NMF Decomposition**: Perform non-negative matrix factorization using NMF
4. **Extract Topics**: Extract topics and keywords from decomposition results

### Corpus Selection

Same as other analysis modules, supports three text selection modes.

### Preprocessing Configuration

NMF preprocessing configuration is the same as LDA, including language-aware preprocessing, POS filtering, etc.

### NMF Parameter Configuration

#### Basic Parameters

- **Number of Topics (num_topics)**: Range 2-100 (default: 5)
- **Number of Keywords (num_keywords)**: Range 5-50 (default: 10)

#### Initialization Method

- **NNDSVD**: Non-negative Double Singular Value Decomposition (recommended)
- **NNDSVDA**: NNDSVD variant A
- **NNDSVDAR**: NNDSVD variant AR
- **Random**: Random initialization

#### Solver

- **cd**: Coordinate Descent (recommended)
- **mu**: Multiplicative Update

#### Advanced Parameters

- **Max Iterations (max_iter)**: Range 10-1000 (default: 200)
- **Convergence Tolerance (tol)**: Range 0.0-1.0 (default: 1e-4)
- **Alpha_W**: Regularization parameter for W matrix (range: 0.0-1.0, default: 0.0)
- **Alpha_H**: Regularization parameter for H matrix (range: 0.0-1.0, default: 0.0)
- **L1 Ratio (l1_ratio)**: Proportion of L1 regularization (range: 0.0-1.0, default: 0.0)
- **Random State (random_state)**: For result reproducibility

#### Solver-Specific Parameters

- **MU Solver**:
  - **Beta Loss (beta_loss)**: frobenius, kullback-leibler, etc. (default: frobenius)

- **CD Solver**:
  - **Shuffle**: Whether to shuffle data in each iteration

### Model Evaluation Metrics

NMF provides the following evaluation metrics:

- **Reconstruction Error**: Matrix reconstruction error, lower is better
- **Sparsity**: Sparsity degree of matrix
- **Iterations**: Actual number of iterations

### Topic Number Optimization

NMF supports topic number optimization:

1. **Open Optimization Dialog**: Click "Optimize Topic Number" button
2. **Set Range**: Set min, max topic numbers and step size
3. **Run Optimization**:
   - System tests different topic numbers within specified range
   - Calculates reconstruction error for each topic number
   - Displays reconstruction error curve chart

4. **Select Optimal Topic Number**:
   - View reconstruction error curve
   - Select topic number with lower reconstruction error (usually choose curve inflection point)
   - Apply to parameter configuration

### Running Analysis

After configuration, click "Start Analysis" button to run NMF analysis.

### Analysis Results

#### Statistics Summary

- **Topic Count**: Number of topics identified
- **Document Count**: Total number of documents analyzed
- **Evaluation Metrics**: Reconstruction error, sparsity, iterations

#### Topic Cards and Table

Similar to BERTopic, displays topic keywords, document counts, etc.

### Visualization

NMF visualization panel provides various charts:

- **Topic Word Bar Chart**: Displays keywords and their weights for each topic
- **Topic Distribution Pie Chart**: Displays document distribution of topics
- **Document Distribution Chart**: Displays topic distribution of documents

## Usage Tips

### Method Selection Recommendations

#### Scenarios for Choosing BERTopic

- Scenarios requiring semantic similarity
- Large text count, need to automatically determine topic number
- Need to process multilingual text
- Need flexible topic representation methods

#### Scenarios for Choosing LDA

- Scenarios requiring probability interpretation
- Need to analyze topic time evolution
- Need to control topic prior distribution
- Need detailed model evaluation metrics

#### Scenarios for Choosing LSA

- Need fast analysis
- Very large text count
- Need dimensionality reduction and semantic analysis
- Don't need probability interpretation

#### Scenarios for Choosing NMF

- Scenarios requiring non-negative factorization
- Need sparse topic representation
- Need fast analysis
- Large text count

### Parameter Tuning Recommendations

#### BERTopic Parameter Tuning

1. **Dimensionality Reduction Parameters**:
   - If topics overlap too much, can increase `n_components`
   - If topics are not separated enough, can adjust `min_dist`

2. **Clustering Parameters**:
   - If too many topics, can increase `min_cluster_size`
   - If too few topics, can decrease `min_cluster_size`

3. **Vectorizer Parameters**:
   - If keywords are not relevant enough, can adjust `min_df` and `max_df`
   - If need phrases, can set `ngram_range` to 1-2

#### LDA Parameter Tuning

1. **Topic Number**:
   - Use topic number optimization to find optimal topic number
   - View coherence curve to select inflection point

2. **Alpha and Eta**:
   - Symmetric distribution suitable for scenarios with similar topic counts
   - Asymmetric distribution suitable for scenarios with large topic count differences

3. **Iterations**:
   - Increasing iterations improves model quality but increases computation time
   - Usually 50-100 iterations are sufficient

#### LSA Parameter Tuning

1. **Topic Number**:
   - Use topic number optimization to find optimal topic number
   - View explained variance curve to select inflection point

2. **SVD Algorithm**:
   - Use `arpack` for small-scale data
   - Use `randomized` for large-scale data

#### NMF Parameter Tuning

1. **Topic Number**:
   - Use topic number optimization to find optimal topic number
   - View reconstruction error curve to select inflection point

2. **Initialization Method**:
   - Recommend using `NNDSVD` or `NNDSVDA`
   - `Random` initialization may produce unstable results

3. **Regularization Parameters**:
   - Increasing `Alpha_W` and `Alpha_H` increases sparsity
   - Adjusting `l1_ratio` controls L1/L2 regularization proportion

### Common Analysis Scenarios

#### Discovering Research Topics

1. Choose BERTopic or LDA
2. Use topic number optimization to determine topic number
3. View topic keywords to understand topic content
4. Use visualization charts to analyze topic distribution

#### Analyzing Topic Evolution

1. Choose LDA and enable dynamic topic analysis
2. Configure date format and number of time periods
3. View topic time evolution chart
4. Analyze topic similarity heatmap and evolution Sankey chart

#### Document Classification

1. Choose BERTopic or NMF
2. Set appropriate topic number
3. View document topic distribution
4. Classify documents based on topic distribution

#### Keyword Extraction

1. Choose any method
2. View topic keywords
3. Use topic representation models to optimize keywords
4. Export keywords for other analyses

### Notes

- Topic modeling is exploratory analysis; results require manual interpretation and validation
- Different parameter settings produce different results; recommend trying multiple times
- Topic number selection is important; too many or too few topics affect result quality
- Preprocessing greatly affects results; recommend carefully configuring preprocessing options
- Large corpus analysis may take time; please be patient
- Dynamic topic analysis requires texts to contain date metadata
- Topic number optimization tests multiple topic numbers and may take time
- Visualization charts may be slow when topic count is high
- Export functions may take time when data volume is large
- BERTopic embedding files can be reused to avoid repeated computation
- LDA and NMF topic number optimization can help find optimal topic number

# Dictionary Lookup

## Supported Dictionaries

## Search Features

# Application Settings

The Application Settings module is used to personalize various features and appearance of Meta-Lingo.

## Interface Language

Switch the interface language of the application:

- **Chinese (zh)**: Simplified Chinese interface
- **English (en)**: English interface

After switching, all interface text, prompts, and help documentation will change accordingly.

## Wallpaper Settings

### Theme Mode

Select the application theme mode:

- **Light Mode**: White background, suitable for bright environments
- **Dark Mode**: Dark background, suitable for nighttime use, reduces eye strain

### Custom Wallpaper

Upload a custom wallpaper as application background:

1. Click "Upload Wallpaper" button to select an image file
2. Supports JPG, PNG and other common image formats
3. Wallpaper automatically fits window size (proportional scaling, no distortion)
4. Click "Change Wallpaper" to replace current wallpaper
5. Click "Remove Wallpaper" to delete wallpaper

### Wallpaper Opacity

Adjust wallpaper opacity:

- **Range**: 5% - 50%
- **Step**: 5%
- **Default**: 30%
- Lower opacity makes wallpaper more subtle, not affecting readability
- Higher opacity makes wallpaper more prominent

## Ollama Connection

Configure local large language model (LLM) connection for features like topic label generation in topic modeling.

### Connection Settings

- **URL**: Ollama service address (default: `http://localhost:11434`)
- **Connection Status**: Shows current connection status (connected/disconnected)

### Model Selection

After successful connection, you can select from available models:

- System automatically retrieves models installed in Ollama
- After selecting a model, topic modeling and other features will use it

### Usage Instructions

1. Ensure Ollama is installed and running ([https://ollama.ai](https://ollama.ai))
2. Download required models in Ollama (e.g., `ollama pull llama2`)
3. Configure connection in Meta-Lingo and select model

## USAS Annotation Mode

Select the method for USAS semantic domain annotation:

### Rule-based Mode

Uses PyMUSAS rule-based tagger:

- Dictionary and rule-based annotation
- Supports Multi-Word Expression (MWE) recognition
- Combines discourse domain identification and one-sense-per-discourse disambiguation
- **Advantages**: Fast, high interpretability
- **Suitable for**: General scenarios

### Neural Mode

Uses neural network model for annotation:

- Based on pre-trained semantic annotation model
- Can handle more complex contexts
- **Advantages**: Strong contextual understanding
- **Suitable for**: Scenarios requiring more accurate semantic understanding

### Hybrid Mode

Combines rule-based and neural network methods:

- First uses rule-based method for initial annotation
- Uses neural network for disambiguation in uncertain cases
- **Advantages**: Balances speed and accuracy
- **Suitable for**: Scenarios seeking optimal results

## USAS Semantic Domain Configuration

Configure priority semantic domains for different text types, used for disambiguation during USAS annotation.

### Text Type Configuration

#### Preset Text Types

System presets common text types:

- **GEN** (General text): General configuration
- Can edit priority semantic domains for each type

#### Custom Text Types

1. Click "Add Type" to create custom text type
2. Enter type name (e.g., "Medical Literature", "Legal Text")
3. Configure priority semantic domains for that type

### Priority Domain Configuration

1. Select text type to edit
2. Click "Edit" button
3. Select priority semantic domains in the popup selector
4. Can select multiple domains
5. Save after configuration

**Effect**: Text type selected during corpus upload determines priority semantic domains for USAS annotation, helping improve annotation accuracy.

## License

Click "View License" to view the application license agreement:

- Displays Chinese or English version based on current language
- Shows complete license content in popup

## Factory Reset

**Warning**: This operation cannot be undone!

### Optional Reset Items

The following items can be selected for reset:

- **Database Records**: Corpus metadata, text entries, tags, processing task records
- **Corpus Files**: Text, audio, video, transcription files and other actual files
- **Annotation Archives**: All saved annotation archives
- **Annotation Frameworks**: All custom annotation frameworks

### Auto-Reset Items

The following items are always reset:

- Topic modeling data (embeddings, analysis results, etc.)
- Word2Vec models
- USAS configuration

### Execute Reset

1. Check items to reset
2. Enter "RESET" in confirmation box
3. Click confirm button

**Note**: If you don't use the Factory Reset function, deleting the application or reinstalling a new version will not lose your corpus data.

