package com.sharescreen

import android.media.MediaCodec
import android.media.MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface
import android.media.MediaFormat
import android.view.Surface

class H264Encoder {
    private var encoder: MediaCodec? = null
    private var surface: Surface? = null
    @Volatile
    private var isRunning = false
    private var cachedConfig: ByteArray? = null

    var onFrame: ((ByteArray) -> Unit)? = null

    fun start(width: Int, height: Int, bitrate: Int = 4_000_000, fps: Int = 30) {
        if (isRunning) return

        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, fps)
            setInteger(MediaFormat.KEY_COLOR_FORMAT, COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, width * height)
        }

        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).apply {
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            surface = createInputSurface()
            start()
        }
        encoder = codec

        isRunning = true
        Thread {
            drainOutput(codec)
        }.start()
    }

    private fun drainOutput(codec: MediaCodec) {
        val bufferInfo = MediaCodec.BufferInfo()

        while (isRunning) {
            try {
                val index = codec.dequeueOutputBuffer(bufferInfo, 10_000)
                if (index < 0) continue

                val outputBuffer = codec.getOutputBuffer(index) ?: continue

                if (bufferInfo.size > 0) {
                    val data = ByteArray(bufferInfo.size)
                    outputBuffer.position(bufferInfo.offset)
                    outputBuffer.get(data)

                    val isConfig = bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (isConfig) {
                        // Cache SPS/PPS config
                        cachedConfig = data
                        // Send config frame
                        val frame = ByteArray(data.size + 1)
                        frame[0] = 0x00
                        System.arraycopy(data, 0, frame, 1, data.size)
                        onFrame?.invoke(frame)
                    } else {
                        // For IDR keyframes, resend cached config first
                        val isKeyframe = bufferInfo.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0
                        if (isKeyframe) {
                            cachedConfig?.let { config ->
                                val configFrame = ByteArray(config.size + 1)
                                configFrame[0] = 0x00
                                System.arraycopy(config, 0, configFrame, 1, config.size)
                                onFrame?.invoke(configFrame)
                            }
                        }
                        // Send video frame
                        val frame = ByteArray(data.size + 1)
                        frame[0] = 0x01
                        System.arraycopy(data, 0, frame, 1, data.size)
                        onFrame?.invoke(frame)
                    }
                }

                codec.releaseOutputBuffer(index, false)
            } catch (e: IllegalStateException) {
                break
            }
        }
    }

    fun getSurface(): Surface? = surface

    fun stop() {
        isRunning = false
        try {
            encoder?.stop()
            encoder?.release()
        } catch (_: Exception) {}
        try {
            surface?.release()
        } catch (_: Exception) {}
        encoder = null
        surface = null
        cachedConfig = null
    }
}
