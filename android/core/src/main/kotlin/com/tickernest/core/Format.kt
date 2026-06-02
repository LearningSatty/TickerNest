package com.tickernest.core

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Money formatting. Same rules as the web client (Indian lakh/crore for INR,
 * comma-thousands for USD). Tabular numerals + 2 fractional digits always.
 *
 * Implementation note: we DO NOT route through Double/Long, because INR
 * portfolios past 2^53 lose precision. We chunk the integer string ourselves.
 */
fun formatMoney(v: Money, currency: Currency = Currency.INR): String {
    val abs = v.abs().setScale(2, RoundingMode.HALF_EVEN).toPlainString()
    val (intPart, fracPart) = abs.split('.').let { it[0] to (it.getOrNull(1) ?: "00") }
    val grouped = when (currency) {
        Currency.INR -> indianGroup(intPart)
        Currency.USD -> westernGroup(intPart)
    }
    val sign = if (v.signum() < 0) "-" else ""
    return "$sign$grouped.$fracPart"
}

fun formatPct(v: Money, places: Int = 2): String {
    val pct = v.multiply(BigDecimal(100)).setScale(places, RoundingMode.HALF_EVEN)
    val sign = if (pct.signum() > 0) "+" else ""
    return "$sign${pct.toPlainString()}%"
}

fun formatSignedMoney(v: Money, currency: Currency = Currency.INR): String {
    val formatted = formatMoney(v, currency)
    return if (v.signum() > 0) "+$formatted" else formatted
}

fun formatQty(v: Money): String {
    val s = v.setScale(4, RoundingMode.HALF_EVEN).toPlainString()
    return s.trimEnd('0').trimEnd('.').ifEmpty { "0" }
}

enum class Currency { INR, USD }

private fun indianGroup(intStr: String): String {
    if (intStr.length <= 3) return intStr
    val tail = intStr.substring(intStr.length - 3)
    var s = intStr.substring(0, intStr.length - 3)
    val parts = mutableListOf<String>()
    while (s.length > 2) {
        parts.add(0, s.substring(s.length - 2))
        s = s.substring(0, s.length - 2)
    }
    if (s.isNotEmpty()) parts.add(0, s)
    return "${parts.joinToString(",")},$tail"
}

private fun westernGroup(intStr: String): String {
    if (intStr.length <= 3) return intStr
    val parts = mutableListOf<String>()
    var s = intStr
    while (s.length > 3) {
        parts.add(0, s.substring(s.length - 3))
        s = s.substring(0, s.length - 3)
    }
    if (s.isNotEmpty()) parts.add(0, s)
    return parts.joinToString(",")
}
