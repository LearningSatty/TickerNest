package com.tickernest.app.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Local cache. NOT a source of truth — only the last server snapshot, used so
 * screens render instantly on cold launch without a network round-trip.
 */

@Entity(tableName = "consolidated_row")
data class ConsolidatedRowEntity(
    @PrimaryKey val ticker: String,
    val name: String?,
    val sector: String?,
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
    val perBrokerJson: String, // serialized JSON; the UI deserializes lazily
    val cachedAt: Long,
)

@Entity(tableName = "broker", primaryKeys = ["id"])
data class BrokerEntity(
    val id: String,
    val name: String,
    val displayName: String,
    val currency: String,
    val sortOrder: Int,
    val csvProfileKey: String,
)

@Entity(tableName = "broker_holding", primaryKeys = ["brokerId", "ticker"])
data class BrokerHoldingEntity(
    val brokerId: String,
    val ticker: String,
    val qty: String,
    val avgCost: String,
    val name: String?,
    val sector: String?,
    val sectorDomain: String?,
    val marketType: String?,
    val currentPrice: String?,
    val prevClose: String?,
    val peRatio: String?,
    val cachedAt: Long,
)

@Entity(tableName = "sold_share")
data class SoldShareEntity(
    @PrimaryKey val id: String,
    val brokerId: String,
    val ticker: String,
    val name: String?,
    val qty: String,
    val costBasisAtSell: String,
    val soldPrice: String?,
    val reason: String?,
    val mistake: String?,
    val soldAt: String,
    val cachedAt: Long,
)

// ── Watchlist entities ────────────────────────────────────────────────────────

@Entity(tableName = "watchlist")
data class WatchlistEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String?,
    val market: String,
    val marketSymbol: String?,
    val groupId: String?,
    val isPinned: Boolean,
    val itemCount: Int,
    val position: Int,
    val cachedAt: Long,
)

/** One row = one item inside a watchlist (with live quote data). */
@Entity(tableName = "watchlist_item", primaryKeys = ["watchlistId", "ticker"])
data class WatchlistItemEntity(
    val watchlistId: String,
    val ticker: String,
    val name: String,
    val note: String?,
    val sectionName: String?,
    val position: Int,
    val currentPrice: String,
    val prevClose: String,
    val dayChange: String,
    val dayChangePct: String,
    val currency: String,
    val cachedAt: Long,
)

/** Sections list stored as a single row per watchlist (comma-separated is brittle;
 *  we store them ordered in a JSON array string instead). */
@Entity(tableName = "watchlist_sections")
data class WatchlistSectionsEntity(
    @PrimaryKey val watchlistId: String,
    val sectionsJson: String, // JSON array of section name strings
    val cachedAt: Long,
)
