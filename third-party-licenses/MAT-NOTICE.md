# MAT / MDA source and modification notice

Original Multi-Dimensional Analysis Tagger (MAT): Andrea Nini and contributors.
Upstream: https://github.com/andreanini/multidimensionalanalysistagger
Upstream license: GNU GPL version 3; full text in MAT-GPL-3.0.txt.

Meta-Lingo's Biber feature tagger and reference constants are a Python adaptation
of MAT, not a claim to independent authorship of those rules/implementations.
Modified implementation and integration: copyright © 2026 Tommy Leo.
Notice updated 2026-11-06. Adapted files are identified in MAT-PROVENANCE.json;
retain their GPLv3 notices and provide their modified source with distributions.
GNU GPLv3 section 13 permits combination with AGPLv3; the original GPL-covered
parts retain GPLv3, and AGPLv3 network-source requirements apply to the combination.
The application's AGPL notice does not erase the upstream author's rights.

Adaptations include replacement of Stanford-tagged-file input with existing
SpaCy PTB token annotations, Python tagging/counting/statistical orchestration,
contribution-word/lemma reporting and reference data for the React frontend.
Stanford binaries/models and the supplied books, manual PDFs, images and sample
corpus outputs are not copied into this release as part of this notice.
The supplied source archive README identifies v1.3.3, while the earlier port
comments identify v1.3.2. No exact original source commit is known; file hashes
record which local upstream snapshot was inspected without inventing provenance.

Recommended citation from the upstream README:
Nini, A. (2019). The Multi-Dimensional Analysis Tagger. In T. Berber Sardinha &
M. Veirano Pinto (Eds.), Multi-Dimensional Analysis: Research Methods and Current
Issues (pp. 67–94). Bloomsbury Academic.

Method/reference statistics: Biber (1988), Variation across Speech and Writing;
Biber (1989), A Typology of English Texts. Method citations and the software's
copyright/license obligations serve different purposes; include both.
