package com.tickernest.core

/**
 * Pure-domain holding upsert planner — Kotlin twin of the Node module.
 * Lets the Android client simulate the diff locally so the edit dialog can
 * show "Update / Reduce / Full Exit" instantly without a server round trip.
 *
 * The server is still authoritative; this is purely for UI affordances.
 */

data class HoldingState(val qty: Money, val avgCost: Money)

data class PlannedSoldShare(
    val qty: Money,
    val costBasisAtSell: Money,
    val soldPrice: Money?,
    val reason: String?,
    val mistake: String?,
)

sealed interface Plan {
    data object Noop : Plan
    data class Insert(val next: HoldingState) : Plan
    data class Update(val next: HoldingState, val soldShare: PlannedSoldShare?) : Plan
    data class FullExit(val soldShare: PlannedSoldShare) : Plan
}

data class HoldingUpsertRequest(
    val desired: HoldingState,
    val soldPrice: Money? = null,
    val reason: String? = null,
    val mistake: String? = null,
)

fun planHoldingUpsert(current: HoldingState?, req: HoldingUpsertRequest): Plan {
    val desired = req.desired
    if (current == null) {
        return if (desired.qty.signum() <= 0) Plan.Noop
               else Plan.Insert(desired)
    }
    val sameQty = current.qty.compareTo(desired.qty) == 0
    val sameAvg = current.avgCost.compareTo(desired.avgCost) == 0
    if (sameQty && sameAvg) return Plan.Noop

    if (desired.qty < current.qty) {
        val soldQty = current.qty.subtract(desired.qty)
        val ss = PlannedSoldShare(
            qty = soldQty,
            costBasisAtSell = current.avgCost,  // OLD avg, frozen
            soldPrice = req.soldPrice,
            reason = req.reason,
            mistake = req.mistake,
        )
        return if (desired.qty.isZero()) Plan.FullExit(ss)
               else Plan.Update(desired, ss)
    }
    return Plan.Update(desired, soldShare = null)
}
