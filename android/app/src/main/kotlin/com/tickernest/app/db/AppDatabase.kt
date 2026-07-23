package com.tickernest.app.db

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        ConsolidatedRowEntity::class,
        BrokerEntity::class,
        BrokerHoldingEntity::class,
        SoldShareEntity::class,
        WatchlistEntity::class,
        WatchlistItemEntity::class,
        WatchlistSectionsEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun consolidatedDao(): ConsolidatedDao
    abstract fun brokerDao(): BrokerDao
    abstract fun brokerHoldingDao(): BrokerHoldingDao
    abstract fun soldShareDao(): SoldShareDao
    abstract fun watchlistDao(): WatchlistDao
    abstract fun watchlistItemDao(): WatchlistItemDao
    abstract fun watchlistSectionsDao(): WatchlistSectionsDao
}
