#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# run.sh — Process all CCTV clips through the detection pipeline.
#
# Usage:
#   bash pipeline/run.sh data/clips data/store_layout.json out/events
#
# Arguments:
#   $1 = directory containing video clips (*.mp4)
#   $2 = path to store_layout.json
#   $3 = output directory for JSONL event files
#   $4 = (optional) API base URL to POST events in real time
#
# The script discovers all .mp4 files in the clip directory, runs
# the detection pipeline on each, and writes one JSONL file per clip.
# If an API URL is provided, events are also POSTed to /events/ingest.
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

CLIP_DIR="${1:?Usage: run.sh <clip_dir> <layout.json> <output_dir> [api_url]}"
LAYOUT="${2:?Usage: run.sh <clip_dir> <layout.json> <output_dir> [api_url]}"
OUTPUT_DIR="${3:?Usage: run.sh <clip_dir> <layout.json> <output_dir> [api_url]}"
API_URL="${4:-}"

mkdir -p "$OUTPUT_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Store Intelligence — Detection Pipeline Runner  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Clip directory : $CLIP_DIR"
echo "  Layout file    : $LAYOUT"
echo "  Output dir     : $OUTPUT_DIR"
echo "  API URL        : ${API_URL:-<none — offline mode>}"
echo ""

COUNT=0
FAILED=0

for clip in "$CLIP_DIR"/*.mp4; do
    [ -f "$clip" ] || continue
    COUNT=$((COUNT + 1))
    BASENAME=$(basename "$clip" .mp4)
    OUTPUT_FILE="$OUTPUT_DIR/${BASENAME}_events.jsonl"

    echo "────────────────────────────────────────────────"
    echo "  [$COUNT] Processing: $BASENAME"
    echo "       → $OUTPUT_FILE"

    CMD="python -m store_intelligence.pipeline.detect --video \"$clip\" --layout \"$LAYOUT\" --output \"$OUTPUT_FILE\""
    if [ -n "$API_URL" ]; then
        CMD="$CMD --api-url \"$API_URL\""
    fi

    if eval "$CMD"; then
        EVENTS=$(wc -l < "$OUTPUT_FILE" 2>/dev/null || echo "0")
        echo "       ✓ Done — $EVENTS events emitted"
    else
        FAILED=$((FAILED + 1))
        echo "       ✗ Failed"
    fi
done

echo ""
echo "════════════════════════════════════════════════════"
echo "  Summary: $COUNT clips processed, $FAILED failed"
echo "  Events written to: $OUTPUT_DIR/"
echo "════════════════════════════════════════════════════"

exit $FAILED
