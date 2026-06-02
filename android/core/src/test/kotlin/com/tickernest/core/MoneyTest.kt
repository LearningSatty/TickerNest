package com.tickernest.core

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class MoneyTest {

    @Test fun `D from string preserves precision`() {
        assertEquals("1500.5000", D("1500.50").toWire())
    }

    @Test fun `weightedAvg of empty list is zero`() {
        assertEquals("0.0000", weightedAvg(emptyList()).toWire())
    }

    @Test fun `weightedAvg of single pair returns the price`() {
        val avg = weightedAvg(listOf(D("10") to D("100")))
        assertEquals("100.0000", avg.toWire())
    }

    @Test fun `weightedAvg of two pairs is correctly weighted`() {
        // (10*100 + 30*200) / 40 = 175
        val avg = weightedAvg(listOf(D("10") to D("100"), D("30") to D("200")))
        assertEquals("175.0000", avg.toWire())
    }

    @Test fun `weightedAvg with zero total qty returns zero (no NaN)`() {
        val avg = weightedAvg(listOf(D("0") to D("100"), D("0") to D("200")))
        assertEquals("0.0000", avg.toWire())
    }

    @Test fun `sumMoney sums precisely past 2^53`() {
        val xs = listOf(D("1234567890.1234"), D("9876543210.9876"))
        assertEquals("11111111101.1110", xs.sumMoney().toWire())
    }
}
