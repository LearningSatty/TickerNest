package com.tickernest.app.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface ConsolidatedDao {
    @Query("SELECT * FROM consolidated_row ORDER BY CAST(currentValue AS REAL) DESC")
    fun observe(): Flow<List<ConsolidatedRowEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rows: List<ConsolidatedRowEntity>)

    @Query("DELETE FROM consolidated_row")
    suspend fun clear()

    @Transaction
    suspend fun replaceAll(rows: List<ConsolidatedRowEntity>) {
        clear()
        upsertAll(rows)
    }
}

@Dao
interface BrokerDao {
    @Query("SELECT * FROM broker ORDER BY sortOrder")
    fun observe(): Flow<List<BrokerEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<BrokerEntity>)
}

@Dao
interface BrokerHoldingDao {
    @Query("SELECT * FROM broker_holding WHERE brokerId = :brokerId ORDER BY ticker")
    fun observe(brokerId: String): Flow<List<BrokerHoldingEntity>>

    @Query("DELETE FROM broker_holding WHERE brokerId = :brokerId")
    suspend fun clear(brokerId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<BrokerHoldingEntity>)

    @Transaction
    suspend fun replaceForBroker(brokerId: String, items: List<BrokerHoldingEntity>) {
        clear(brokerId)
        upsertAll(items)
    }
}
