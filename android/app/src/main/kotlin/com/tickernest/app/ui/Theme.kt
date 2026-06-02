package com.tickernest.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Bg = Color(0xFF0B0D10)
private val BgSoft = Color(0xFF13161B)
private val Ink = Color(0xFFE7EAF0)
private val InkMuted = Color(0xFF9AA3B2)
private val Accent = Color(0xFF7C5CFF)
val Gain = Color(0xFF22C55E)
val Loss = Color(0xFFEF4444)
val Flat = Color(0xFF94A3B8)
val Line = Color(0xFF1F242C)

private val DarkScheme = darkColorScheme(
    background = Bg,
    surface = BgSoft,
    onBackground = Ink,
    onSurface = Ink,
    primary = Accent,
    onPrimary = Color.White,
    outline = Line,
    surfaceVariant = BgSoft,
    onSurfaceVariant = InkMuted,
)

@Composable
fun TickerNestTheme(content: @Composable () -> Unit) {
    val scheme = if (isSystemInDarkTheme()) DarkScheme else lightColorScheme()
    MaterialTheme(colorScheme = scheme, content = content)
}
