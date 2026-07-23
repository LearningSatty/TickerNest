package com.tickernest.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tickernest.app.PortfolioRepository
import com.tickernest.app.db.SoldShareEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SoldSharesViewModel @Inject constructor(
    private val repo: PortfolioRepository,
) : ViewModel() {

    val soldShares: StateFlow<List<SoldShareEntity>> =
        repo.observeSoldShares()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        runCatching { repo.refreshSoldShares() }
    }
}
