import express from 'express'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { RoomManager } from './RoomManager.js'

const PORT = 8080
const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })
const roomManager = new RoomManager()

// Traffic stats
const stats = {
  totalBytes: 0,
  lastBytes: 0,
  lastTime: Date.now(),
  bitrateMbps: 0
}

setInterval(() => {
  const now = Date.now()
  const elapsed = (now - stats.lastTime) / 1000
  if (elapsed > 0) {
    stats.bitrateMbps = ((stats.totalBytes - stats.lastBytes) * 8 / elapsed / 1_000_000).toFixed(2)
  }
  stats.lastBytes = stats.totalBytes
  stats.lastTime = now
}, 1000)

app.use(express.static('public'))

app.get('/stats', (req, res) => {
  res.json({
    rooms: roomManager.rooms.size,
    bitrateMbps: stats.bitrateMbps,
    totalMB: (stats.totalBytes / 1024 / 1024).toFixed(2)
  })
})

wss.on('connection', (ws, req) => {
  const path = req.url
  console.log(`[WS] New connection: ${path}`)

  if (path === '/stream/push') {
    handlePush(ws)
  } else if (path.startsWith('/stream/pull/')) {
    const roomId = path.replace('/stream/pull/', '')
    handlePull(ws, roomId)
  } else {
    ws.close(4004, 'Unknown endpoint')
  }
})

function handlePush(ws) {
  const roomId = roomManager.createRoom(ws)
  console.log(`[ROOM] Created room: ${roomId}`)
  ws.send(JSON.stringify({ type: 'room_created', roomId }))

  ws.on('message', (data) => {
    stats.totalBytes += data.byteLength || data.length || 0
    const room = roomManager.getRoom(roomId)
    if (room?.pullSocket?.readyState === 1) {
      room.pullSocket.send(data)
    }
  })

  ws.on('close', () => {
    console.log(`[ROOM] Pusher disconnected, destroying room: ${roomId}`)
    const room = roomManager.getRoom(roomId)
    if (room?.pullSocket?.readyState === 1) {
      room.pullSocket.close(1000, 'Pusher disconnected')
    }
    roomManager.destroyRoom(roomId)
  })

  ws.on('error', (err) => {
    console.error(`[WS] Pusher error (${roomId}):`, err.message)
  })
}

function handlePull(ws, roomId) {
  const room = roomManager.getRoom(roomId)
  if (!room) {
    console.log(`[ROOM] Pull failed, room not found: ${roomId}`)
    ws.close(4004, 'Room not found')
    return
  }
  if (!roomManager.addPullSocket(roomId, ws)) {
    console.log(`[ROOM] Pull failed, room already has viewer: ${roomId}`)
    ws.close(4003, 'Room already has a viewer')
    return
  }

  console.log(`[ROOM] Viewer joined room: ${roomId}`)
  if (room.pushSocket.readyState === 1) {
    room.pushSocket.send(JSON.stringify({ type: 'viewer_joined' }))
  }

  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'annotation') {
          const currentRoom = roomManager.getRoom(roomId)
          if (currentRoom?.pushSocket?.readyState === 1) {
            console.log(`[ANNOTATION] Forwarding from viewer to Android`)
            currentRoom.pushSocket.send(data.toString())
          }
        }
      } catch (_) {}
    }
  })

  ws.on('close', () => {
    console.log(`[ROOM] Viewer disconnected from room: ${roomId}`)
    const currentRoom = roomManager.getRoom(roomId)
    if (currentRoom) {
      currentRoom.pullSocket = null
    }
  })

  ws.on('error', (err) => {
    console.error(`[WS] Viewer error (${roomId}):`, err.message)
  })
}

// Print stats to console every 5 seconds
setInterval(() => {
  const rooms = roomManager.rooms.size
  console.log(`[STATS] Rooms: ${rooms} | Bitrate: ${stats.bitrateMbps} Mbps | Total: ${(stats.totalBytes / 1024 / 1024).toFixed(2)} MB`)
}, 5000)

server.listen(PORT, () => {
  console.log(`Relay Server running at http://localhost:${PORT}`)
})
