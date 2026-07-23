package com.tickernest.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import com.tickernest.app.db.SoldShareEntity
import com.tickernest.app.ui.components.trendColor
import com.tickernest.app.viewmodel.SoldSharesViewModel
import com.tickernest.core.D
import com.tickernest.core.formatMoney
import com.tickernest.core.formatSignedMoney
import com.tickernest.core.formatPct
import com.tickernest.core.formatQty

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SoldSharesScreen(vm: SoldSharesViewModel = hiltViewModel()) {
    val shares by vm.soldShares.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Sold Shares Journal") },
            actions = {
                IconButton(onClick = { vm.refresh() }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                }
            }
        )

        if (shares.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No sold shares yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            return@Column
        }

        // Summary strip
        val totalPnl = remember(shares) {
            shares.fold(D("0")) { acc, s ->
                val cost = D(s.costBasisAtSell).multiply(D(s.qty))
                val sold = s.soldPrice?.let { D(it).multiply(D(s.qty)) } ?: D("0")
                acc.add(sold.subtract(cost))
            }
        }
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${shares.size} exits recorded", fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(horizontalAlignment = Alignment.End) {
                    Text("Realised P/L", fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        formatSignedMoney(totalPnl),
                        fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                        color = trendColor(totalPnl),
                    )
                }
            }
        }

        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 4.dp)) {
            items(shares, key = { it.id }) { share ->
                SoldShareRow(share)
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
            }
        }
    }
}

@Composable
private fun SoldShareRow(s: SoldShareEntity) {
    val qty = D(s.qty)
    val cost = D(s.costBasisAtSell)
    val invested = qty.multiply(cost)
    val soldVal = s.soldPrice?.let { D(it).multiply(qty) }
    val pnl = soldVal?.subtract(invested)
    val pnlPct = pnl?.let {
        if (invested.signum() == 0) D("0")
        else it.divide(invested, java.math.MathContext.DECIMAL64)
    }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text(
                    s.name ?: s.ticker,
                    fontWeight = FontWeight.Medium,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (s.name != null && s.name != s.ticker) {
                    Text(s.ticker, fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    "Sold ${s.soldAt.take(10)}",
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                if (pnl != null) {
                    Text(
                        formatSignedMoney(pnl),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = trendColor(pnl),
                    )
                    pnlPct?.let {
                        Text(formatPct(it), fontSize = 11.sp, color = trendColor(it))
                    }
                } else {
                    Text("—", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            LabelVal("Qty", formatQty(qty))
            LabelVal("Cost", formatMoney(cost))
            s.soldPrice?.let { LabelVal("Sold @", formatMoney(D(it))) }
        }

        if (!s.reason.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(
                "📝 ${s.reason}",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (!s.mistake.isNullOrBlank()) {
            Text(
                "⚠ ${s.mistake}",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun LabelVal(label: String, value: String) {
    Column {
        Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}
