package com.tickernest.app.api

import retrofit2.http.*

interface TickerNestApi {

    // ── Portfolio ──────────────────────────────────────────────────────────────

    @GET("/portfolio/consolidated")
    suspend fun consolidated(): ConsolidatedResponseDto

    @GET("/brokers")
    suspend fun brokers(): List<BrokerDto>

    @GET("/holdings/{brokerId}")
    suspend fun holdings(@Path("brokerId") brokerId: String): List<BrokerHoldingDto>

    @PUT("/holdings/{brokerId}/{ticker}")
    suspend fun upsertHolding(
        @Header("Idempotency-Key") idemKey: String,
        @Path("brokerId") brokerId: String,
        @Path("ticker") ticker: String,
        @Body body: UpsertHoldingDto,
    ): UpsertHoldingResponseDto

    @GET("/sold-shares")
    suspend fun soldShares(): List<SoldShareDto>

    // ── Watchlists ─────────────────────────────────────────────────────────────

    @GET("/watchlists")
    suspend fun watchlists(): List<WatchlistSummaryDto>

    @GET("/watchlists/{id}")
    suspend fun watchlistDetail(@Path("id") id: String): WatchlistDetailDto

    @POST("/watchlists")
    suspend fun createWatchlist(@Body body: CreateWatchlistDto): WatchlistSummaryDto

    @DELETE("/watchlists/{id}")
    suspend fun deleteWatchlist(@Path("id") id: String)

    @POST("/watchlists/{id}/items")
    suspend fun addWatchlistItem(
        @Path("id") id: String,
        @Body body: AddWatchlistItemDto,
    ): Map<String, String?>

    @DELETE("/watchlists/{id}/items/{ticker}")
    suspend fun removeWatchlistItem(
        @Path("id") id: String,
        @Path("ticker") ticker: String,
    )

    @POST("/watchlists/{id}/items/bulk-delete")
    suspend fun bulkDeleteItems(
        @Path("id") id: String,
        @Body body: BulkDeleteDto,
    ): Map<String, Int>

    @POST("/watchlists/{id}/items/bulk-move-section")
    suspend fun bulkMoveSection(
        @Path("id") id: String,
        @Body body: BulkMoveSectionDto,
    ): Map<String, Int>

    @POST("/watchlists/{id}/sections")
    suspend fun addSection(
        @Path("id") id: String,
        @Body body: Map<String, String>,
    ): Map<String, List<String>>

    @DELETE("/watchlists/{id}/sections/{name}")
    suspend fun deleteSection(
        @Path("id") id: String,
        @Path("name") name: String,
    )

    // ── Quote search ───────────────────────────────────────────────────────────

    @GET("/quotes/search")
    suspend fun searchTickers(
        @Query("q") query: String,
        @Query("limit") limit: Int = 10,
        @Query("market") market: String? = null,
    ): List<SearchHitDto>
}
