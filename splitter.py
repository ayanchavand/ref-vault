import json
import subprocess
import sys
from pathlib import Path

def format_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds % 1) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

def get_next_clip_index(output_dir: Path) -> int:
    if not output_dir.exists():
        return 1
    import re
    max_index = 0
    pattern = re.compile(r'^scene_(\d+)\.mp4$', re.IGNORECASE)
    for file in output_dir.iterdir():
        if file.is_file():
            match = pattern.match(file.name)
            if match:
                idx = int(match.group(1))
                if idx > max_index:
                    max_index = idx
    return max_index + 1

def process_split_plan(plan_file: Path):
    print(f"\n========================================")
    print(f"Processing split plan: {plan_file.name}")
    print(f"Location: {plan_file.parent}")
    print(f"========================================")
    
    try:
        with open(plan_file, "r", encoding="utf-8") as f:
            plan = json.load(f)
    except Exception as e:
        print(f"Error reading plan file: {e}")
        return

    segments = plan.get("segments", [])
    if not segments:
        print("No segments found in split plan.")
        return

    video_dir = plan_file.parent
    
    # Locate main video
    main_video = video_dir / "main.mp4"
    if not main_video.exists():
        print(f"Error: main.mp4 not found in {video_dir}")
        return

    output_dir = video_dir / "clips"
    output_dir.mkdir(exist_ok=True)

    clips_metadata = {}

    start_num = get_next_clip_index(output_dir)

    for idx, seg in enumerate(segments):
        start_seconds = seg.get("start", 0)
        end_seconds = seg.get("end", 0)
        tags = seg.get("tags", [])
        notes = seg.get("notes", "")
        rating = seg.get("rating", 0)

        clip_index = start_num + idx
        clip_name = f"scene_{clip_index:02d}"
        output_file = output_dir / f"{clip_name}.mp4"

        start_tc = format_time(start_seconds)
        end_tc = format_time(end_seconds)

        print(f"Chop: {clip_name}.mp4 ({start_tc} -> {end_tc})")

        duration = max(0.0, end_seconds - start_seconds)
        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(start_seconds),
            "-i", str(main_video),
            "-t", str(duration),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "18",
            "-c:a", "aac",
            str(output_file),
        ]
        
        try:
            # Run silently or capture output
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except subprocess.CalledProcessError as e:
            print(f"  ffmpeg failed for segment {idx + 1}: {e}")
            continue

        # Prepare metadata
        meta = {"tags": tags}
        if notes:
            meta["notes"] = notes
        if rating:
            meta["rating"] = rating
        
        clips_metadata[clip_name] = meta

    # Write clips.json
    clips_json_path = video_dir / "clips.json"
    
    # If clips.json already exists, merge new metadata into it
    existing_metadata = {}
    if clips_json_path.exists():
        try:
            with open(clips_json_path, "r", encoding="utf-8") as f:
                existing_metadata = json.load(f)
        except Exception:
            pass

    merged_metadata = {**existing_metadata, **clips_metadata}

    try:
        with open(clips_json_path, "w", encoding="utf-8") as f:
            json.dump(merged_metadata, f, indent=2)
        print(f"\nSaved metadata to clips.json")
    except Exception as e:
        print(f"Error saving clips.json: {e}")

    print("Done processing project!")

def main():
    # If a path is provided as argument, use it; otherwise use current working directory
    target_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    
    print(f"Scanning for split_plan.json in: {target_dir.resolve()}")
    
    # Recursively find split_plan.json
    plans = list(target_dir.rglob("split_plan.json"))
    
    if not plans:
        print("No split_plan.json files found.")
        return

    print(f"Found {len(plans)} split plan(s) to process.")
    for plan in plans:
        process_split_plan(plan)

if __name__ == "__main__":
    main()
