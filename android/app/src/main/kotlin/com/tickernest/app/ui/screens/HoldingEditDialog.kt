package com.tickernest.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.tickernest.app.api.UpsertHoldingDto
import com.tickernest.app.db.BrokerHoldingEntity
import com.tickernest.core.D
import com.tickernest.core.HoldingState
import com.tickernest.core.HoldingUpsertRequest
import com.tickernest.core.Plan
import com.tickernest.core.formatMoney
import com.tickernest.core.formatSignedMoney
import com.tickernest.core.planHoldingUpsert
import com.tickernest.app.ui.components.trendColor

/**
 * Edit dialog. Uses the SAME planHoldingUpsert as the server to classify the
 * intent locally (Update / Reduce / Full Exit) and show the right UI affordances
 * — no server round trip needed for the preview.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HoldingEditDialog(
    current: BrokerHoldingEntity,
    onDismiss: () -> Unit,
    onSubmit: (UpsertHoldingDto) -> Unit,
) {
    var qty by remember { mutableStateOf(current.qty) }
    var avgCost by remember { mutableStateOf(current.avgCost) }
    var soldPrice by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var mistake by remember { mutableStateOf("") }

    val plan = remember(qty, avgCost) {
        runCatching {
            planHoldingUpsert(
                HoldingState(D(current.qty), D(current.avgCost)),
                HoldingUpsertRequest(
                    desired = HoldingState(D(qty.ifBlank { "0" }), D(avgCost.ifBlank { "0" })),
                    soldPrice = soldPrice.takeIf { it.isNotBlank() }?.let(::D),
                    reason = reason.ifBlank { null },
                    mistake = mistake.ifBlank { null },
                ),
            )
        }.getOrNull()
    }
    val showSellMeta = plan is Plan.Update && plan.soldShare != null || plan is Plan.FullExit

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            color = MaterialTheme.colorScheme.surface,
            shape = MaterialTheme.shapes.large,
            modifier = Modifier.padding(24.dp)
        ) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(current.ticker, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                        current.name?.let {
                            Text(it, fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    AssistChip(
                        onClick = {},
                        label = {
                            Text(
                                when (plan) {
                                    is Plan.FullExit -> "Full Exit"
                                    is Plan.Update -> if (plan.soldShare != null) "Reduce" else "Update"
                                    is Plan.Insert -> "Insert"
                                    Plan.Noop, null -> "—"
                                }
                            )
                        }
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = qty, onValueChange = { qty = it },
                        label = { Text("Quantity") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = avgCost, onValueChange = { avgCost = it },
                        label = { Text("Avg. Price") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                }
                if (showSellMeta) {
                    Divider()
                    Text(
                        "Cost basis frozen at ${formatMoney(D(current.avgCost))} on sell.",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = soldPrice, onValueChange = { soldPrice = it },
                        label = { Text("Sold Price (optional)") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = reason, onValueChange = { reason = it },
                        label = { Text("Reason") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = mistake, onValueChange = { mistake = it },
                        label = { Text("Mistake (retrospective)") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                // Live preview
                val preview = runCatching {
                    val newQty = D(qty.ifBlank { "0" })
                    val newAvg = D(avgCost.ifBlank { "0" })
                    val ltp = current.currentPrice?.let(::D) ?: D("0")
                    val invested = newQty.multiply(newAvg)
                    val cur = newQty.multiply(ltp)
                    Triple(invested, cur, cur.subtract(invested))
                }.getOrNull()
                if (preview != null) {
                    Row(
                        Modifier.fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                            .padding(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        PreviewCol("Invested", formatMoney(preview.first))
                        PreviewCol("Cur. Value", formatMoney(preview.second))
                        PreviewCol(
                            "P/L", formatSignedMoney(preview.third),
                            color = trendColor(preview.third)
                        )
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = {
                        onSubmit(
                            UpsertHoldingDto(
                                qty = qty,
                                avgCost = avgCost,
                                soldPrice = soldPrice.takeIf { it.isNotBlank() },
                                reason = reason.takeIf { it.isNotBlank() },
                                mistake = mistake.takeIf { it.isNotBlank() },
                            )
                        )
                    }) {
                        Text(
                            when (plan) {
                                is Plan.FullExit -> "Save & Record Exit"
                                is Plan.Update -> if (plan.soldShare != null) "Save & Record Sell" else "Save"
                                else -> "Save"
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PreviewCol(label: String, value: String, color: androidx.compose.ui.graphics.Color? = null) {
    Column {
        Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value, fontSize = 13.sp, fontWeight = FontWeight.Medium,
            color = color ?: MaterialTheme.colorScheme.onBackground,
        )
    }
}
