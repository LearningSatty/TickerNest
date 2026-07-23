package com.tickernest.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
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
import com.tickernest.app.db.WatchlistEntity
import com.tickernest.app.ui.components.trendColor
import com.tickernest.app.viewmodel.WatchlistsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistsScreen(
    onOpenWatchlist: (String) -> Unit,
    vm: WatchlistsViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    var showCreate by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<WatchlistEntity?>(null) }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Watchlists") },
            actions = {
                IconButton(onClick = { vm.refresh() }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                }
                IconButton(onClick = { showCreate = true }) {
                    Icon(Icons.Default.Add, contentDescription = "New watchlist")
                }
            }
        )

        if (state.error != null) {
            Surface(
                color = MaterialTheme.colorScheme.errorContainer,
                modifier = Modifier.fillMaxWidth().padding(8.dp),
                shape = MaterialTheme.shapes.small,
            ) {
                Text(
                    state.error ?: "",
                    Modifier.padding(10.dp),
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
            }
        }

        if (state.loading && state.watchlists.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Column
        }

        if (state.watchlists.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No watchlists yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    FilledTonalButton(onClick = { showCreate = true }) { Text("Create one") }
                }
            }
            return@Column
        }

        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 4.dp)) {
            items(state.watchlists, key = { it.id }) { wl ->
                WatchlistRow(
                    wl = wl,
                    onClick = { onOpenWatchlist(wl.id) },
                    onDelete = { deleteTarget = wl },
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
            }
        }
    }

    // Create dialog
    if (showCreate) {
        CreateWatchlistDialog(
            onDismiss = { showCreate = false },
            onCreate = { name, market ->
                showCreate = false
                vm.createWatchlist(name, market) { id -> onOpenWatchlist(id) }
            },
        )
    }

    // Delete confirmation
    deleteTarget?.let { wl ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("Delete \"${wl.name}\"?") },
            text = { Text("This will permanently remove the watchlist and all its items.") },
            confirmButton = {
                TextButton(
                    onClick = { vm.deleteWatchlist(wl.id); deleteTarget = null },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun WatchlistRow(
    wl: WatchlistEntity,
    onClick: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (wl.isPinned) {
                    Icon(Icons.Default.PushPin, contentDescription = null,
                        modifier = Modifier.size(13.dp),
                        tint = MaterialTheme.colorScheme.primary)
                }
                Text(wl.name, fontWeight = FontWeight.Medium, fontSize = 15.sp)
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MarketChip(wl.market)
                Text(
                    "${wl.itemCount} ticker${if (wl.itemCount != 1) "s" else ""}",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!wl.description.isNullOrBlank()) {
                    Text("·", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        wl.description,
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        Row {
            Icon(
                Icons.Default.ChevronRight,
                contentDescription = "Open",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            IconButton(onClick = onDelete, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Default.DeleteOutline,
                    contentDescription = "Delete",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun MarketChip(market: String) {
    val (flag, label) = when (market) {
        "IN" -> "🇮🇳" to "IN"
        "US" -> "🇺🇸" to "US"
        else -> "🌐" to market
    }
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.extraSmall,
    ) {
        Text(
            "$flag $label",
            Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
            fontSize = 10.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateWatchlistDialog(
    onDismiss: () -> Unit,
    onCreate: (name: String, market: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var market by remember { mutableStateOf("IN") }
    val markets = listOf("IN" to "🇮🇳 Indian", "US" to "🇺🇸 US", "OTHER" to "🌐 Other")
    var marketExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New Watchlist") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                ExposedDropdownMenuBox(
                    expanded = marketExpanded,
                    onExpandedChange = { marketExpanded = it },
                ) {
                    OutlinedTextField(
                        value = markets.first { it.first == market }.second,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Market") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(marketExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor(),
                    )
                    ExposedDropdownMenu(
                        expanded = marketExpanded,
                        onDismissRequest = { marketExpanded = false },
                    ) {
                        markets.forEach { (k, v) ->
                            DropdownMenuItem(
                                text = { Text(v) },
                                onClick = { market = k; marketExpanded = false },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { if (name.isNotBlank()) onCreate(name.trim(), market) },
                enabled = name.isNotBlank(),
            ) { Text("Create") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
