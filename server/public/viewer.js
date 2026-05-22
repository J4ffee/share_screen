;(function () {
  let ws = null
  let decoder = null
  let canvas = null
  let ctx = null
  let spsNAL = null
  let ppsNAL = null
  let configured = false
  let frameCount = 0
  let annotating = false
  let drawing = false
  let currentStroke = []

  const video = document.getElementById('video')
  const roomIdInput = document.getElementById('roomId')
  const connectBtn = document.getElementById('connectBtn')
  const annotateBtn = document.getElementById('annotateBtn')
  const annotateCanvas = document.getElementById('annotateCanvas')
  const annotateCtx = annotateCanvas.getContext('2d')
  const statusEl = document.getElementById('status')
  const videoWrap = document.querySelector('.video-wrap')

  window.toggleConnection = function () {
    if (ws) {
      disconnect()
    } else {
      connect()
    }
  }

  function connect() {
    const roomId = roomIdInput.value.trim()
    if (!roomId) return

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${location.host}/stream/pull/${roomId}`

    ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setStatus('已连接，等待视频流...', '#fa0')
      initDecoder()
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') return
      handleFrame(event.data)
    }

    ws.onclose = () => {
      setStatus('已断开', '#888')
      cleanup()
    }

    ws.onerror = () => {
      setStatus('连接失败', '#c44')
    }

    setStatus('连接中...', '#fa0')
  }

  function disconnect() {
    if (ws) ws.close()
    cleanup()
  }

  function initDecoder() {
    if (!('VideoDecoder' in window)) {
      setStatus('浏览器不支持 WebCodecs，请使用最新版 Chrome', '#c44')
      return
    }

    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.style.maxWidth = '100%'
      canvas.style.maxHeight = '100%'
      canvas.style.background = '#000'
      video.parentNode.replaceChild(canvas, video)
    }
    ctx = canvas.getContext('2d')

    decoder = new VideoDecoder({
      output: (frame) => {
        canvas.width = frame.displayWidth
        canvas.height = frame.displayHeight
        ctx.drawImage(frame, 0, 0)
        frame.close()
        frameCount++
        if (frameCount === 1) {
          setStatus('播放中', '#4a9')
          connectBtn.textContent = '断开'
          connectBtn.classList.add('connected')
        }
      },
      error: (e) => {
        console.error('Decoder error:', e)
        setStatus('解码错误', '#c44')
      }
    })
  }

  function handleFrame(data) {
    if (!decoder) return

    const buf = new Uint8Array(data)
    const frameType = buf[0]
    const payload = buf.slice(1)

    if (frameType === 0x00) {
      extractSPSPPS(payload)
      return
    }

    if (!configured) {
      if (!spsNAL || !ppsNAL) return
      try {
        const desc = buildAVCC(spsNAL, ppsNAL)
        decoder.configure({
          codec: 'avc1.64001F',
          description: desc
        })
        configured = true
        console.log('Decoder configured successfully')
      } catch (e) {
        console.error('Configure error:', e)
        setStatus('配置解码器失败: ' + e.message, '#c44')
        return
      }
    }

    if (decoder.state === 'closed') return

    // Convert Annex B (start codes) to AVCC (length-prefixed) for each frame
    const avccData = annexBToAVCC(payload)
    const isKey = hasIDR(payload)

    try {
      const chunk = new EncodedVideoChunk({
        type: isKey ? 'key' : 'delta',
        timestamp: performance.now() * 1000,
        data: avccData
      })
      decoder.decode(chunk)
    } catch (e) {
      console.error('Decode chunk error:', e)
      configured = false
      if (decoder.state !== 'closed') {
        try { decoder.reset() } catch (_) {}
      }
      spsNAL = null
      ppsNAL = null
    }
  }

  // Extract SPS and PPS NAL units from config frame
  function extractSPSPPS(data) {
    const nals = splitNals(data)
    for (const nal of nals) {
      if (nal.length === 0) continue
      const type = nal[0] & 0x1f
      if (type === 7) {
        spsNAL = nal
        console.log('SPS:', nal.length, 'bytes')
      }
      if (type === 8) {
        ppsNAL = nal
        console.log('PPS:', nal.length, 'bytes')
      }
    }
  }

  // Split Annex B stream into individual NAL units
  function splitNals(data) {
    const nals = []
    // Find all start code positions (prefer 4-byte over 3-byte)
    const starts = []
    for (let i = 0; i < data.length - 3; i++) {
      if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
        starts.push(i + 4)
        i += 3
      } else if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
        starts.push(i + 3)
        i += 2
      }
    }

    for (let s = 0; s < starts.length; s++) {
      const begin = starts[s]
      const end = (s + 1 < starts.length) ? starts[s + 1] - 4 : data.length
      if (begin < end) {
        nals.push(data.slice(begin, end))
      }
    }
    return nals
  }

  // Convert Annex B NAL units to AVCC format (4-byte length prefix)
  function annexBToAVCC(data) {
    const nals = splitNals(data)
    if (nals.length === 0) return data

    let totalLen = 0
    for (const nal of nals) totalLen += 4 + nal.length

    const result = new Uint8Array(totalLen)
    let offset = 0
    for (const nal of nals) {
      result[offset] = (nal.length >> 24) & 0xFF
      result[offset + 1] = (nal.length >> 16) & 0xFF
      result[offset + 2] = (nal.length >> 8) & 0xFF
      result[offset + 3] = nal.length & 0xFF
      result.set(nal, offset + 4)
      offset += 4 + nal.length
    }

    return result
  }

  // Build AVCC configuration record for decoder.configure()
  function buildAVCC(sps, pps) {
    const bytes = []
    bytes.push(1)           // version
    bytes.push(sps[1])      // profile
    bytes.push(sps[2])      // compat
    bytes.push(sps[3])      // level
    bytes.push(0xFF)        // lengthSizeMinusOne = 4
    bytes.push(0xE1)        // numSPS = 1
    bytes.push((sps.length >> 8) & 0xFF)
    bytes.push(sps.length & 0xFF)
    for (let i = 0; i < sps.length; i++) bytes.push(sps[i])
    bytes.push(1)            // numPPS = 1
    bytes.push((pps.length >> 8) & 0xFF)
    bytes.push(pps.length & 0xFF)
    for (let i = 0; i < pps.length; i++) bytes.push(pps[i])

    return new Uint8Array(bytes).buffer
  }

  function hasIDR(data) {
    const nals = splitNals(data)
    for (const nal of nals) {
      if (nal.length > 0 && (nal[0] & 0x1f) === 5) return true
    }
    return false
  }

  function cleanup() {
    ws = null
    configured = false
    spsNAL = null
    ppsNAL = null
    frameCount = 0
    annotating = false
    annotateCanvas.style.display = 'none'
    annotateBtn.style.display = 'none'
    annotateBtn.classList.remove('annotate')
    if (decoder && decoder.state !== 'closed') {
      try { decoder.close() } catch (_) {}
    }
    decoder = null
    connectBtn.textContent = '连接'
    connectBtn.classList.remove('connected')
  }

  function setStatus(text, color) {
    statusEl.textContent = text
    statusEl.style.color = color || '#888'
  }

  // --- Annotation ---
  function getVideoRect() {
    // Use the actual video/canvas element rect, not the wrapper
    const target = canvas || video
    return target ? target.getBoundingClientRect() : videoWrap.getBoundingClientRect()
  }

  function resizeAnnotateCanvas() {
    const rect = getVideoRect()
    const wrapRect = videoWrap.getBoundingClientRect()
    // Position annotation canvas to exactly overlay the video element
    annotateCanvas.style.left = (rect.left - wrapRect.left) + 'px'
    annotateCanvas.style.top = (rect.top - wrapRect.top) + 'px'
    annotateCanvas.style.width = rect.width + 'px'
    annotateCanvas.style.height = rect.height + 'px'
    annotateCanvas.width = rect.width
    annotateCanvas.height = rect.height
  }

  window.toggleAnnotate = function () {
    annotating = !annotating
    if (annotating) {
      annotateCanvas.style.display = 'block'
      annotateBtn.classList.add('annotate')
      resizeAnnotateCanvas()
    } else {
      annotateCanvas.style.display = 'none'
      annotateBtn.classList.remove('annotate')
      annotateCtx.clearRect(0, 0, annotateCanvas.width, annotateCanvas.height)
    }
  }

  annotateCanvas.addEventListener('mousedown', (e) => {
    if (!annotating) return
    drawing = true
    currentStroke = []
    const rect = annotateCanvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    currentStroke.push([x, y])
    annotateCtx.beginPath()
    annotateCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
    annotateCtx.strokeStyle = 'red'
    annotateCtx.lineWidth = 3
    annotateCtx.lineCap = 'round'
    annotateCtx.lineJoin = 'round'
  })

  annotateCanvas.addEventListener('mousemove', (e) => {
    if (!drawing || !annotating) return
    const rect = annotateCanvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    currentStroke.push([x, y])
    annotateCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    annotateCtx.stroke()
  })

  annotateCanvas.addEventListener('mouseup', () => {
    if (!drawing) return
    drawing = false
    if (currentStroke.length > 1 && ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'annotation', points: currentStroke }))
    }
    currentStroke = []
    // Auto-clear after 5 seconds
    setTimeout(() => {
      annotateCtx.clearRect(0, 0, annotateCanvas.width, annotateCanvas.height)
    }, 5000)
  })

  annotateCanvas.addEventListener('mouseleave', () => {
    if (drawing) {
      drawing = false
      if (currentStroke.length > 1 && ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'annotation', points: currentStroke }))
      }
      currentStroke = []
    }
  })

  // Show annotate button when connected
  const origOnOpen = () => {}
  window.addEventListener('DOMContentLoaded', () => {
    const origConnect = window.toggleConnection
  })

  // Patch: show annotate button after connection established
  const origSetStatus = setStatus
  setStatus = function (text, color) {
    origSetStatus(text, color)
    if (text === '播放中' || text === '已连接，等待视频流...') {
      annotateBtn.style.display = 'inline-block'
    }
  }
})()
