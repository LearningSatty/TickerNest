package com.tickernest.app

import com.tickernest.app.api.BrokerHoldingDto
import com.tickernest.app.api.ConsolidatedRowDto
import com.tickernest.app.api.TickerNestApi
import com.tickernest.app.api.UpsertHoldingDto
import com.tickernest.app.api.UpsertHoldingResponseDto
import com.tickernest.app.db.AppDatabase
import com.tickernest.app.db.BrokerEntity
import com.tickernest.app.db.BrokerHoldingEntity
import com.tickernest.app.db.ConsolidatedRowEntity
import com.tickernest.app.realtime.RealtimeClient
import com.tickernest.app.realtime.RealtimeEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PortfolioRepository @Inject constructor(
    private val api: TickerNestApi,
    private val db: AppDatabase,
    private val realtime: RealtimeClient,
    private val scope: CoroutineScope,
) {
    private val json = Json { ignoreUnknownKeys = true }

    init {
        scope.launch {
            realtime.events().collectLatest { e ->
                when (e) {
                    is RealtimeEvent.PortfolioChanged -> {
                        refreshConsolidated()
                        e.brokerIds.forEach { refreshBroker(it) }
                    }
                }
            }
        }
    }

    fun observeConsolidated(): Flow<List<ConsolidatedRowEntity>> =
        db.consolidatedDao().observe()

    fun observeBrokers() = db.brokerDao().observe()
    fun observeHoldings(brokerId: String) = db.brokerHoldingDao().observe(brokerId)

    suspend fun refreshConsolidated() {
        val resp = api.consolidated()
        db.consolidatedDao().replaceAll(resp.rows.map { it.toEntity() })
        db.brokerDao().upsertAll(resp.brokers.map {
            BrokerEntity(
                id = it.id, name = it.name, displayName = it.displayName,
                currency = it.currency, sortOrder = it.sortOrder,
                csvProfileKey = it.csvProfileKey,
            )
        })
    }

    suspend fun refreshBroker(brokerId: String) {
        val rows = api.holdings(brokerId)
        db.brokerHoldingDao().replaceForBroker(
            brokerId,
            rows.map { it.toEntity(brokerId) },
        )
    }

    suspend fun upsertHolding(
        brokerId: String,
        ticker: String,
        body: UpsertHoldingDto,
    ): UpsertHoldingResponseDto {
        val key = UUID.randomUUID().toString()
        val resp = api.upsertHolding(key, brokerId, ticker, body)
        // optimistic refresh of just-this-broker; the listener will push
        // the consolidated update too.
        refreshBroker(brokerId)
        refreshConsolidated()
        return resp
    }

    private fun ConsolidatedRowDto.toEntity(): ConsolidatedRowEntity =
        ConsolidatedRowEntity(
            ticker = ticker, name = name, sector = sector,
            totalQty = totalQty, currentPrice = currentPrice,
            currentValue = currentValue, finalAvgValue = finalAvgValue,
            investedValue = investedValue, totalPnl = totalPnl,
            totalPnlPct = totalPnlPct, todaysChange = todaysChange,
            todaysChangePct = todaysChangePct,
            percentOfPortfolio = percentOfPortfolio,
            perBrokerJson = json.encodeToString(perBroker),
            cachedAt = System.currentTimeMillis(),
        )

    private fun BrokerHoldingDto.toEntity(brokerId: String): BrokerHoldingEntity =
        BrokerHoldingEntity(
            brokerId = brokerId, ticker = ticker,
            qty = qty, avgCost = avgCost,
            name = name, sector = sector, sectorDomain = sectorDomain,
            marketType = marketType, currentPrice = currentPrice,
            prevClose = prevClose, peRatio = peRatio,
            cachedAt = System.currentTimeMillis(),
        )
}
