# 🎬 Reference Vault

A self-hosted, **local-first** video reference library and annotation vault. It is built for animators, filmmakers, cinematographers, sports analysts, and anyone who studies reference footage.

The **filesystem is the absolute source of truth**. Reference Vault does not use a database or copy metadata into a central application store; instead, all metadata (tags, ratings, notes, and cut plans) lives directly beside your video files in standard JSON files.

---

## 🌟 Key Features

* **Local-First & DB-less:** No database to configure or sync. If you move, share, or backup your folders, all your metadata (tags, notes, splits) goes with them.
* **Smart Library Scanning:** Recursively scans a local directory to identify videos, thumbnails, clips, and annotations.
* **On-Demand Thumbnail Extraction:** Uses `ffmpeg` to automatically generate mobile-optimized thumbnails for videos (scaled to 480px width to save space).
* **Split Planning & Annotating:** Scrub through a video in the browser and define a "Split Plan" by marking timestamps, adding notes, tags, and rating segments (1–5 stars).
* **Python Clip Slicer (`splitter.py`):** A command-line script that parses split plans recursively and slices `main.mp4` files into frame-accurate, raw sub-clips (using `ffmpeg -c copy` for instantaneous lossless cutting) without re-encoding.
* **Mobile-Optimized Streaming API:** 
  * Capped 2MB chunk sizes for video range requests to save bandwidth and prevent memory bloat on cellular networks.
  * Suffix-range support (e.g. `bytes=-500`) for mobile players (like Safari) to quickly parse trailing metadata.
  * Robust HTTP caching (`Cache-Control`, `ETag`, `Last-Modified`) returning `304 Not Modified` to speed up re-loads.

---

## 📁 Library Directory Structure

Your media folder is structured simply and transparently:

```text
my-reference-library/
├── cinematography/
│   ├── action-scene/
│   │   ├── main.mp4              # The main reference video
│   │   ├── thumbnail.jpg         # (Generated) Thumbnail image
│   │   ├── metadata.json         # Video tags & overall notes
│   │   ├── split_plan.json       # Browser-saved timestamps & split logs
│   │   └── clips.json            # Sliced clip metadata (ratings, tags)
│   │   └── clips/                # (Sliced output) Short reference cuts
│   │       ├── scene_01.mp4
│   │       └── scene_02.mp4
```

---

## 🛠 Tech Stack

- **Frontend (`apps/web`):** React, Vite, Vanilla CSS.
- **Backend (`apps/server`):** Fastify, Node.js (v22+), `ffmpeg` integration.
- **Shared Contracts (`packages/shared`):** Shared TypeScript types and validation schemas.
- **Automation CLI (`splitter.py`):** Python 3 script using `ffmpeg`.

---

## 🚀 Getting Started

### 📋 Prerequisites

- **Node.js:** version `22` or higher.
- **FFmpeg:** Installed on your system path (required for thumbnail generation and clip slicing).
- **Python 3:** Required for the offline slicing CLI.

### 1. Installation

Install project dependencies from the root directory:

```bash
npm install
```

### 2. Development

Run the backend API server and frontend application concurrently:

```sh
# Run backend Fastify API
npm run dev --workspace=@reference-vault/server

# Run frontend React UI
npm run dev --workspace=@reference-vault/web
```

The Vite frontend development server proxies API requests to the Fastify server running on port `4310`. Open your browser to `http://localhost:5173`.

### 3. Slicing Clips with the CLI

Once you have defined your split plans in the web interface, you can run the offline slicing script to generate individual clip files:

```bash
# Scan and slice all split plans in your library
python3 splitter.py /path/to/your/media-library
```

The script will losslessly slice segments into the `clips/` directory and merge clip tags and ratings into the video's local `clips.json` file.

---

## 🧪 Testing

To run the integration and unit tests for both the server and packages:

```bash
npm test
```

---

## 📐 Architecture Principles

Before making modifications, please review the [Architecture Documentation](docs/architecture.md):
- **Non-negotiable rule:** The filesystem directory is the *only* source of truth. The application must never store metadata in databases or indexes that can become authoritative.
- **Memory-only indexes:** Fastify search indexes (using Fuse.js) are built in-memory on startup or filesystem change and are never written to disk.
