package com.tickernest.app.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Local cache. NOT a source of truth — only the last server snapshot, used so
 * the broker page and consolidated pivot render instantly on cold launch.
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
