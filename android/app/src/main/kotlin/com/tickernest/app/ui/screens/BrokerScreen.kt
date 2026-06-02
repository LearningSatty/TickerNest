package com.tickernest.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tickernest.app.db.BrokerHoldingEntity
import com.tickernest.app.viewmodel.BrokerViewModel
import com.tickernest.core.D
import com.tickernest.core.formatMoney
import com.tickernest.core.formatPct
import com.tickernest.core.formatQty
import com.tickernest.core.formatSignedMoney
import com.tickernest.app.ui.components.trendColor

@Composable
fun BrokerScreen(
    onEdit: (BrokerHoldingEntity) -> Unit,
    onImportCsv: () -> Unit,
    vm: BrokerViewModel = hiltViewModel(),
) {
    val rows by vm.holdings.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Holdings (${rows.size})", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            FilledTonalButton(onClick = onImportCsv) { Text("Import CSV") }
        }
        LazyColumn(Modifier.fillMaxSize()) {
            items(rows, key = { "${it.brokerId}:${it.ticker}" }) { h ->
                HoldingRow(h, onClick = { onEdit(h) })
                Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
            }
        }
    }
}

@Composable
private fun HoldingRow(h: BrokerHoldingEntity, onClick: () -> Unit) {
    val qty = D(h.qty)
    val avg = D(h.avgCost)
    val ltp = h.currentPrice?.let(::D) ?: D("0")
    val prev = h.prevClose?.let(::D) ?: D("0")
    val change = ltp.subtract(prev)
    val changePct = if (prev.signum() == 0) D("0") else change.divide(prev, java.math.MathContext.DECIMAL64)
    val invested = qty.multiply(avg)
    val curCost = qty.multiply(ltp)
    val pnl = curCost.subtract(invested)
    val pnlPct = if (invested.signum() == 0) D("0") else pnl.divide(invested, java.math.MathContext.DECIMAL64)
    val zeroQty = qty.signum() == 0

    Row(
        Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Column(Modifier.weight(1.4f)) {
            Text(h.ticker, fontWeight = FontWeight.Medium)
            h.name?.let {
                Text(it, fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            h.sector?.let {
                Text(it, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Column(Modifier.weight(1f)) {
            Text(formatQty(qty), fontSize = 13.sp)
            Text("@ ${formatMoney(avg)}", fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(Modifier.weight(1f)) {
            Text(formatMoney(ltp), fontSize = 13.sp)
            Text(formatPct(changePct), fontSize = 11.sp, color = trendColor(changePct))
        }
        Column(Modifier.weight(1.1f)) {
            Text(formatSignedMoney(pnl), fontSize = 13.sp, color = trendColor(pnl))
            Text(formatPct(pnlPct), fontSize = 11.sp, color = trendColor(pnlPct))
        }
    }
    if (zeroQty) {
        // Visual marker for retained-but-zero positions.
        Text(
            "Closed position — kept for history",
            fontSize = 10.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 12.dp, bottom = 4.dp)
        )
    }
}
