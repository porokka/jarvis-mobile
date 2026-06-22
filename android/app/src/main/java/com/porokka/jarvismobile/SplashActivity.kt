package com.porokka.jarvismobile

import android.animation.ObjectAnimator
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor     = Color.parseColor("#06060b")
        window.navigationBarColor = Color.parseColor("#06060b")

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#06060b"))
        }

        val title = TextView(this).apply {
            text      = "J.A.R.V.I.S"
            textSize  = 32f
            setTextColor(Color.parseColor("#40a0f0"))
            typeface  = Typeface.MONOSPACE
            letterSpacing = 0.4f
            gravity   = Gravity.CENTER
            setShadowLayer(24f, 0f, 0f, Color.parseColor("#2060c0"))
            alpha     = 0f
        }

        val sub = TextView(this).apply {
            text      = "by Sami Porokka"
            textSize  = 10f
            setTextColor(Color.parseColor("#3a4a5a"))
            typeface  = Typeface.MONOSPACE
            letterSpacing = 0.3f
            gravity   = Gravity.CENTER
            setPadding(0, 16, 0, 0)
            alpha     = 0f
        }

        val divider = View(this).apply {
            setBackgroundColor(Color.parseColor("#1a2a3a"))
            val lp = LinearLayout.LayoutParams(200, 1)
            lp.gravity   = Gravity.CENTER_HORIZONTAL
            lp.topMargin = 40
            layoutParams = lp
            alpha = 0f
        }

        root.addView(title)
        root.addView(sub)
        root.addView(divider)
        setContentView(root)

        // Fade in
        ObjectAnimator.ofFloat(title,   "alpha", 0f, 1f).apply { duration = 600; startDelay = 100; start() }
        ObjectAnimator.ofFloat(sub,     "alpha", 0f, 1f).apply { duration = 600; startDelay = 400; start() }
        ObjectAnimator.ofFloat(divider, "alpha", 0f, 1f).apply { duration = 600; startDelay = 600; start() }

        Handler(Looper.getMainLooper()).postDelayed({
            startActivity(Intent(this, MainActivity::class.java))
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            finish()
        }, 1600)
    }
}
