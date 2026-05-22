package com.sharescreen

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var serverUrlInput: EditText
    private lateinit var startBtn: Button
    private lateinit var statusText: TextView
    private lateinit var roomIdText: TextView

    private var isStreaming = false

    companion object {
        private const val REQUEST_MEDIA_PROJECTION = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        serverUrlInput = findViewById(R.id.serverUrlInput)
        startBtn = findViewById(R.id.startBtn)
        statusText = findViewById(R.id.statusText)
        roomIdText = findViewById(R.id.roomIdText)

        startBtn.setOnClickListener {
            if (!isStreaming) {
                if (!Settings.canDrawOverlays(this)) {
                    val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName"))
                    startActivity(intent)
                    statusText.text = "请先授予悬浮窗权限"
                } else {
                    requestProjection()
                }
            } else {
                stopService(Intent(this, ScreenCaptureService::class.java))
                isStreaming = false
                startBtn.text = "开始投屏"
                statusText.text = "已停止"
                roomIdText.visibility = View.GONE
            }
        }
    }

    override fun onResume() {
        super.onResume()
        ScreenCaptureService.statusCallback = { status ->
            runOnUiThread { statusText.text = status }
        }
        ScreenCaptureService.roomIdCallback = { roomId ->
            runOnUiThread {
                roomIdText.text = "房间 ID: $roomId"
                roomIdText.visibility = View.VISIBLE
            }
        }
        if (ScreenCaptureService.isRunning) {
            isStreaming = true
            startBtn.text = "停止投屏"
        }
    }

    @Suppress("DEPRECATION")
    private fun requestProjection() {
        val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_MEDIA_PROJECTION)
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_MEDIA_PROJECTION) {
            if (resultCode == RESULT_OK && data != null) {
                ScreenCaptureService.resultCode = resultCode
                ScreenCaptureService.data = data
                ScreenCaptureService.serverUrl = serverUrlInput.text.toString().trim()

                val intent = Intent(this, ScreenCaptureService::class.java)
                startForegroundService(intent)

                isStreaming = true
                startBtn.text = "停止投屏"
                statusText.text = "启动中..."
            } else {
                statusText.text = "需要授权才能投屏"
            }
        }
    }
}
