# Chora — spatial reasoning for qualitative data

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

## Project status

Chora is pre-release software under active development. The application is
substantially functional, but signed downloads and release documentation are
not available yet. The first supported distribution target is macOS.

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
