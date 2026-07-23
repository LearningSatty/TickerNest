package com.tickernest.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tickernest.app.WatchlistRepository
import com.tickernest.app.db.WatchlistEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WatchlistsUiState(
    val watchlists: List<WatchlistEntity> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class WatchlistsViewModel @Inject constructor(
    private val repo: WatchlistRepository,
) : ViewModel() {

    private val _error = MutableStateFlow<String?>(null)
    private val _loading = MutableStateFlow(false)

    val state: StateFlow<WatchlistsUiState> = combine(
        repo.observeAll(),
        _loading,
        _error,
    ) { list, loading, error ->
        WatchlistsUiState(watchlists = list, loading = loading, error = error)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WatchlistsUiState(loading = true))

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        _loading.value = true
        _error.value = null
        runCatching { repo.refreshAll() }
            .onFailure { _error.value = it.message }
        _loading.value = false
    }

    fun createWatchlist(name: String, market: String = "IN", onCreated: (String) -> Unit) =
        viewModelScope.launch {
            runCatching { repo.createWatchlist(name, market) }
                .onSuccess { onCreated(it.id) }
                .onFailure { _error.value = it.message }
        }

    fun deleteWatchlist(id: String) = viewModelScope.launch {
        runCatching { repo.deleteWatchlist(id) }
            .onFailure { _error.value = it.message }
    }
}
