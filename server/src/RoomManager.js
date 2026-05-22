import { randomBytes } from 'node:crypto'

export class RoomManager {
  constructor() {
    /** @type {Map<string, {pushSocket: object, pullSocket: object|null}>} */
    this.rooms = new Map()
  }

  generateRoomId() {
    return randomBytes(3).toString('hex')
  }

  createRoom(pushSocket) {
    let roomId
    do {
      roomId = this.generateRoomId()
    } while (this.rooms.has(roomId))

    this.rooms.set(roomId, { pushSocket, pullSocket: null })
    return roomId
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) ?? null
  }

  addPullSocket(roomId, pullSocket) {
    const room = this.rooms.get(roomId)
    if (!room || room.pullSocket) return false
    room.pullSocket = pullSocket
    return true
  }

  destroyRoom(roomId) {
    this.rooms.delete(roomId)
  }
}
