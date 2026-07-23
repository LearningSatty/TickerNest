package com.tickernest.app.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tickernest.app.WatchlistRepository
import com.tickernest.app.api.SearchHitDto
import com.tickernest.app.db.WatchlistEntity
import com.tickernest.app.db.WatchlistItemEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Inject

data class WatchlistDetailUiState(
    val watchlist: WatchlistEntity? = null,
    val items: List<WatchlistItemEntity> = emptyList(),
    val sections: List<String> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    // Multi-select
    val selectedTickers: Set<String> = emptySet(),
    // Search
    val searchQuery: String = "",
    val searchResults: List<SearchHitDto> = emptyList(),
    val searchLoading: Boolean = false,
)

@OptIn(FlowPreview::class)
@HiltViewModel
class WatchlistDetailViewModel @Inject constructor(
    private val repo: WatchlistRepository,
    saved: SavedStateHandle,
) : ViewModel() {

    val watchlistId: String = checkNotNull(saved["watchlistId"])

    private val _loading = MutableStateFlow(true)
    private val _error = MutableStateFlow<String?>(null)
    private val _selectedTickers = MutableStateFlow<Set<String>>(emptySet())
    private val _searchQuery = MutableStateFlow("")
    private val _searchResults = MutableStateFlow<List<SearchHitDto>>(emptyList())
    private val _searchLoading = MutableStateFlow(false)
    private val json = Json { ignoreUnknownKeys = true }

    val state: StateFlow<WatchlistDetailUiState> = combine(
        repo.observeDetail(watchlistId),
        repo.observeItems(watchlistId),
        repo.observeSections(watchlistId),
        _loading,
        _error,
        _selectedTickers,
        _searchQuery,
        _searchResults,
        _searchLoading,
    ) { arr ->
        @Suppress("UNCHECKED_CAST")
        val wl = arr[0] as WatchlistEntity?
        @Suppress("UNCHECKED_CAST")
        val items = arr[1] as List<WatchlistItemEntity>
        val sectionsEntity = arr[2]
        val loading = arr[3] as Boolean
        val error = arr[4] as String?
        @Suppress("UNCHECKED_CAST")
        val selected = arr[5] as Set<String>
        val sq = arr[6] as String
        @Suppress("UNCHECKED_CAST")
        val sr = arr[7] as List<SearchHitDto>
        val sl = arr[8] as Boolean

        val sections = runCatching {
            sectionsEntity?.let {
                json.decodeFromString<List<String>>((it as com.tickernest.app.db.WatchlistSectionsEntity).sectionsJson)
            } ?: emptyList()
        }.getOrDefault(emptyList())

        WatchlistDetailUiState(
            watchlist = wl, items = items, sections = sections,
            loading = loading, error = error,
            selectedTickers = selected,
            searchQuery = sq, searchResults = sr, searchLoading = sl,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WatchlistDetailUiState())

    init {
        refresh()
        // Debounced ticker search
        viewModelScope.launch {
            _searchQuery
                .debounce(300)
                .filter { it.length >= 2 }
                .collectLatest { q ->
                    _searchLoading.value = true
                    runCatching {
                        val market = state.value.watchlist?.market
                        repo.searchTickers(q, market)
                    }.onSuccess { _searchResults.value = it }
                     .onFailure { _searchResults.value = emptyList() }
                    _searchLoading.value = false
                }
        }
    }

    fun refresh() = viewModelScope.launch {
        _loading.value = true
        _error.value = null
        runCatching { repo.refreshDetail(watchlistId) }
            .onFailure { _error.value = it.message }
        _loading.value = false
    }

    fun setSearchQuery(q: String) {
        _searchQuery.value = q
        if (q.length < 2) _searchResults.value = emptyList()
    }

    fun clearSearch() {
        _searchQuery.value = ""
        _searchResults.value = emptyList()
    }

    fun addItem(ticker: String, name: String?, sectionName: String? = null, note: String? = null) =
        viewModelScope.launch {
            runCatching { repo.addItem(watchlistId, ticker, name, sectionName, note) }
                .onFailure { _error.value = it.message }
            clearSearch()
        }

    fun removeItem(ticker: String) = viewModelScope.launch {
        runCatching { repo.removeItem(watchlistId, ticker) }
            .onFailure { _error.value = it.message }
    }

    // ── Multi-select ───────────────────────────────────────────────────────────

    fun toggleSelect(ticker: String) {
        _selectedTickers.update { cur ->
            if (cur.contains(ticker)) cur - ticker else cur + ticker
        }
    }

    fun selectAll() {
        _selectedTickers.value = state.value.items.map { it.ticker }.toSet()
    }

    fun clearSelection() {
        _selectedTickers.value = emptySet()
    }

    fun bulkDelete() = viewModelScope.launch {
        val tickers = _selectedTickers.value.toList()
        if (tickers.isEmpty()) return@launch
        runCatching { repo.bulkDeleteItems(watchlistId, tickers) }
            .onSuccess { _selectedTickers.value = emptySet() }
            .onFailure { _error.value = it.message }
    }

    fun bulkMoveToSection(sectionName: String?) = viewModelScope.launch {
        val tickers = _selectedTickers.value.toList()
        if (tickers.isEmpty()) return@launch
        runCatching { repo.bulkMoveSection(watchlistId, tickers, sectionName) }
            .onSuccess { _selectedTickers.value = emptySet() }
            .onFailure { _error.value = it.message }
    }

    fun addSection(name: String) = viewModelScope.launch {
        runCatching { repo.addSection(watchlistId, name) }
            .onFailure { _error.value = it.message }
    }

    fun deleteSection(name: String) = viewModelScope.launch {
        runCatching { repo.deleteSection(watchlistId, name) }
            .onFailure { _error.value = it.message }
    }

    fun dismissError() { _error.value = null }
}
