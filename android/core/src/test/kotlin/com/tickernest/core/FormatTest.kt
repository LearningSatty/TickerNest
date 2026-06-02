package com.tickernest.core

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class FormatTest {

    @Test fun `INR groups lakhs and crores`() {
        assertEquals("44,22,540.74", formatMoney(D("4422540.74")))
        assertEquals("62,88,819.43", formatMoney(D("6288819.43")))
    }

    @Test fun `INR precision preserved at very large magnitudes`() {
        assertEquals(
            "12,34,56,78,90,12,345.67",
            formatMoney(D("123456789012345.67")),
        )
    }

    @Test fun `USD uses thousands grouping`() {
        assertEquals("1,234,567.89", formatMoney(D("1234567.89"), Currency.USD))
    }

    @Test fun `formatPct adds a sign for non-zero values`() {
        assertEquals("+4.21%", formatPct(D("0.0421")))
        assertEquals("-0.95%", formatPct(D("-0.0095")))
        assertEquals("0.00%", formatPct(D("0")))
    }

    @Test fun `formatSignedMoney prefixes plus for positive and minus for negative`() {
        assertEquals("+15,190.51", formatSignedMoney(D("15190.51")))
        assertEquals("-432.04", formatSignedMoney(D("-432.04")))
        assertEquals("0.00", formatSignedMoney(D("0")))
    }

    @Test fun `formatQty strips trailing zeros and the decimal point`() {
        assertEquals("10", formatQty(D("10.0000")))
        assertEquals("10.5", formatQty(D("10.5000")))
        assertEquals("10.5001", formatQty(D("10.5001")))
    }
}
