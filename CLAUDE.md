# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Real-time Android screen sharing app. An Android device captures its screen as H.264, streams via WebSocket through a Node.js relay server, and a browser viewer decodes/plays it using WebCodecs. Supports real-time annotation overlay from viewer to Android.

## Commands

### Server (Node.js)
```
cd server
npm install
npm start          # Start relay server on port 8080
npm test           # Run tests with vitest
```

### Android
Open `android/ShareScreen/` in Android Studio. Gradle handles the rest.
- Namespace: `com.sharescreen`
- Min SDK 26, Target SDK 36
- Uses Maven repos via Aliyun mirrors (see settings.gradle.kts)

### Docker
```
cd server
docker build -t sharescreen-server .
docker run -p 8080:8080 sharescreen-server
```

## Architecture

```
Android App                      Relay Server                    Browser Viewer
┌─────────────┐   WebSocket     ┌──────────────┐   WebSocket   ┌──────────────┐
│ MediaProjection│  /stream/push  │   Express +   │ /stream/pull/ │   Web viewer │
│   → H264Encoder│ ────────────→ │     ws        │ ────────────→ │  (WebCodecs) │
│   → StreamClient│  (binary)     │  RoomManager  │  (binary)     │  viewer.js   │
└─────────────┘                  └──────────────┘               └──────────────┘
      ↑ annotation (JSON)              ↑ relay annotation              ↓ draw on canvas
      │                                │                               │
      └──── AnnotationOverlay ─────────┘←──────────────────────────────┘
```

### Data Flow

1. **Android → Server**: `ScreenCaptureService` captures screen via `MediaProjection`, feeds to `H264Encoder` (H.264/AVC), `StreamClient` sends encoded frames as binary WebSocket messages to `/stream/push`. Each frame has a 1-byte prefix: `0x00` = config (SPS/PPS), `0x01` = video data.

2. **Server**: `RoomManager` pairs one pusher with one puller per room (6-hex-char room ID). Server relays binary frames push→pull and annotation JSON pull→push. Traffic stats exposed at `/stats`.

3. **Server → Browser**: Viewer connects to `/stream/pull/{roomId}`, receives binary frames. `viewer.js` extracts SPS/PPS, builds AVCC config, decodes with WebCodecs `VideoDecoder`, renders to canvas.

4. **Annotation**: Viewer draws on overlay canvas → sends JSON `{type: "annotation", points: [[x,y],...]}` (normalized 0-1 coords) → server relays to Android → `AnnotationOverlay` renders as system overlay window (auto-clears after 5s).

### Key Source Files

- `server/src/index.js` — Express + WebSocket relay server, push/pull routing, traffic stats
- `server/src/RoomManager.js` — Room lifecycle (create/join/destroy), 1:1 pusher:puller
- `server/public/viewer.js` — WebCodecs H.264 decoder (Annex B → AVCC conversion), annotation drawing
- `android/.../ScreenCaptureService.kt` — Foreground service orchestrating capture pipeline
- `android/.../H264Encoder.kt` — MediaCodec H.264 encoder with config frame caching
- `android/.../StreamClient.kt` — OkHttp WebSocket client for server communication
- `android/.../AnnotationOverlay.kt` — System overlay window rendering annotation strokes
- `android/.../MainActivity.kt` — UI for server URL input, start/stop, permission requests

## Conventions

- Server uses ES modules (`"type": "module"`) with Express 5
- Video frame protocol: 1-byte type prefix (0x00=config, 0x01=video) + raw H.264 payload
- Annotation coordinates are normalized [0,1] relative to video dimensions
- Android targets 720p max (scaled to fit 1280x720, dimensions aligned to 16)
- The server is a simple relay — no transcoding, no storage
- UI strings are in Chinese (zh-CN)
