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

## 📁 Video Library Directory Structure

Your media folder is structured simply and transparently to store raw media and metadata side-by-side:

```text
my-reference-library/
├── cinematography/
│   ├── action-scene/
│   │   ├── main.mp4              # The main reference video file
│   │   ├── thumbnail.jpg         # (Generated) Mobile-optimized thumbnail image
│   │   ├── metadata.json         # Main video details (title, notes, overall tags)
│   │   ├── split_plan.json       # Browser-saved cut intervals, notes, & tags
│   │   ├── clips.json            # Sliced clip-specific ratings and tags
│   │   └── clips/                # (Sliced output) Losslessly cut reference sub-clips
│   │       ├── scene_01.mp4
│   │       └── scene_02.mp4
```

### 📄 Metadata File Schemas

#### 1. `metadata.json`
Stores top-level details and overall tagging for the main reference video.
```json
{
  "tags": ["cinematography", "lighting", "low-key"],
  "notes": "Low-light tracking shot with soft backlight.",
  "artist": "Roger Deakins",
  "rating": 5
}
```

#### 2. `split_plan.json`
Stores the browser-defined segment intervals before slicing.
```json
{
  "videoRelativePath": "cinematography/action-scene",
  "mainVideoPath": "cinematography/action-scene/main.mp4",
  "segments": [
    {
      "start": 12.4,
      "end": 18.9,
      "tags": ["tracking", "movement"],
      "notes": "Fast pan following the subject",
      "rating": 4
    }
  ]
}
```

#### 3. `clips.json`
Stores individual clip ratings and tags after slicing (generated/merged by `splitter.py` or updated in the UI).
```json
{
  "scene_01": {
    "tags": ["tracking", "movement"],
    "notes": "Fast pan following the subject",
    "rating": 4
  }
}
```

---

## 🖼️ Media Library Directory Structure

For independent reference files scanned by the **Tinder-style Media Browser**, the media folder categorizes and groups files by their file type (images, videos, and GIFs) rather than by structured video subfolders.

When files are uploaded via the media browser, they are automatically organized into subdirectories based on their extension:

```text
my-media-library/
├── images/               # Directory for static images (.jpg, .jpeg, .png, .webp, .avif)
│   ├── pose_reference.png
│   └── background_color.jpg
├── gifs/                 # Directory for looping GIFs (.gif)
│   ├── walk_cycle.gif
│   └── impact_frame.gif
└── videos/               # Directory for reference videos (.mp4, .webm, .mov)
    └── secondary_action.mp4
```

This structure is parsed recursively by the `scanMedia` API. It automatically infers each item's type (`image`, `gif`, or `video`), determines the file size, and shuffles the list on retrieval to present a fresh deck of reference media to the user.

---

## 🔌 API & Logical Data Structures

All frontend and backend communications use shared contracts defined in [index.ts](file:///home/ayan/reference-vault/packages/shared/src/index.ts). The frontend API client in [api.ts](file:///home/ayan/reference-vault/apps/web/src/lib/api.ts) exposes these structures.

### 🧩 Core Data Models

#### Scanned Video Structure
Represents a video directory identified during a library scan.
```typescript
interface ScannedVideo {
  relativePath: string;      // Directory path relative to library root
  mainVideoPath: string;     // Relative path to main.mp4
  metadataPath?: string;     // Relative path to metadata.json
  metadata?: JsonObject;     // Parsed metadata content
  thumbnailPath?: string;    // Relative path to thumbnail.jpg
  clipsMetadataPath?: string;// Relative path to clips.json
  clips: ScannedClip[];      // Lists of generated sub-clips
}
```

#### Scanned Clip Structure
Represents a losslessly sliced sub-clip.
```typescript
interface ScannedClip {
  mediaPath: string;         // Relative path to the sub-clip video file
  metadataPath?: string;     // Relative path to clip-specific metadata
}
```

#### Video Detail Structure
Detailed view of a video directory including clip-specific metadata.
```typescript
interface VideoDetail {
  relativePath: string;
  mainVideoPath: string;
  metadata?: JsonObject;
  thumbnailPath?: string;
  clipsMetadataPath?: string;
  clips: DetailedClip[];     // Includes clip-specific metadata mapped from clips.json
}

interface DetailedClip extends ScannedClip {
  metadata?: JsonObject;     // Merged tags, notes, and rating for the clip
}
```

#### Scanned Media Item
For the Tinder-style media browser interface.
```typescript
interface ScannedMediaItem {
  relativePath: string;
  type: "image" | "gif" | "video";
  sizeBytes: number;
}
```

### 🛰 API Client Methods

The API client in [api.ts](file:///home/ayan/reference-vault/apps/web/src/lib/api.ts) implements the following operations:

| Method Name | HTTP Endpoint | Description |
| :--- | :--- | :--- |
| `validateLibraryRoot(rootPath)` | `POST /api/library/validate` | Validates if the local directory exists and is accessible. |
| `scanLibrary(rootPath)` | `POST /api/library/scan` | Recursively scans for video folders and returns `ScanLibraryResponse`. |
| `getVideoDetail(request)` | `POST /api/videos/detail` | Fetches details and nested clip information for a specific video. |
| `putVideoMetadata(request)` | `PUT /api/videos/metadata` | Writes video-level tags/rating/notes to `metadata.json`. |
| `putClipMetadata(request)` | `PUT /api/clips/metadata` | Writes clip-specific tags/rating/notes to `clips.json`. |
| `saveSplitPlan(request)` | `POST /api/videos/split-plan` | Saves segment timestamps and notes to `split_plan.json`. |
| `createVideoPlaceholder(req)` | `POST /api/videos/create-placeholder` | Creates a new directory and `metadata.json` for a placeholder video. |
| `uploadVideo(rootPath, ...)` | `POST /api/videos/upload` | Streams a video file to the library using an `XMLHttpRequest` upload with progress indicator. |
| `deleteVideo(request)` | `POST /api/videos/delete` | Deletes a video directory and all its files from the filesystem. |
| `deleteClip(request)` | `POST /api/clips/delete` | Deletes a specific clip file and its metadata representation. |
| `captureFrame(request)` | `POST /api/videos/capture-frame` | Uses FFmpeg on the server to extract and save a specific frame as an image. |
| `scanMedia(rootPath)` | `POST /api/media/scan` | Scans for independent images, GIFs, and videos for quick media browsing. |
| `uploadMediaFile(...)` | `POST /api/media/upload` | Streams an independent media file to the media directory root. |

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
