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
            override fun currentJwt(): String? = "eyJhbGciOiJFUzI1NiIsImtpZCI6IjkxYWI2MGNmLTdmZWUtNGY3My05YTAzLTkwNTNlOTUyNTIzMSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3B1eWh2ZXp5Z25uYnVkc2pqeGZqLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI3NDc3ZmU2Yi1iY2VmLTRhYTEtYjVjZC00NGM4MDhjYWQ3ZmMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzgxNTYxNDc3LCJpYXQiOjE3ODE1NTc4NzcsImVtYWlsIjoic2F0dHkuYWRzQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzgxNTA0MzA0fV0sInNlc3Npb25faWQiOiI4NzhhMGVjNy01YTk2LTQ5NzktOTQxNy0xNjUzYTVlMjg1ODkiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.HEXXuaby3vQ7mz8jsmCZznUYhZzKA-kioUXnPb92VG-A75OXZbhvZJ3jl_1kk6Bb1NNyAniD8yWJU3lcMKAT_w";
        }

    @Provides @Singleton
    fun provideOkHttp(auth: AuthInterceptor): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(auth)
            .build()

    @Provides @Singleton
    fun provideRetrofit(okhttp: OkHttpClient): Retrofit {
        val json = Json { ignoreUnknownKeys = true; isLenient = true }
//        val baseUrl = "https://api.tickernest.app/" // override in BuildConfig
        val baseUrl = "http://10.0.2.2:3000/";
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
            .fallbackToDestructiveMigration() // safe for a cache-only DB
            .build()

    @Provides @Singleton
    fun provideAppScope(): CoroutineScope =
        CoroutineScope(SupervisorJob() + Dispatchers.Default)
}
