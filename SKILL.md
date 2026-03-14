---
name: videocut:clip
description: Talking-head video transcription and slip-of-tongue detection. Generates review transcript and deletion task list. Triggers: clip video, process video, detect slips
---

<!--
input: Video file (*.mp4) or folder containing multiple videos
output: subtitles_words.json, auto_selected.json
pos: Transcription + detection, up to user web review
-->

# Clip Talking-Head Video

> Volcengine transcription + AI slip detection + web review

## Quick Usage

```
User: Clip this talking-head video
User: Process this video
User: Process videos in @some-folder
User: Clip @some-folder
```

## Prerequisites

| Dependency | Purpose | Install Command |
|---|---|---|
| Node.js | Run CLI | `brew install node` |
| FFmpeg | Video cutting | `brew install ffmpeg` |
| @huiqinghuang/videocut-cli | Video clipping tool | `npm install -g @huiqinghuang/videocut-cli` |

### Volcengine ASR API

Console: https://console.volcengine.com/speech/new/experience/asr?projectName=default

1. Register a Volcengine account
2. Enable the speech recognition service
3. Obtain an API Key

### Install & Verify

```bash
# macOS
brew install node ffmpeg

# Install CLI
npm install -g @huiqinghuang/videocut-cli

# Set environment variable (recommended: add to ~/.zshrc or ~/.bashrc)
export VOLCENGINE_API_KEY="your_api_key"

# Verify
node -v && ffmpeg -version && videocut --help && echo $VOLCENGINE_API_KEY
```

### Troubleshooting

| Problem | Solution |
|---|---|
| Where to get the API Key? | Volcengine Console → Speech Technology → Speech Recognition → API Key |
| `ffmpeg` command not found | `which ffmpeg` should output a path. If not: `brew install ffmpeg` |
| Filename contains colons | Add `file:` prefix: `ffmpeg -i "file:2026:01:26 task.mp4" ...` |

## Output Directory Structure

```
output/
└── YYYY-MM-DD_video/
  ├── 1_transcribe/
  │   ├── audio.mp3
  │   └── volcengine_result.json
  ├── common/
  │   ├── subtitles_words.json        # Single source of truth (opt + gap)
  │   └── subtitles_words_edited.json # After applying edits
  ├── 2_analysis/
  │   ├── readable.txt   # Generated from common, for human/AI reading
  │   ├── edits.json     # Delete/edit list, written back by apply-edits
  │   └── analysis.md
  └── 3_review/
      └── delete_segments.json  # Saved when cut is executed
```

**Rule**: Reuse existing folders; create new ones otherwise.

## Workflow

```
0. Create output directory
    ↓
1. Transcribe video (videocut transcribe)
    ↓
2. Generate opted structure (videocut generate-subtitles)
    ↓
3. Generate readable, AI analyzes slips, maintain edits.json
    ↓
4. Apply edits (videocut apply-edits)
    ↓
5. Start review server (videocut review-server)
    ↓
[Wait for user confirmation] → Click "Execute Cut" in the web UI
```

### Batch Processing (Multiple Videos)

When the user specifies a **folder** or **multiple videos**, use `mcp_task` to launch parallel subagents:

| Option | Description |
|---|---|
| **Subagent type** | `generalPurpose` (can execute commands + AI slip analysis) |
| **Parallelism** | 1 subagent per video, launched simultaneously |
| **Review server** | After all subagents complete, start **only 1** `videocut review-server` (pass the `output/` parent directory); the web UI shows each video as a Tab |

**Subagent prompt essentials** (must be specified in the prompt):
- Absolute paths for `VIDEO_PATH` and `WORKSPACE_ROOT`
- Step 0: create output directory
- If a `video_script.md` or user script exists, describe the video context source
- Subagent only executes steps 0–4 (transcribe + analyze + apply-edits), **does not start the review server**

## Execution Steps

**Variable conventions**: `VIDEO_PATH` = video path; `BASE_DIR` = output directory.

### Step 0: Create Output Directory

```bash
BASE_DIR="output/$(date +%Y-%m-%d)_$(basename "$VIDEO_PATH" .mp4)"
mkdir -p "$BASE_DIR"/{1_transcribe,common,2_analysis,3_review}

# Symlink video to the output parent directory (for review-server to locate)
ln -sf "$(cd "$(dirname "$VIDEO_PATH")" && pwd)/$(basename "$VIDEO_PATH")" "$(dirname "$BASE_DIR")/"
```

### Step 1: Transcribe

```bash
videocut transcribe "$VIDEO_PATH" -o "$BASE_DIR"
# Output: 1_transcribe/audio.mp3, volcengine_result.json
```

### Step 2: Split Subtitles (opt + gap insertion)

```bash
videocut generate-subtitles "$BASE_DIR/1_transcribe/volcengine_result.json"
# Output: common/subtitles_words.json (single source of truth)
```

### Step 3: Analyze Slips (script + AI)

#### 3.1 Generate Readable Format

```bash
videocut generate-readable "$BASE_DIR/common/subtitles_words.json" -o "$BASE_DIR/2_analysis/readable.txt"
```

#### 3.2 Read User Preferences

