# Third-party notices

Meta-Lingo original code is copyright © 2026 Tommy Leo and licensed under
AGPL-3.0-only. Third-party works retain their original licenses and attribution.
The historical-version grant for author-controlled original code is recorded in
LICENSING.md; it does not change third-party rights or retroactively authorize
third-party data distribution. In the app, Settings → License → Open source
licenses displays the complete collected dependency notices.
The release includes `third-party-licenses/LICENSES.txt` and `inventory.json`,
collected from the build environment by `scripts/collect_third_party_licenses.py`.
Regenerate them for every release on its actual target platform.

Notable components include:

| Component | Upstream terms | Source |
| --- | --- | --- |
| MAT / MDA adaptation (Andrea Nini and contributors) | GPL-3.0; modified sources retain GPL | https://github.com/andreanini/multidimensionalanalysistagger |
| Ultralytics (object detection) | AGPL-3.0 | https://github.com/ultralytics/ultralytics |
| PyMuPDF (PDF processing) | AGPL-3.0 | https://github.com/pymupdf/PyMuPDF |
| Parselmouth / Praat (acoustics) | GPL-3.0 and component notices | https://github.com/YannickJadoul/Parselmouth |
| mdict-utils wrapper | MIT, Yugang LIU | https://github.com/liuyug/mdict-utils |
| Embedded readmdict reader | GPL-3.0, Xiaoqiang Wang | https://github.com/liuyug/mdict-utils/tree/master/mdict_utils/base |
| Gensim | LGPL-2.1 | https://github.com/piskvorky/gensim |
| Electron / React / MUI | MIT and bundled component notices | https://github.com/electron/electron ; https://github.com/facebook/react ; https://github.com/mui/material-ui |

The MDict reader's embedded GPL notice applies in addition to the wrapper's MIT
notice; the wrapper metadata alone does not describe all embedded components.
GNU GPLv3 section 13 permits combination with AGPLv3 subject to its terms.
No additional proprietary/noncommercial restriction is imposed on Meta-Lingo code.

NRC EmoLex, commercial dictionaries and reference-corpus CSV data are **not
included** in this release. Users obtain and import their own authorized copies;
their original terms continue to govern them. Imports are local and not uploaded
by the resource importer. The NRC download and required attribution are described
in Help; importing a resource does not license it to other users.

Optional model downloads and linguistic data retain their upstream licenses,
model cards and attribution. AGPL licensing of application code does not relicense
model weights, dictionaries, corpora, or user annotations. Preserve notices when
redistributing components. See the dependency inventory and upstream sources for
the exact versions included in a release.


MAT-derived MDA files retain GPLv3 notices; see
`third-party-licenses/MAT-NOTICE.md`, `MAT-GPL-3.0.txt` and `MAT-PROVENANCE.json`.
The bundled license collector preserves these static notices alongside its
generated dependency inventory. Modified corresponding source is included in
`backend/services/mda/` and the frontend Biber reference-data module.
