package com.tickernest.app.di

import android.content.Context
import androidx.room.Room
import com.tickernest.app.api.AuthInterceptor
import com.tickernest.app.api.TickerNestApi
import com.tickernest.app.api.TokenStore
import com.tickernest.app.db.AppDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides @Singleton
    fun provideTokenStore(@ApplicationContext _ctx: Context): TokenStore =
        // Real impl: read the access_token from Supabase auth state's persisted
        // session via a DataStore-backed cache. Stub here returns null when
        // signed out.
        object : TokenStore {
            override fun currentJwt(): String? = null
        }

    @Provides @Singleton
    fun provideOkHttp(auth: AuthInterceptor): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(auth)
            .build()

    @Provides @Singleton
    fun provideRetrofit(okhttp: OkHttpClient): Retrofit {
        val json = Json { ignoreUnknownKeys = true; isLenient = true }
        val baseUrl = "https://api.tickernest.app/" // override in BuildConfig
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okhttp)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
    }

    @Provides @Singleton
    fun provideApi(retrofit: Retrofit): TickerNestApi = retrofit.create(TickerNestApi::class.java)

    @Provides @Singleton
    fun provideDb(@ApplicationContext ctx: Context): AppDatabase =
        Room.databaseBuilder(ctx, AppDatabase::class.java, "tickernest.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides @Singleton
    fun provideAppScope(): CoroutineScope =
        CoroutineScope(SupervisorJob() + Dispatchers.Default)
}
