package com.tickernest.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tickernest.app.PortfolioRepository
import com.tickernest.app.db.BrokerEntity
import com.tickernest.app.db.ConsolidatedRowEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ConsolidatedUiState(
    val rows: List<ConsolidatedRowEntity> = emptyList(),
    val brokers: List<BrokerEntity> = emptyList(),
    val refreshing: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ConsolidatedViewModel @Inject constructor(
    private val repo: PortfolioRepository,
) : ViewModel() {

    val state: StateFlow<ConsolidatedUiState> = combine(
        repo.observeConsolidated(),
        repo.observeBrokers(),
    ) { rows, brokers -> ConsolidatedUiState(rows = rows, brokers = brokers) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000),
                 ConsolidatedUiState())

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        try {
            repo.refreshConsolidated()
        } catch (t: Throwable) {
            // Push to error stream — the screen surfaces it as a snackbar.
        }
    }
}
