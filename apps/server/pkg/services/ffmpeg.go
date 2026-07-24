package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
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
		var num, den float64
		if _, err := fmt.Sscanf(st.RFrameRate, "%f/%f", &num, &den); err == nil && den != 0 {
			fps := num / den
			formatted := fmt.Sprintf("%g fps", float64(int(fps*100+0.5))/100.0)
			res.Framerate = &formatted
		} else {
			res.Framerate = &st.RFrameRate
		}
	}

	return res, nil
}

// GenerateThumbnail extracts a thumbnail from a video file at 2s timestamp (or 0s fallback), scaled to 480px width.
func GenerateThumbnail(videoPath, outputPath string) error {
	// Try seeking to 2 seconds first
	cmd := exec.Command(
		"ffmpeg",
		"-y",
		"-ss", "00:00:02",
		"-i", videoPath,
		"-vf", "scale=480:-1",
		"-vframes", "1",
		outputPath,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err == nil {
		return nil
	}

	// Fallback: Seek to 0 seconds if video is short or 2s seek fails
	cmdFallback := exec.Command(
		"ffmpeg",
		"-y",
		"-ss", "00:00:00",
		"-i", videoPath,
		"-vf", "scale=480:-1",
		"-vframes", "1",
		outputPath,
	)
	var stderrFallback bytes.Buffer
	cmdFallback.Stderr = &stderrFallback

	if err := cmdFallback.Run(); err != nil {
		return fmt.Errorf("ffmpeg thumbnail generation failed: %w (stderr: %s)", err, stderrFallback.String())
	}

	return nil
}

// CaptureFrame extracts a frame from a video/media file at a specific timestamp using optimized two-stage seeking.
func CaptureFrame(videoPath string, timestamp float64, outputPath string) error {
	var args []string
	args = append(args, "-y")
	if timestamp > 10 {
		fastSeekInt := int(math.Floor(timestamp - 10))
		slowSeekVal := timestamp - float64(fastSeekInt)
		fastSeek := fmt.Sprintf("%d", fastSeekInt)
		slowSeek := fmt.Sprintf("%.3f", slowSeekVal)
		args = append(args, "-ss", fastSeek, "-i", videoPath, "-ss", slowSeek)
	} else {
		args = append(args, "-i", videoPath, "-ss", fmt.Sprintf("%.3f", timestamp))
	}
	args = append(args, "-vframes", "1", "-q:v", "2", outputPath)

	cmd := exec.Command("ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg frame capture failed: %w (stderr: %s)", err, stderr.String())
	}

	return nil
}

// ChopVideoSegment slices a segment from a main video file into a clip file using x264/aac.
func ChopVideoSegment(mainVideoPath string, start, end float64, outputPath string) error {
	duration := end - start
	if duration < 0 {
		duration = 0
	}
	args := []string{
		"-y",
		"-ss", fmt.Sprintf("%.3f", start),
		"-i", mainVideoPath,
		"-t", fmt.Sprintf("%.3f", duration),
		"-c:v", "libx264",
		"-preset", "ultrafast",
		"-crf", "18",
		"-c:a", "aac",
		outputPath,
	}

	cmd := exec.Command("ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg clip chopping failed: %w (stderr: %s)", err, stderr.String())
	}

	return nil
}

