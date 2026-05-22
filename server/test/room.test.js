import { describe, it, expect } from 'vitest'
import { RoomManager } from '../src/RoomManager.js'

describe('RoomManager', () => {
  it('should create a room and return roomId', () => {
    const manager = new RoomManager()
    const pushSocket = { readyState: 1 }
    const roomId = manager.createRoom(pushSocket)
    expect(roomId).toBeDefined()
    expect(typeof roomId).toBe('string')
    expect(roomId.length).toBe(6)
  })

  it('should find room by roomId', () => {
    const manager = new RoomManager()
    const pushSocket = { readyState: 1 }
    const roomId = manager.createRoom(pushSocket)
    const room = manager.getRoom(roomId)
    expect(room).toBeDefined()
    expect(room.pushSocket).toBe(pushSocket)
    expect(room.pullSocket).toBeNull()
  })

  it('should return null for non-existent room', () => {
    const manager = new RoomManager()
    expect(manager.getRoom('nope')).toBeNull()
  })

  it('should add a pull socket to existing room', () => {
    const manager = new RoomManager()
    const pushSocket = { readyState: 1 }
    const pullSocket = { readyState: 1 }
    const roomId = manager.createRoom(pushSocket)
    const result = manager.addPullSocket(roomId, pullSocket)
    expect(result).toBe(true)
    const room = manager.getRoom(roomId)
    expect(room.pullSocket).toBe(pullSocket)
  })

  it('should reject pull socket if room already has one', () => {
    const manager = new RoomManager()
    const pushSocket = { readyState: 1 }
    const roomId = manager.createRoom(pushSocket)
    manager.addPullSocket(roomId, { readyState: 1 })
    const result = manager.addPullSocket(roomId, { readyState: 1 })
    expect(result).toBe(false)
  })

  it('should remove room on destroy', () => {
    const manager = new RoomManager()
    const pushSocket = { readyState: 1 }
    const roomId = manager.createRoom(pushSocket)
    manager.destroyRoom(roomId)
    expect(manager.getRoom(roomId)).toBeNull()
  })
})
