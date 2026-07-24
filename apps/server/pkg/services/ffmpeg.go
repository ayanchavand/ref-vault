package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
)

type ProbeResult struct {
	Width     *int    `json:"width"`
	Height    *int    `json:"height"`
	Framerate *string `json:"framerate"`
}

type ffprobeStream struct {
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	RFrameRate string `json:"r_frame_rate"`
}

type ffprobeOutput struct {
	Streams []ffprobeStream `json:"streams"`
}

// ProbeVideo runs ffprobe on the target video file to extract width, height, and framerate.
func ProbeVideo(filePath string) (ProbeResult, error) {
	cmd := exec.Command(
		"ffprobe",
		"-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height,r_frame_rate",
		"-of", "json",
		filePath,
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return ProbeResult{}, fmt.Errorf("ffprobe failed: %w (stderr: %s)", err, stderr.String())
	}

	var out ffprobeOutput
	if err := json.Unmarshal(stdout.Bytes(), &out); err != nil {
		return ProbeResult{}, fmt.Errorf("failed to parse ffprobe json: %w", err)
	}

	if len(out.Streams) == 0 {
		return ProbeResult{}, nil
	}

	st := out.Streams[0]
	res := ProbeResult{
		Width:  &st.Width,
		Height: &st.Height,
	}
	if st.RFrameRate != "" {
		res.Framerate = &st.RFrameRate
	}

	return res, nil
}

// GenerateThumbnail extracts a thumbnail from a video file at 1s timestamp using ffmpeg.
func GenerateThumbnail(videoPath, outputPath string) error {
	cmd := exec.Command(
		"ffmpeg",
		"-ss", "00:00:01",
		"-i", videoPath,
		"-vframes", "1",
		"-q:v", "2",
		"-y",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg thumbnail generation failed: %w (stderr: %s)", err, stderr.String())
	}

	return nil
}

// CaptureFrame extracts a frame from a video/media file at a specific timestamp in seconds.
func CaptureFrame(videoPath string, timestamp float64, outputPath string) error {
	timestampStr := fmt.Sprintf("%.3f", timestamp)
	cmd := exec.Command(
		"ffmpeg",
		"-ss", timestampStr,
		"-i", videoPath,
		"-vframes", "1",
		"-q:v", "2",
		"-y",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg frame capture failed: %w (stderr: %s)", err, stderr.String())
	}

	return nil
}
