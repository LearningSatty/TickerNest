package com.tickernest.app.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PUT
import retrofit2.http.Path

interface TickerNestApi {

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
}
