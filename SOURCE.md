# Corresponding source and build instructions

Meta-Lingo — AGPL-3.0-only. Copyright © 2026 Tommy Leo.
Source repository: https://github.com/TLtanium/meta-lingo-electron

For each binary release publish the matching complete source revision/tag, including
this file, LICENSE, frontend/backend/Electron/MCP code, package-lock.json,
requirements.txt, build scripts, packaging specs, default frameworks, help, assets
and license notices (including usas_semantic_domains.txt). Keep the matching source accessible alongside the binary.
Internal project notes, planning documents, runtime data and generated build
outputs are not part of the public source. Public clones read their release
version from package.json; a local PROJECT.md can override it during development.
A citation DOI alone is not a substitute for corresponding source.
LICENSING.md supplies the author-controlled historical-version grant. The app's
license viewer uses the unmodified LICENSE in both interface languages; its
adjacent Open source licenses button reads the full collected dependency notices.
Vite synchronizes these documents into public/licenses in development and every
production build, then packages their identical copies under dist/licenses.

## Development

1. Install Node.js 20+ and Conda. Create a Python 3.12 environment named
   `meta-lingo-electron`: `conda create -n meta-lingo-electron python=3.12`.
2. Activate it: `conda activate meta-lingo-electron`.
3. Install Python dependencies: `python -m pip install -r requirements.txt`.
   Install SpaCy models with `python -m spacy download en_core_web_sm` and
   `python -m spacy download zh_core_web_sm` (repeat for optional supported languages).
   The optional PyMUSAS rule-model wheels are obtained from the upstream UCREL
   installation guide: https://ucrel.github.io/pymusas/installation.html.
   Neural USAS is downloadable in Settings; original resource data is not required
   to compile the application.
4. Install frontend dependencies with `npm ci`.
5. Start the backend with `python backend/main.py` and renderer with `npm run dev`,
   or use the included development scripts. `npm run electron:dev` starts the
   Electron development window. The API defaults to 127.0.0.1:8000.
6. Optional models are downloaded through Settings → Model management. NRC,
   dictionaries and reference CSVs are imported through Settings → User resources.
   These files are not needed to obtain or build the application's source.

## Packaged application

On macOS run `./build.sh`; on Windows run `build.bat` from the repository root,
with the environment available. Scripts compile the backend, MCP and renderer,
generate dependency notices, and invoke Electron Builder. Packaging definitions:
`backend/backend.spec`, the MCP spec and `electron-builder.json`. Platform signing
requires the distributor's own credentials and is not required to build source.
Neither build embeds local NRC, dictionary or reference CSV resources.
Never include user data, API keys, signing credentials or imported resources in
source archives. Publish new source/binary versions together; do not silently
replace historical DOI records or relabel third-party data as AGPL.

MAT-derived MDA modules retain GPLv3 notices and corresponding source; see third-party-licenses/MAT-NOTICE.md and MAT-PROVENANCE.json.
