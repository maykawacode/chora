# Chora: Compare Ideas, Cases, and Experiences Through Maps

Chora helps you compare a small set of things across several qualities at once.
For example, you could compare places to study using Quiet ↔ Lively and Private
↔ Social. You score each place, and Chora turns the scores into linked maps.
Moving a place on a map updates its score everywhere. You can update any
details, names and configurations at any time as your understanding evolves.
(Chora does not perform statistical analysis or establish causes.)

## Projects that fit Chora

Examples include:

- Interview cases, documents, or observations
- Design concepts or product ideas
- Places, services, organizations, or experiences
- Strategic options or proposed features
- Images, statements, or themes

Choose a set small enough to score one item at a time. Chora becomes useful when
the relationships are hard to remember or see in a table.

## The four building blocks

### Elements

**Elements** are the things you want to compare: a place, interview, document,
idea, option, image, or case. Each element can have a name, definition, color,
shape, and weight.

### Dimensions

**Dimensions** are paired qualities used to compare every element. A dimension
has two opposing poles, such as:

- Quiet ↔ Lively
- Private ↔ Social
- Familiar ↔ Surprising
- Simple ↔ Complex

Choose poles that make sense for the question you are exploring.

### Scores

A **score** places an element between the two poles of a dimension. A score near
0 sits toward the first pole; a score near 1 sits toward the second. Scores can
be revised whenever your view changes.

### Collections

**Collections** are named groups. Membership is yes or no, and an element can
belong to more than one Collection. Collections can represent source, role,
theme, type, status, or any other grouping useful to your analysis.

## The basic Chora sequence

**Elements → Dimensions → Collections → Assess → Maps**

1. Define what you are comparing.
2. Define the questions or contrasts you will use to compare it.
3. Add any useful groups.
4. Record scores and Collection membership in Assess.
5. Open maps to compare the relationships among the Elements.

Return to any step as your understanding changes. You can rename a Dimension,
revise a score, or change a Collection at any time.

## Download and install the prerelease

Chora is currently prerelease software. The downloadable build supports
Macs with Apple silicon running macOS 12 or later.

