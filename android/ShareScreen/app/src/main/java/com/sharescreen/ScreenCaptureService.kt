package com.sharescreen

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.IBinder
import android.view.WindowManager

class ScreenCaptureService : Service() {

    private val CHANNEL_ID = "screen_capture"
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: android.hardware.display.VirtualDisplay? = null
    private var encoder: H264Encoder? = null
    private var streamClient: StreamClient? = null

    companion object {
        var resultCode: Int = 0
        var data: Intent? = null
        var serverUrl: String = ""
        var isRunning = false
        var statusCallback: ((String) -> Unit)? = null
        var roomIdCallback: ((String) -> Unit)? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(1, buildNotification("正在连接..."))
        isRunning = true

        startCapture()
    }

    private fun startCapture() {
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = projectionManager.getMediaProjection(resultCode, data!!)
        mediaProjection!!.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                stopSelf()
            }
        }, null)

        val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = windowManager.defaultDisplay
        val width = metrics.width
        val height = metrics.height

        val scale = minOf(1280f / width, 720f / height)
        val targetWidth = (width * scale).toInt() and 0xFFF0
        val targetHeight = (height * scale).toInt() and 0xFFF0

        // Create StreamClient first so it's ready before encoder starts sending frames
        streamClient = StreamClient()
        streamClient!!.onConnected = {
            updateNotification("已连接服务器")
            statusCallback?.invoke("已连接服务器")
        }
        streamClient!!.onRoomCreated = { roomId ->
            updateNotification("投屏中 - 房间: $roomId")
            statusCallback?.invoke("投屏中")
            roomIdCallback?.invoke(roomId)
        }
        streamClient!!.onViewerJoined = {
            updateNotification("投屏中 - 有观看者")
            statusCallback?.invoke("有观看者")
        }
        streamClient!!.onError = { msg ->
            statusCallback?.invoke("错误: $msg")
        }
        streamClient!!.onAnnotation = { points ->
            AnnotationOverlay.show(this@ScreenCaptureService, points)
        }
        streamClient!!.onDisconnected = {
            statusCallback?.invoke("已断开")
            stopSelf()
        }
        streamClient!!.connect(serverUrl)

        // Start encoder after StreamClient is created
        encoder = H264Encoder()
        encoder!!.onFrame = { frameData ->
            streamClient?.sendFrame(frameData)
        }
        encoder!!.start(targetWidth, targetHeight)
        val surface = encoder!!.getSurface()!!

        virtualDisplay = mediaProjection!!.createVirtualDisplay(
            "ShareScreen",
            targetWidth, targetHeight, resources.displayMetrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            surface, null, null
        )
    }

    override fun onDestroy() {
        isRunning = false
        virtualDisplay?.release()
        encoder?.stop()
        streamClient?.disconnect()
        mediaProjection?.stop()
        statusCallback?.invoke("已停止")
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(CHANNEL_ID, "屏幕投屏", NotificationManager.IMPORTANCE_LOW)
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(text: String): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("ShareScreen")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(1, buildNotification(text))
    }
}
