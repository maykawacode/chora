# Chora: spatial reasoning for qualitative data

Chora is a desktop app for exploring small, multidimensional datasets through
direct manipulation. Score elements against bipolar dimensions, group them
into Collections, and explore the results through live-linked cartesian and
parallel-coordinate maps.

The method is informed by repertory-grid practice, but Chora is designed as a
looser workspace for qualitative reasoning: the dimensions, scores, labels,
and groupings can all evolve while you work.

## What Chora does

- Scores elements along bipolar dimensions such as simple ↔ complex.
- Shows the same data in linked cartesian and semantic maps.
- Updates every open view when an element is moved or edited.
- Groups elements into Collections for comparison and filtering.
- Imports tabular data and exports sessions and map graphics.
- Supports undo and redo across the main scoring workspace and map windows.

## Get started

- [Download the current prerelease](https://github.com/maykawacode/chora/releases)
- Read the [Chora introduction and quick start](GETTING_STARTED.md)

## Project status

Chora is pre-release software under active development. The application is
substantially functional. The current packaged release supports Macs with Apple
silicon running macOS 12 or later. Releases use a free ad-hoc signature and
include macOS Gatekeeper instructions and a SHA-256 checksum.

The preferred session format is `.chora`. Legacy MapTool `.mtda` sessions can
still be opened.

## Run from source

You will need Git, Node.js, and npm.

```sh
git clone https://github.com/maykawacode/chora.git
cd chora
npm ci
npm run dev
```

## Check a change

```sh
npm test
npm run typecheck
npm run build
```

## Build the ad-hoc-signed macOS package

```sh
npm run dist
```

The package is written to `dist/` with its architecture in the filename, such
as `Chora-0.1.0-beta.2-arm64.dmg`. Chora uses a complete ad-hoc code signature
so the Electron bundle is internally consistent, but it does not use Apple
Developer ID signing or notarization.

## Feedback

- Use [Discussions](https://github.com/maykawacode/chora/discussions) for
  questions, examples, workflow ideas, and open-ended feedback.
- Use [Issues](https://github.com/maykawacode/chora/issues) for reproducible
  bugs and scoped improvements.
- Read [SUPPORT.md](SUPPORT.md) before sharing project files or sensitive
  research data.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Chora is available under the [MIT License](LICENSE.md).
