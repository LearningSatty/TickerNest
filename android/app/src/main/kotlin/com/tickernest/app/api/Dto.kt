package com.tickernest.app.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// All numeric values are NUMERIC strings on the wire. Convert to BigDecimal at
// the use site (com.tickernest.core.D).

@Serializable
data class BrokerDto(
    val id: String,
    val name: String,
    val displayName: String,
    val currency: String,
    val sortOrder: Int,
    val csvProfileKey: String,
)

@Serializable
data class BrokerHoldingDto(
    val brokerId: String,
    val ticker: String,
    val qty: String,
    val avgCost: String,
    val name: String? = null,
    val sector: String? = null,
    val sectorDomain: String? = null,
    val marketType: String? = null,
    val currentPrice: String? = null,
    val prevClose: String? = null,
    val peRatio: String? = null,
)

@Serializable
data class PerBrokerCellDto(
    val brokerId: String,
    val brokerName: String,
    val qty: String,
    val avgCost: String,
)

@Serializable
data class ConsolidatedRowDto(
    val ticker: String,
    val name: String? = null,
    val sector: String? = null,
    val totalQty: String,
    val currentPrice: String,
    val currentValue: String,
    val finalAvgValue: String,
    val investedValue: String,
    val totalPnl: String,
    val totalPnlPct: String,
    val todaysChange: String,
    val todaysChangePct: String,
    val percentOfPortfolio: String,
    val perBroker: List<PerBrokerCellDto>,
)

@Serializable
data class ConsolidatedResponseDto(
    val rows: List<ConsolidatedRowDto>,
    val brokers: List<BrokerDto>,
    val totalInvested: String,
    val totalCurrentValue: String,
    val overallProfit: String,
    val overallProfitPct: String,
    val todaysTotalProfit: String,
)

@Serializable
data class UpsertHoldingDto(
    val qty: String,
    val avgCost: String,
    val soldPrice: String? = null,
    val reason: String? = null,
    val mistake: String? = null,
)

@Serializable
data class UpsertHoldingResponseDto(
    val replay: Boolean,
    val holding: BrokerHoldingDto? = null,
    val soldShareId: String? = null,
)

@Serializable
data class SoldShareDto(
    val id: String,
    val brokerId: String,
    val ticker: String,
    val qty: String,
    val costBasisAtSell: String,
    val soldPrice: String? = null,
    val reason: String? = null,
    val mistake: String? = null,
    @SerialName("soldAt") val soldAt: String,
)
