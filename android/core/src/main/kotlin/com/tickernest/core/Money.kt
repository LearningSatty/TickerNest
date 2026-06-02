package com.tickernest.core

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode

/**
 * Money is BigDecimal everywhere — never Double / Float. Mirrors the
 * NUMERIC(20,4) backend invariant.
 *
 * Construct via D() so rounding mode is centralised; all financial maths
 * goes through the helpers here.
 */
private val CTX = MathContext(30, RoundingMode.HALF_EVEN)

typealias Money = BigDecimal

@Suppress("FunctionName")
fun D(v: String): Money = BigDecimal(v, CTX)
@Suppress("FunctionName")
fun D(v: Int): Money = BigDecimal(v).round(CTX)
@Suppress("FunctionName")
fun D(v: Long): Money = BigDecimal(v).round(CTX)
@Suppress("FunctionName")
fun D(v: Double): Money = BigDecimal(v.toString(), CTX) // string ctor avoids float-binary surprises

val ZERO: Money = BigDecimal.ZERO

fun Money.isZero(): Boolean = this.signum() == 0

fun Iterable<Money>.sumMoney(): Money =
    fold(ZERO) { a, b -> a.add(b) }

/**
 * Weighted average: sum(qty_i * price_i) / sum(qty_i).
 * Returns ZERO when totalQty is 0 — never NaN, never throws.
 */
fun weightedAvg(pairs: List<Pair<Money, Money>>): Money {
    val totalQty = pairs.map { it.first }.sumMoney()
    if (totalQty.isZero()) return ZERO
    val numerator = pairs.map { it.first.multiply(it.second, CTX) }.sumMoney()
    return numerator.divide(totalQty, CTX)
}

fun Money.toWire(): String = setScale(4, RoundingMode.HALF_EVEN).toPlainString()