1. Open [Chora Releases](https://github.com/maykawacode/chora/releases) and
   select the newest published prerelease.
2. Under **Assets**, download the file ending in `-arm64.dmg` and
   `SHA256SUMS.txt`. GitHub also lists Source code ZIP and TAR files for people
   who want to build Chora.
3. Put both files in the same folder and, if you want to verify the download,
   run this command from that folder:

   ```sh
   shasum -a 256 -c SHA256SUMS.txt
   ```

   The result should end in `OK`.
4. Open the DMG and copy Chora to Applications.
5. Try to open Chora once. The free prerelease uses an ad-hoc signature and has
   no Apple Developer ID signature or Apple notarization, so macOS will block
   the first launch.
6. Open **System Settings → Privacy & Security**, find the message about Chora,
   and choose **Open Anyway**. Authenticate if asked, then confirm **Open**.

## Your first ten minutes

### 1. Open the example

On the Welcome screen, choose **Example**. Chora opens a campus study-spaces
dataset containing 18 Elements, six Dimensions, three overlapping Collections,
and prepared Cartesian and Semantic maps.

The example opens as an unsaved working copy. You can freely change it without
overwriting the bundled original.

If the Welcome screen is not visible, choose **Help → Open Example Data**.

### 2. Look through the main tabs

- **Elements** lists the campus spaces and their visual properties.
- **Dimensions** shows paired qualities such as quiet and lively.
- **Collections** shows the named groups and how many Elements each contains.
- **Assess** is where you score the selected Element and change its Collection
  membership.
- **…** contains optional conversions and transformations. Leave this tab for a
  later session.

Click an item in the list on the left to inspect or edit its details on the
right. The divider between the two panes can be dragged when you need more room.

### 3. Change one judgment

Open **Assess** and select **Outdoor courtyard table**. Move one dimension
slider. Watch the open maps update, then choose **Edit → Undo** or press
**Command-Z**.

### 4. Read the two map types

The example includes both kinds of map:

- A **Cartesian map** uses two Dimensions as its horizontal and vertical axes.
  Elements with similar scores appear near one another. Selected Collections
  can be shown as overlapping regions.
- A **Semantic map** shows each Element as a profile across several Dimensions.
  Lines that follow similar paths have similar profiles; sharp divergences help
  reveal contrasts.

Drag an Element on either map to revise the score represented by its position.
The change also appears in Assess and in the other open maps. Use Undo whenever
you want to step back.

### 5. Save your own copy

Choose **File → Save As…** and give the session a name. Chora saves the edited
example as your own `.chora` file. Close Chora and reopen that file.

## Build a workspace of your own

### 1. Add Elements

Choose **File → New**, open the Elements tab, type a name into **New element…**,
and press Return. Add the things you want to compare. Select an Element to edit
its name, definition, color, shape, or weight. You can add elements at any time,
even after other steps.

### 2. Add Dimensions

Open Dimensions, enter a paired label such as `Quiet–Lively`, and press Return.
Select the new Dimension to refine Pole A, Pole B, its definition, or its
weight. The **…** control beside the new-Dimension field opens starter choices.

After scoring a few Elements, revise any poles that feel vague or misleading.

### 3. Add optional Collections

Open Collections and add any groups that will help you compare the set.
Collections are optional for drawing maps. You can give each Collection a name,
definition, and color.

### 4. Assess the Elements

Open Assess and choose an Element. Move the sliders to place it between each
Dimension's poles, then set its Collection membership. Repeat for the rest of
the set.

### 5. Draw maps

Use the **Maps** menu:

- **New Cartesian Map…** asks you to select exactly two Dimensions. The first
  becomes X and the second becomes Y.
- **New Semantic Map…** compares each Element's scores across two or more
  Dimensions.

Create any number of additional maps to compare other pairs or groups of
Dimensions. Every map stays synchronized with the main Chora window.

## Working directly with maps

- **Click an Element** to select it across every window.
- **Drag an Element** to change the score represented by that map position.
- **Shift-click Elements** to build or reduce a multi-selection.
- **Shift-drag empty map space** to lasso several Elements.
- **Drag a selected group** to move its members together while preserving their
  relative score differences where possible.
- **Right-click an Element** to edit its details. Right-click a selected member
  of a group to edit shared properties for the selection.
- **Press Escape** to clear a map selection or close an open map dialog.

Open the map's right-side controls to change marks, labels, weight-based sizing,
Element or Collection coloring, and which Collections the map emphasizes. The
same panel can export the current map as SVG for use in documents or graphics
software.

## Selection and editing in the main window

- Click an Element to select it.
- Shift-click selects a continuous range.
- Command-click adds or removes individual Elements from the selection.
- Command-D duplicates the selected Element.
- Delete removes the selected Element, Dimension, or Collection.

## Files, imports, and exports

- **Save** and **Save As…** write a `.chora` session containing the data,
  scores, collections, and map configuration.
- **Import Spreadsheet…** accepts TSV, CSV, and text files and previews the
  result before applying it.
- **Export Spreadsheet…** writes a tab-separated representation that can be
  edited or re-imported.
- A map's sidebar exports that map as SVG.

Back up any session you need to keep while Chora remains in prerelease. Use
**Help → Check for Updates…** to visit the Releases page; updates are installed
manually.

## Reading a map

Use a pattern on a map to ask a question:

1. Name a cluster, separation, overlap, or unusual profile you notice.
2. Identify which scores and Dimensions produced it.
3. Ask whether those judgments still make sense for the underlying material.
4. Revise a score or Dimension if your understanding has changed.
5. Notice what changes and what remains stable across other maps.

A saved Chora session records how you distinguished the Elements and where your
judgment may need more work.

## Data and privacy

A Chora session or imported dataset may contain names, notes, judgments, or
other sensitive research material. Do not attach a real session, dataset, or
screenshot to a public GitHub post unless you have permission to publish all of
its contents. Reproduce a problem with a small invented dataset whenever
possible.

## Help, questions, and feedback

- Choose **Help → Chora Orientation** for the short guide included in the app.
- Ask how-to questions, describe a workflow, or share an early idea in
  [GitHub Discussions](https://github.com/maykawacode/chora/discussions).
- Report a reproducible problem with the
  [Bug report template](https://github.com/maykawacode/chora/issues/new?template=bug_report.md).
- Propose a focused change with the
  [Improvement request template](https://github.com/maykawacode/chora/issues/new?template=feature_request.md).
- Read the project's [support and privacy guidance](https://github.com/maykawacode/chora/blob/main/SUPPORT.md)
  before sharing files or research material.

## Project and source

Chora is open-source software released under the MIT License. Source code,
development instructions, releases, and project activity are available at
<https://github.com/maykawacode/chora>.