Read all rule files under the `rules/` directory.
Read any user-provided script under `BASE_DIR` to understand video context.

#### 3.3 AI Analysis: Remove Silences/Slips + Correct Subtitle Text (output edits.json)

The AI reads readable.txt, combined with video context (user script / narration content), and does two things:
1. **Remove**: Mark silence segments (blank) and slip segments for deletion.
2. **Correct**: Fix ASR transcription errors based on actual video content (e.g., proper nouns, homophones).

Output is written to `2_analysis/edits.json`. Format reference: `$SKILL_DIR/edits.example.json`.

pathSet has three forms: `{ parent: i }` (whole utterance), `{ parent: i, children: [j] }` (single child node), `{ parent: i, children: [j, k] }` (multiple child nodes). All indices are 0-based. deletes can be at utterance or child-node level; textChanges and combines are child-node level only.

**Deletion rules (deletes, by priority)**:

| # | Type | Detection Method | Deletion Scope |
|---|---|---|---|
| 1 | Silence | `blank_Xs` lines | Entire line |
| 2 | Duplicate sentence | Adjacent sentences share ≥5 initial characters | The shorter **whole sentence** |
| 3 | Skip-one duplicate | When middle is a fragment, compare before/after | Previous sentence + fragment |
| 4 | Fragment | Sentence cut off mid-way + silence | **Entire fragment** |
| 5 | Intra-sentence repeat | A + middle + A pattern | The earlier part |
| 6 | Stuttering | "that that", "so so" | The earlier part |
| 7 | Self-correction | Partial repeat / negation correction | The earlier part |
| 8 | Filler words | um, uh, ah | Mark for deletion |

**Correction rules (textChanges)**:

| Scenario | Example | Operation |
|---|---|---|
| ASR homophone error | "红" → "宏" | `{ "pathSet": { "parent": 2, "children": [16] }, "newText": "宏", "oldText": "红" }` |
| Proper noun | "get up" → "GitHub" | combines to merge corresponding child nodes |
| Extra spaces/punctuation | "a a i" → "AI" | combines to merge or textChanges to correct |

**Core principles**:
- **Delete whole sentences**: For fragments and duplicates, delete the entire sentence (`{ parent: i }`), not just a few words
- **Context-based correction**: Use user-provided video scripts or narration to determine correct wording

**Segmented analysis (loop execution)**:

```
1. Read readable.txt offset=N limit=100 (each segment ~100 lines, including sentence and word lines)
2. Analyze these 100 lines: mark paths to delete, text to correct
3. Append deletes and textChanges to edits.json
4. Log analysis process to analysis.md
5. N += 100, return to step 1
```

#### 3.6 Maintain edits.json and Write Back to JSON

Using **common/subtitles_words.json** as the single source of truth. AI or manual annotations on readable as "delete/edit" are written to `2_analysis/edits.json`, then applied back via script:

```bash
videocut apply-edits "$BASE_DIR/common/subtitles_words.json" "$BASE_DIR/2_analysis/edits.json"
# Output: common/subtitles_words_edited.json
```

### Step 5: Start Review Server

```bash
# root_path is determined by the AI:
#   Single video → pass project directory (e.g., "$BASE_DIR"), web shows only that project
#   Multiple videos → pass output/ parent directory, web shows all projects as Tabs
videocut review-server 8899 --path "$ROOT_PATH"
# Open http://localhost:8899
```

The user in the web UI can:
- Switch Tabs to select which video to review
- Play video to confirm
- Check/uncheck deletion items
- Click "Execute Cut"

---

## Data Formats

### edits.json (2_analysis)

```json
{
  "deletes": [
    { "pathSet": { "parent": 0 }, "reason": "silence" },
    { "pathSet": { "parent": 1, "children": [2, 3] }, "reason": "repetition" }
  ],
  "textChanges": [
    { "pathSet": { "parent": 2, "children": [1] }, "newText": "C", "oldText": "c" }
  ],
  "combines": [
    { "pathSet": { "parent": 16, "children": [5, 6] }, "newText": "GitHub", "oldText": "get up", "reason": "asr_error" }
  ]
}
```

- **pathSet**: All indices are 0-based. `{ parent: i }` = utterances[i] (whole sentence); `{ parent: i, children: [j, k] }` = single/multiple child nodes.
- **deletes**: Mark for deletion; after apply, the corresponding node's `opt` is set to `"del"`.
- **textChanges**: Correct text by overwriting a node's `text`.
- **combines**: Merge multiple child nodes under the same parent into one, using the time union, replacing with `newText`.

---

## Rule Files

The `rules/` directory contains slip detection rules:

| File | Description |
|---|---|
| 1-core-principles.md | Core principles |
| 2-filler-words.md | Filler word rules |
| 3-silence-handling.md | Silence handling |
| 4-duplicate-sentences.md | Duplicate sentence detection |
| 5-stuttering.md | Stuttering detection |
| 6-intra-sentence-repeat.md | Intra-sentence repeat detection |
| 7-consecutive-fillers.md | Consecutive filler words |
| 8-self-correction.md | Self-correction detection |
| 9-incomplete-sentences.md | Incomplete sentence detection |
