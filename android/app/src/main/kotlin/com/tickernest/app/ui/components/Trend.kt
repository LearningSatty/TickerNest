package com.tickernest.app.ui.components

import androidx.compose.ui.graphics.Color
import com.tickernest.app.ui.Flat
import com.tickernest.app.ui.Gain
import com.tickernest.app.ui.Loss
import java.math.BigDecimal

fun trendColor(v: BigDecimal): Color = when {
    v.signum() == 0 -> Flat
    v.signum() > 0 -> Gain
    else -> Loss
}
