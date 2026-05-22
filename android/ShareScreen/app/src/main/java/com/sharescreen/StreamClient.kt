package com.sharescreen

import android.util.Log
import okhttp3.*
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class StreamClient {
    private var webSocket: WebSocket? = null
    private var roomId: String? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    var onConnected: (() -> Unit)? = null
    var onRoomCreated: ((String) -> Unit)? = null
    var onViewerJoined: (() -> Unit)? = null
    var onDisconnected: (() -> Unit)? = null
    var onError: ((String) -> Unit)? = null
    var onAnnotation: ((org.json.JSONArray) -> Unit)? = null

    fun connect(serverUrl: String) {
        val url = serverUrl.trimEnd('/')
        val wsUrl = url.replace("http://", "ws://").replace("https://", "wss://")
        val fullUrl = "$wsUrl/stream/push"
        Log.d("StreamClient", "Connecting to: $fullUrl")

        val request = Request.Builder().url(fullUrl).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("StreamClient", "WebSocket opened")
                onConnected?.invoke()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d("StreamClient", "Message received: $text")
                val json = JSONObject(text)
                when (json.getString("type")) {
                    "room_created" -> {
                        roomId = json.getString("roomId")
                        onRoomCreated?.invoke(roomId!!)
                    }
                    "viewer_joined" -> onViewerJoined?.invoke()
                    "annotation" -> onAnnotation?.invoke(json.getJSONArray("points"))
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("StreamClient", "WebSocket closing: $code $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("StreamClient", "WebSocket closed: $code $reason")
                onDisconnected?.invoke()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("StreamClient", "WebSocket failure: ${t.message}", t)
                onError?.invoke(t.message ?: "Connection failed")
                onDisconnected?.invoke()
            }
        })
    }

    fun sendFrame(data: ByteArray) {
        webSocket?.send(data.toByteString())
    }

    fun disconnect() {
        webSocket?.close(1000, "Stopping")
        webSocket = null
        roomId = null
    }

    fun getRoomId(): String? = roomId
}
