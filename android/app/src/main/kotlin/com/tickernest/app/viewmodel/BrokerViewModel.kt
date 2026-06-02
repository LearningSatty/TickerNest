package com.tickernest.app.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tickernest.app.PortfolioRepository
import com.tickernest.app.api.UpsertHoldingDto
import com.tickernest.app.db.BrokerHoldingEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class BrokerViewModel @Inject constructor(
    private val repo: PortfolioRepository,
    saved: SavedStateHandle,
) : ViewModel() {
    private val brokerId: String = checkNotNull(saved["brokerId"])

    val holdings: StateFlow<List<BrokerHoldingEntity>> =
        repo.observeHoldings(brokerId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        runCatching { repo.refreshBroker(brokerId) }
    }

    fun upsert(ticker: String, body: UpsertHoldingDto) = viewModelScope.launch {
        _busy.value = true
        try {
            repo.upsertHolding(brokerId, ticker, body)
        } finally {
            _busy.value = false
        }
    }
}
