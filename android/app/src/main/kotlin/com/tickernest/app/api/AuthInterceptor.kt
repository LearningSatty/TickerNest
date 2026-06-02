package com.tickernest.app.api

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads the current Supabase JWT from a TokenStore (DataStore-backed) and
 * attaches it as Bearer on every outgoing request. The token is refreshed
 * by the supabase-kt SDK out of band; we just read whatever's current.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokens: TokenStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokens.currentJwt()
        val req = if (!token.isNullOrEmpty()) {
            chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else {
            chain.request()
        }
        return chain.proceed(req)
    }
}

interface TokenStore {
    fun currentJwt(): String?
}
