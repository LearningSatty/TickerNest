package com.tickernest.core

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertNotNull
import kotlin.test.assertIs
import kotlin.test.assertTrue

class HoldingUpsertTest {

    private fun s(qty: String, avg: String) = HoldingState(D(qty), D(avg))
    private fun req(desired: HoldingState, soldPrice: String? = null,
                    reason: String? = null, mistake: String? = null) =
        HoldingUpsertRequest(desired,
            soldPrice = soldPrice?.let(::D),
            reason = reason, mistake = mistake)

    @Test fun `insert plan for a brand-new holding`() {
        val plan = planHoldingUpsert(null, req(s("10", "700")))
        val ins = assertIs<Plan.Insert>(plan)
        assertEquals("10", formatQty(ins.next.qty))
        assertEquals("700.0000", ins.next.avgCost.toWire())
    }

    @Test fun `noop for zero-qty insertion`() {
        assertEquals(Plan.Noop, planHoldingUpsert(null, req(s("0", "700"))))
    }

    @Test fun `noop when nothing changed`() {
        assertEquals(Plan.Noop, planHoldingUpsert(s("10","700"), req(s("10","700"))))
    }

    @Test fun `qty increase emits update with no soldShare`() {
        val plan = planHoldingUpsert(s("10","700"), req(s("15","712")))
        val u = assertIs<Plan.Update>(plan)
        assertNull(u.soldShare)
    }

    @Test fun `avg-only change is update without soldShare`() {
        val plan = planHoldingUpsert(s("10","700"), req(s("10","705")))
        val u = assertIs<Plan.Update>(plan)
        assertNull(u.soldShare)
    }

    @Test fun `qty decrease snapshots the OLD avg as cost basis`() {
        val plan = planHoldingUpsert(s("10","700"), req(s("7","750")))
        val u = assertIs<Plan.Update>(plan)
        val ss = assertNotNull(u.soldShare)
        assertEquals("3", formatQty(ss.qty))
        assertEquals("700.0000", ss.costBasisAtSell.toWire())
    }

    @Test fun `qty to zero produces FullExit with soldShare for full prior qty`() {
        val plan = planHoldingUpsert(s("10","700"), req(s("0","700")))
        val fx = assertIs<Plan.FullExit>(plan)
        assertEquals("10", formatQty(fx.soldShare.qty))
        assertEquals("700.0000", fx.soldShare.costBasisAtSell.toWire())
    }

    @Test fun `optional sell metadata is passed through`() {
        val plan = planHoldingUpsert(s("10","700"),
            req(s("7","700"), soldPrice = "820", reason = "Profit booking"))
        val u = assertIs<Plan.Update>(plan)
        val ss = assertNotNull(u.soldShare)
        assertEquals("820.0000", ss.soldPrice!!.toWire())
        assertEquals("Profit booking", ss.reason)
        assertTrue(ss.mistake == null)
    }
}
