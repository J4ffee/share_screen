package com.sharescreen

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.View
import android.view.WindowManager
import org.json.JSONArray

@SuppressLint("ViewConstructor")
class AnnotationOverlay(context: Context) : View(context) {

    private val paint = Paint().apply {
        color = Color.RED
        strokeWidth = 6f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        isAntiAlias = true
    }

    private val strokes = mutableListOf<Path>()
    private val handler = Handler(Looper.getMainLooper())

    fun addStroke(points: JSONArray, screenW: Int, screenH: Int) {
        val path = Path()
        for (i in 0 until points.length()) {
            val point = points.getJSONArray(i)
            val x = (point.getDouble(0) * screenW).toFloat()
            val y = (point.getDouble(1) * screenH).toFloat()
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        strokes.add(path)
        invalidate()

        // Auto-clear after 5 seconds
        handler.postDelayed({
            strokes.remove(path)
            invalidate()
        }, 5000)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        for (stroke in strokes) {
            canvas.drawPath(stroke, paint)
        }
    }

    companion object {
        fun show(context: Context, points: JSONArray) {
            Handler(Looper.getMainLooper()).post {
                val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
                val metrics = DisplayMetrics()
                windowManager.defaultDisplay.getRealMetrics(metrics)
                val screenW = metrics.widthPixels
                val screenH = metrics.heightPixels

                val overlay = AnnotationOverlay(context)
                val params = WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    android.graphics.PixelFormat.TRANSLUCENT
                )

                overlay.addStroke(points, screenW, screenH)
                windowManager.addView(overlay, params)

                Handler(Looper.getMainLooper()).postDelayed({
                    try {
                        windowManager.removeView(overlay)
                    } catch (_: Exception) {}
                }, 5500)
            }
        }
    }
}
