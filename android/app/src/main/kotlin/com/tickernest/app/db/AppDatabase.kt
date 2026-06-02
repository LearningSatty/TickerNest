package com.tickernest.app.db

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [ConsolidatedRowEntity::class, BrokerEntity::class, BrokerHoldingEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun consolidatedDao(): ConsolidatedDao
    abstract fun brokerDao(): BrokerDao
    abstract fun brokerHoldingDao(): BrokerHoldingDao
}
