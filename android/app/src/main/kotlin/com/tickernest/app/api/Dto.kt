package com.tickernest.app.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// All numeric values are NUMERIC strings on the wire. Convert to BigDecimal at
// the use site (com.tickernest.core.D).

// ── Portfolio / Holdings ─────────────────────────────────────────────────────

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
    val name: String? = null,
)

// ── Watchlists ───────────────────────────────────────────────────────────────

@Serializable
data class WatchlistGroupDto(
    val id: String,
    val name: String,
    val position: Int,
    val isPinned: Boolean,
    val watchlists: List<WatchlistSummaryDto> = emptyList(),
)

@Serializable
data class WatchlistSummaryDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val market: String,
    val marketSymbol: String? = null,
    val groupId: String? = null,
    val isPinned: Boolean = false,
    val itemCount: Int = 0,
    val position: Int = 0,
)

@Serializable
data class WatchlistItemDto(
    val ticker: String,
    val name: String,
    val note: String? = null,
    val sectionName: String? = null,
    val position: Int,
    val currentPrice: String,
    val prevClose: String,
    val dayChange: String,
    val dayChangePct: String,
    val currency: String,
)

@Serializable
data class WatchlistDetailDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val market: String,
    val marketSymbol: String? = null,
    val sections: List<String> = emptyList(),
    val items: List<WatchlistItemDto> = emptyList(),
)

@Serializable
data class CreateWatchlistDto(
    val name: String,
    val market: String = "IN",
    val groupId: String? = null,
)

@Serializable
data class AddWatchlistItemDto(
    val ticker: String,
    val name: String? = null,
    val sectionName: String? = null,
    val note: String? = null,
)

@Serializable
data class BulkMoveSectionDto(
    val tickers: List<String>,
    val sectionName: String? = null,
)

@Serializable
data class BulkDeleteDto(
    val tickers: List<String>,
)

// ── Ticker search ─────────────────────────────────────────────────────────────

@Serializable
data class SearchHitDto(
    val ticker: String,
    val name: String,
    val exchange: String,
    val quoteType: String,
)
