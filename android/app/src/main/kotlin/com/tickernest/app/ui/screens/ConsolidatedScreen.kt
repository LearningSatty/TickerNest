package com.tickernest.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFeature
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tickernest.app.db.BrokerEntity
import com.tickernest.app.db.ConsolidatedRowEntity
import com.tickernest.app.viewmodel.ConsolidatedViewModel
import com.tickernest.core.D
import com.tickernest.core.formatMoney
import com.tickernest.core.formatPct
import com.tickernest.core.formatQty
import com.tickernest.core.formatSignedMoney
import com.tickernest.app.api.PerBrokerCellDto
import com.tickernest.app.ui.components.trendColor
import kotlinx.serialization.json.Json
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.foundation.layout.PaddingValues

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsolidatedScreen(vm: ConsolidatedViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val tabular = TextStyle(
        fontFeatureSettings = "tnum",
    )

    Column(Modifier.fillMaxSize()) {
        // KPI strip
        KpiStrip(state.rows)

        // Pivot header + body. Horizontal scroll wraps both so they stay aligned.
        val hScroll = rememberScrollState()
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(hScroll)
                .background(MaterialTheme.colorScheme.surface)
        ) {
            Column {
                PivotHeader(state.brokers)
                LazyColumn(Modifier.weight(1f)) {
                    items(state.rows, key = { it.ticker }) { row ->
                        PivotRow(row, state.brokers, tabular)
                    }
                }
            }
        }
    }
}

@Composable
private fun KpiStrip(rows: List<ConsolidatedRowEntity>) {
    val totals = remember(rows) {
        if (rows.isEmpty()) null
        else {
            var inv = D("0"); var cur = D("0"); var day = D("0")
            for (r in rows) {
                inv = inv.add(D(r.investedValue))
                cur = cur.add(D(r.currentValue))
                day = day.add(D(r.todaysChange))
            }
            val pnl = cur.subtract(inv)
            val pnlPct = if (inv.signum() == 0) D("0") else pnl.divide(inv, java.math.MathContext.DECIMAL64)
            Quad(inv, cur, pnl, pnlPct, day)
        }
    }
    if (totals != null) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Kpi("Invested", formatMoney(totals.invested))
            Kpi("Cur. Value", formatMoney(totals.curValue), accent = true)
            Kpi("Today", formatSignedMoney(totals.dayChange), color = trendColor(totals.dayChange))
            Kpi("Overall", formatSignedMoney(totals.overallPnl), color = trendColor(totals.overallPnl),
                sub = formatPct(totals.overallPnlPct))
        }
    }
}

private data class Quad(
    val invested: java.math.BigDecimal,
    val curValue: java.math.BigDecimal,
    val overallPnl: java.math.BigDecimal,
    val overallPnlPct: java.math.BigDecimal,
    val dayChange: java.math.BigDecimal,
)

@Composable
private fun Kpi(label: String, value: String, color: Color? = null, accent: Boolean = false, sub: String? = null) {
    Column {
        Text(label.uppercase(), fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
            color = color ?: if (accent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onBackground,
        )
        if (sub != null) Text(sub, fontSize = 10.sp, color = color ?: MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun PivotHeader(brokers: List<BrokerEntity>) {
    Row(
        Modifier
            .background(MaterialTheme.colorScheme.surface)
            .padding(vertical = 8.dp, horizontal = 8.dp)
    ) {
        HeaderCell("Ticker", 120.dp, TextAlign.Start)
        HeaderCell("Qty", 80.dp)
        HeaderCell("LTP", 90.dp)
        HeaderCell("Cur. Value", 110.dp)
        for (b in brokers.sortedBy { it.sortOrder }) {
            HeaderCell(b.displayName, 100.dp)
            HeaderCell("Avg.", 90.dp)
        }
        HeaderCell("Today Δ", 100.dp)
        HeaderCell("Today %", 80.dp)
        HeaderCell("Invested", 110.dp)
        HeaderCell("P/L", 110.dp)
        HeaderCell("P/L %", 80.dp)
        HeaderCell("% Port.", 80.dp)
    }
}

@Composable
private fun HeaderCell(label: String, width: androidx.compose.ui.unit.Dp, align: TextAlign = TextAlign.End) {
    Text(
        label,
        Modifier.width(width).padding(end = 6.dp),
        fontSize = 10.sp, fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = align,
    )
}

@Composable
private fun PivotRow(row: ConsolidatedRowEntity, brokers: List<BrokerEntity>, tab: TextStyle) {
    val perBroker = remember(row.perBrokerJson) {
        runCatching {
            Json { ignoreUnknownKeys = true }.decodeFromString<List<PerBrokerCellDto>>(row.perBrokerJson)
        }.getOrDefault(emptyList())
            .associateBy { it.brokerId }
    }
    Row(Modifier.padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.width(120.dp)) {
            Text(row.ticker, fontWeight = FontWeight.Medium, style = tab)
            row.name?.let { Text(it, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Cell(formatQty(D(row.totalQty)), 80.dp, tab)
        Cell(formatMoney(D(row.currentPrice)), 90.dp, tab)
        Cell(formatMoney(D(row.currentValue)), 110.dp, tab)
        for (b in brokers.sortedBy { it.sortOrder }) {
            val c = perBroker[b.id]
            val has = c != null && D(c.qty).signum() > 0
            Cell(if (has) formatQty(D(c!!.qty)) else "—", 100.dp, tab,
                color = if (has) MaterialTheme.colorScheme.onBackground else Flat)
            Cell(if (has) formatMoney(D(c!!.avgCost)) else "—", 90.dp, tab,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Cell(formatSignedMoney(D(row.todaysChange)), 100.dp, tab,
            color = trendColor(D(row.todaysChange)))
        Cell(formatPct(D(row.todaysChangePct)), 80.dp, tab,
            color = trendColor(D(row.todaysChangePct)))
        Cell(formatMoney(D(row.investedValue)), 110.dp, tab)
        Cell(formatSignedMoney(D(row.totalPnl)), 110.dp, tab,
            color = trendColor(D(row.totalPnl)))
        Cell(formatPct(D(row.totalPnlPct)), 80.dp, tab,
            color = trendColor(D(row.totalPnlPct)))
        Cell(formatPct(D(row.percentOfPortfolio)), 80.dp, tab,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Cell(text: String, width: androidx.compose.ui.unit.Dp, tab: TextStyle, color: Color? = null) {
    Text(
        text,
        Modifier.width(width).padding(end = 6.dp),
        fontSize = 13.sp,
        textAlign = TextAlign.End,
        color = color ?: MaterialTheme.colorScheme.onBackground,
        style = tab,
    )
}

private val Flat = Color(0xFF94A3B8)
