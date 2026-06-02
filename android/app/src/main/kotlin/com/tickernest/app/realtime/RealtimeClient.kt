package com.tickernest.app.realtime

import com.tickernest.app.api.TokenStore
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.consumeAsFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Socket.IO client. Subscribes to `portfolio.changed` and emits domain events
 * the repository turns into cache invalidations.
 */
@Singleton
class RealtimeClient @Inject constructor(
    private val tokens: TokenStore,
) {
    private var sock: Socket? = null
    private val events = Channel<RealtimeEvent>(capacity = Channel.UNLIMITED)
    fun events(): Flow<RealtimeEvent> = events.consumeAsFlow()

    fun connect(baseUrl: String, userId: String) {
        if (sock != null) return
        val opts = IO.Options.builder()
            .setPath("/ws")
            .setTransports(arrayOf("websocket"))
            .setAuth(mapOf("userId" to userId, "token" to (tokens.currentJwt() ?: "")))
            .build()
        val s = IO.socket(baseUrl, opts)
        s.on("portfolio.changed") { args ->
            val payload = args.firstOrNull() as? org.json.JSONObject ?: return@on
            val tickers = payload.optJSONArray("tickers")?.let { arr ->
                List(arr.length()) { arr.getString(it) }
            } ?: emptyList()
            val brokerIds = payload.optJSONArray("brokerIds")?.let { arr ->
                List(arr.length()) { arr.getString(it) }
            } ?: emptyList()
            events.trySend(RealtimeEvent.PortfolioChanged(tickers, brokerIds))
        }
        s.connect()
        sock = s
    }

    fun disconnect() {
        sock?.disconnect()
        sock = null
    }
}

sealed interface RealtimeEvent {
    data class PortfolioChanged(val tickers: List<String>, val brokerIds: List<String>) : RealtimeEvent
}
