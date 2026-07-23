package com.tickernest.app.db

import androidx.room.*
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
        clear(); upsertAll(rows)
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
        clear(brokerId); upsertAll(items)
    }
}

@Dao
interface SoldShareDao {
    @Query("SELECT * FROM sold_share ORDER BY soldAt DESC")
    fun observe(): Flow<List<SoldShareEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<SoldShareEntity>)

    @Query("DELETE FROM sold_share")
    suspend fun clear()

    @Transaction
    suspend fun replaceAll(items: List<SoldShareEntity>) {
        clear(); upsertAll(items)
    }
}

// ── Watchlist DAOs ────────────────────────────────────────────────────────────

@Dao
interface WatchlistDao {
    @Query("SELECT * FROM watchlist ORDER BY isPinned DESC, position, name")
    fun observeAll(): Flow<List<WatchlistEntity>>

    @Query("SELECT * FROM watchlist WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<WatchlistEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<WatchlistEntity>)

    @Query("DELETE FROM watchlist WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM watchlist")
    suspend fun clear()
}

@Dao
interface WatchlistItemDao {
    @Query("SELECT * FROM watchlist_item WHERE watchlistId = :wid ORDER BY position, ticker")
    fun observe(wid: String): Flow<List<WatchlistItemEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<WatchlistItemEntity>)

    @Query("DELETE FROM watchlist_item WHERE watchlistId = :wid")
    suspend fun clearForWatchlist(wid: String)

    @Query("DELETE FROM watchlist_item WHERE watchlistId = :wid AND ticker = :ticker")
    suspend fun delete(wid: String, ticker: String)

    @Transaction
    suspend fun replaceForWatchlist(wid: String, items: List<WatchlistItemEntity>) {
        clearForWatchlist(wid); upsertAll(items)
    }
}

@Dao
interface WatchlistSectionsDao {
    @Query("SELECT * FROM watchlist_sections WHERE watchlistId = :wid LIMIT 1")
    fun observe(wid: String): Flow<WatchlistSectionsEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: WatchlistSectionsEntity)
}
