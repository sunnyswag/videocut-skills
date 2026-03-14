# Videocut Skill

> A video clipping Agent built with Cursor Skills, designed for talking-head videos

[中文版](README.zh.md)

## Why Build This?

CapCut's "Smart Clip" has two pain points:
1. **No semantic understanding**: It can't detect repeated sentences or self-corrections after mistakes
2. **Poor subtitle quality**: Technical terms (Claude Code, MCP, API) are often transcribed incorrectly

This Agent uses Claude's semantic understanding to solve the first problem, and custom dictionaries to solve the second.

## Demo

**Input**: 19-minute raw talking-head footage (various slips, stuttering, repetitions)

**Output**:
- Automatically identified 608 issues (114 silences + 494 slips/repetitions)
- Post-cut video 72MB
- Fully AI-assisted, manual effort limited to confirmation only

## Core Features

| Feature | Description | vs CapCut |
|---|---|---|
| **Semantic understanding** | AI analyzes sentence-by-sentence, detects re-takes / corrections / stuttering | Pattern matching only |
| **Silence detection** | Auto-mark >0.3s, adjustable threshold | Fixed threshold |
| **Duplicate detection** | Adjacent sentences with ≥5 identical starting characters → delete earlier, keep later | Not available |
| **Intra-sentence repeat** | "ok let's next ok let's next do" → delete repeated part | Not available |
| **Dictionary correction** | Custom professional term dictionary | Not available |
| **Self-evolution** | Remembers your preferences, improves over time | Not available |

## Quick Start

### 1. Install Skills

```bash
# Clone to skills directory:
git clone https://github.com/Ceeon/videocut-skills.git ~/.cursor/skills/videocut
```

### 2. Set Up Environment

Open Cursor, type:

```
/videocut:clip
```

The AI will automatically:
- Check Node.js and FFmpeg
- Install the Volcengine API Key

## Usage Flow

```
┌─────────────────────────────────────────────────────────┐
│  Prerequisites: Install Node.js, FFmpeg, @huiqinghuang/videocut-cli │
│  Set VOLCENGINE_API_KEY environment variable             │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  /videocut:clip video.mp4                               │
│                                                         │
│  1. Extract audio → upload to cloud                     │
│  2. Volcengine transcription → word-level timestamps    │
│  3. AI review: silence / slips / repetition / fillers   │
│  4. Generate review web page → open in browser          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  [Manual Review + Execute Cut]                          │
│                                                         │
│  - Click to jump & play                                 │
│  - Double-click to select/deselect                      │
│  - Shift+drag for multi-select                          │
│  - Confirm, then click "Execute Cut" → auto FFmpeg cut  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  /videocut:evolution  (optional)                        │
│                                                         │
│  Tell the AI your preferences, it will remember:        │
│  - "Change silence threshold to 1 second"               │
│  - "Keep some 'um's as transitions"                     │
└─────────────────────────────────────────────────────────┘
```

## Skill List

| Skill | Function | Input | Output |
|---|---|---|---|
| `clip` | Transcribe + AI review + cut | Video file | Clipped video |
| `evolution` | Record preferences | User feedback | Updated rule files |

## Directory Structure

```
videocut-skills/
├── README.md              # This file
├── README.zh.md           # Chinese version
├── SKILL.md               # Main skill: transcribe + AI review + cut
├── edits.example.json     # Example edits format
├── rules/                 # Slip detection rules (customizable)
│   ├── 1-core-principles.md
│   ├── 2-filler-words.md
│   ├── 3-silence-handling.md
│   ├── 4-duplicate-sentences.md
│   ├── 5-stuttering.md
│   ├── 6-intra-sentence-repeat.md
│   ├── 7-consecutive-fillers.md
│   ├── 8-self-correction.md
│   └── 9-incomplete-sentences.md
├── setup/                 # Setup skill (legacy, merged into SKILL.md)
└── .env.example           # API Key template
```

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│  Volcengine ASR  │────▶│  Word-level      │
│  (cloud transcr) │     │  timestamps      │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│   AI Agent       │────▶│   AI review      │
│  (semantic)      │     │   edits.json     │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│   Review Web UI  │────▶│  Final deletions │
│  (manual confirm)│     │  delete_segments │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│     FFmpeg       │────▶│  Clipped video   │
│  filter_complex  │     │  xxx_cut.mp4     │
└──────────────────┘     └──────────────────┘
```

## Dependencies

| Dependency | Purpose | Install |
|---|---|---|
| Node.js 18+ | Run scripts | `brew install node` |
| FFmpeg | Audio/video processing | `brew install ffmpeg` |
| Volcengine API | Speech transcription | [Get Key](https://console.volcengine.com/speech/new/setting/apikeys) |

## License

MIT
