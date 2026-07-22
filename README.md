# Reference Vault

A free, self-hosted reference manager for artists, animators, filmmakers, game devs, or anyone who hoards visual inspiration.

I built this because my reference was everywhere. Some videos in a "misc" folder, some images saved to Desktop, a few GIFs buried in Downloads, half a Pinterest board I forgot existed, and a screenshot I definitely downloaded at some point but could never find again when I actually needed it. Every project meant re-digging through the same mess, and a chunk of "working time" was really just "where did I put that reference" time.

Reference Vault is meant to be the one place all of that lives — videos, clips, images, GIFs, screenshots, whatever you've collected, all in a single searchable library instead of scattered across ten different apps and folders. Tag it once, rate it, leave yourself a note on why it mattered, and it's actually findable next time instead of lost in the pile. It all lives on your own computer too, so there's no account or cloud service standing between you and your own reference.

No subscriptions, no cloud sync, no account to sign up for. Just your library, sitting in a folder you control.

## Why this exists

A lot of creative tools these days want you paying monthly and storing your stuff on someone else's server. Reference Vault does the opposite:

- **Your files never leave your computer.** Nothing gets uploaded anywhere.
- **It's just folders and JSON.** No database to get corrupted, no proprietary format locking you in.
- **Run it yourself.** It's your machine, your library, your rules.
- **Free and open source.** No usage caps, no premium tier, no catch.

If you ever decide to stop using this, your files are still just... there, organized in plain folders like they always were. Nothing to export, nothing to migrate.

## What it does

- **Organize big libraries of reference video.** If you've got hundreds of gigs of motion reference scattered across random folders, this gives them an actual home — one you can browse and make sense of instead of digging through a file explorer.
- **Cut clips directly out of longer footage.** No need to open a video editor just to pull a 5-second walk cycle out of a 20-minute compilation. Trim it right where you're already looking at it, and the clip gets saved alongside the source.
- **Add metadata, notes, and ratings to videos and clips.** Future-you won't remember why a clip was useful six months from now. A quick note or rating means you can actually tell your good reference from your "seemed important at 2am" reference.
- **Store inspiration images, GIFs, and short videos.** Not everything is a video to clip — sometimes it's just a piece of concept art or a screenshot that stuck with you. This gives that stuff a proper library too, instead of it dying in a Downloads folder.
- **Grab frame captures straight from a video.** See a pose or a frame mid-scrub that you want to keep on its own? Pull it out on the spot instead of alt-tabbing into some other tool to screenshot it.
- **Search and filter across your whole library.** Once you've got hundreds of videos and images, browsing alone stops working. Being able to search by tag, note, or rating is what actually makes a big library usable.
- **Add your own custom metadata fields if the defaults don't fit your workflow.** Everyone tags reference differently — an animator cares about different things than a concept artist. Instead of forcing one schema on everyone, you can shape the fields around how you actually think.

## How it's organized

Your library is split into two folders:

```
Reference Library/
│
├── videos/
│   ├── Parkour Jump/
│   │   ├── main.mp4
│   │   ├── metadata.json
│   │   ├── clips.json
│   │   ├── split_plan.json
│   │   └── clips/
│   │       ├── Jump 01.mp4
│   │       └── Jump 02.mp4
│   │
│   └── ...
│
└── media/
    ├── images/
    ├── gifs/
    └── videos/
```

**videos/** is for long-form reference footage, think motion reference, fight choreography, parkour runs, animal locomotion, camera moves from films, gameplay recordings, dance breakdowns, tutorials, or anything you'd want to sit down and actually study or pull clips from. Each one keeps its own metadata, notes, ratings, and any clips you've made from it, all sitting right next to the source file.

**media/** is more of a general inspiration dump — concept art, screenshots, stuff you saved off Pinterest, GIFs, whatever. You can browse it as a randomized feed, and moodboards are on the way.

## Sharing your library

Since it's all just regular folders, sharing is about as simple as it gets:

- Zip it up and send it to a friend
- Share it over your local network
- Use Tailscale to reach it securely from another device without opening anything up to the public internet

No export step, no weird proprietary file to convert. It's already just files.

## Running with Docker (Self-Hosted)

Reference Vault can be run as a containerized local application using Docker or Docker Compose.

### Quick Start with Docker Compose

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/reference-vault.git
   cd reference-vault
   ```

2. **Start the application**:
   ```bash
   LIBRARY_PATH="/path/to/your/Reference Library" docker compose up -d
   ```
   Replace `/path/to/your/Reference Library` with the local directory on your machine where your reference videos and images live.

3. **Access the web app**:
   Open [http://localhost:4310](http://localhost:4310) in your browser. When initializing or scanning the library in the app interface, use `/library` as your storage path (this matches the container volume mount).

### Running directly with `docker run`

```bash
docker build -t reference-vault:latest .

docker run -d \
  --name reference-vault \
  -p 4310:4310 \
  -v "/path/to/your/Reference Library:/library" \
  reference-vault:latest
```

### Local Development with Docker Compose

For live hot-reloading development inside containers:

```bash
docker compose -f docker-compose.dev.yml up
```

Access the Vite dev server at [http://localhost:5173](http://localhost:5173).

## Philosophy

Reference Vault isn't trying to own your content — it's just here to help you organize it. Your files stay exactly where they are, and all the metadata sits alongside them in plain, readable JSON. That means backups are trivial, migrating somewhere else doesn't require any special tooling, and you're never at the mercy of an app deciding to shut down or change its pricing.

## Built with

- React
- TypeScript
- Fastify
- FFmpeg

Planning to move to Tauri eventually for a proper native desktop app.