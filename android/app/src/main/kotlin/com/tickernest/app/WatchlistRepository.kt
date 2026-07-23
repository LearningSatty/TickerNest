package com.tickernest.app

import com.tickernest.app.api.*
import com.tickernest.app.db.*
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WatchlistRepository @Inject constructor(
    private val api: TickerNestApi,
    private val db: AppDatabase,
) {
    private val json = Json { ignoreUnknownKeys = true }

    // ── Observe ────────────────────────────────────────────────────────────────

    fun observeAll(): Flow<List<WatchlistEntity>> = db.watchlistDao().observeAll()

    fun observeDetail(id: String): Flow<WatchlistEntity?> = db.watchlistDao().observeById(id)

    fun observeItems(watchlistId: String): Flow<List<WatchlistItemEntity>> =
        db.watchlistItemDao().observe(watchlistId)

    fun observeSections(watchlistId: String): Flow<WatchlistSectionsEntity?> =
        db.watchlistSectionsDao().observe(watchlistId)

    // ── Refresh ────────────────────────────────────────────────────────────────

    suspend fun refreshAll() {
        val list = api.watchlists()
        db.watchlistDao().upsertAll(list.map { it.toEntity() })
    }

    suspend fun refreshDetail(id: String) {
        val detail = api.watchlistDetail(id)
        // Update the summary row
        db.watchlistDao().upsertAll(listOf(detail.toSummaryEntity()))
        // Replace all items for this watchlist
        db.watchlistItemDao().replaceForWatchlist(id, detail.items.map { it.toEntity(id) })
        // Update sections
        db.watchlistSectionsDao().upsert(
            WatchlistSectionsEntity(
                watchlistId = id,
                sectionsJson = json.encodeToString(detail.sections),
                cachedAt = System.currentTimeMillis(),
            )
        )
    }

    // ── Mutations ──────────────────────────────────────────────────────────────

    suspend fun createWatchlist(name: String, market: String = "IN"): WatchlistSummaryDto {
        val result = api.createWatchlist(CreateWatchlistDto(name = name, market = market))
        db.watchlistDao().upsertAll(listOf(result.toEntity()))
        return result
    }

    suspend fun deleteWatchlist(id: String) {
        api.deleteWatchlist(id)
        db.watchlistDao().delete(id)
        db.watchlistItemDao().clearForWatchlist(id)
    }

    suspend fun addItem(watchlistId: String, ticker: String, name: String?, sectionName: String?, note: String?) {
        api.addWatchlistItem(watchlistId, AddWatchlistItemDto(
            ticker = ticker, name = name, sectionName = sectionName, note = note,
        ))
        refreshDetail(watchlistId)
    }

    suspend fun removeItem(watchlistId: String, ticker: String) {
        api.removeWatchlistItem(watchlistId, ticker)
        db.watchlistItemDao().delete(watchlistId, ticker)
    }

    suspend fun bulkDeleteItems(watchlistId: String, tickers: List<String>) {
        api.bulkDeleteItems(watchlistId, BulkDeleteDto(tickers))
        refreshDetail(watchlistId)
    }

    suspend fun bulkMoveSection(watchlistId: String, tickers: List<String>, sectionName: String?) {
        api.bulkMoveSection(watchlistId, BulkMoveSectionDto(tickers, sectionName))
        refreshDetail(watchlistId)
    }

    suspend fun addSection(watchlistId: String, name: String) {
        api.addSection(watchlistId, mapOf("name" to name))
        refreshDetail(watchlistId)
    }

    suspend fun deleteSection(watchlistId: String, name: String) {
        api.deleteSection(watchlistId, name)
        refreshDetail(watchlistId)
    }

    suspend fun searchTickers(query: String, market: String? = null): List<SearchHitDto> =
        api.searchTickers(query = query, market = market)

    // ── Mappers ────────────────────────────────────────────────────────────────

    private fun WatchlistSummaryDto.toEntity() = WatchlistEntity(
        id = id, name = name, description = description,
        market = market, marketSymbol = marketSymbol,
        groupId = groupId, isPinned = isPinned,
        itemCount = itemCount, position = position,
        cachedAt = System.currentTimeMillis(),
    )

    private fun WatchlistDetailDto.toSummaryEntity() = WatchlistEntity(
        id = id, name = name, description = description,
        market = market, marketSymbol = marketSymbol,
        groupId = null, isPinned = false,
        itemCount = items.size, position = 0,
        cachedAt = System.currentTimeMillis(),
    )

    private fun WatchlistItemDto.toEntity(watchlistId: String) = WatchlistItemEntity(
        watchlistId = watchlistId, ticker = ticker, name = name,
        note = note, sectionName = sectionName, position = position,
        currentPrice = currentPrice, prevClose = prevClose,
        dayChange = dayChange, dayChangePct = dayChangePct,
        currency = currency, cachedAt = System.currentTimeMillis(),
    )
}
