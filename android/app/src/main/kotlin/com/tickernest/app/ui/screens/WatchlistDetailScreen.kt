package com.tickernest.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tickernest.app.api.SearchHitDto
import com.tickernest.app.db.WatchlistItemEntity
import com.tickernest.app.ui.Theme
import com.tickernest.app.ui.components.trendColor
import com.tickernest.app.viewmodel.WatchlistDetailViewModel
import com.tickernest.core.Currency
import com.tickernest.core.D
import com.tickernest.core.formatMoney
import com.tickernest.core.formatPct
import com.tickernest.core.formatSignedMoney

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistDetailScreen(
    onBack: () -> Unit,
    vm: WatchlistDetailViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    var showAddSearch by remember { mutableStateOf(false) }
    var showNewSection by remember { mutableStateOf(false) }
    var showBulkSection by remember { mutableStateOf(false) }
    var deleteItemTarget by remember { mutableStateOf<String?>(null) }
    var deleteSectionTarget by remember { mutableStateOf<String?>(null) }

    val someSelected = state.selectedTickers.isNotEmpty()
    val allSelected = state.items.isNotEmpty() &&
        state.selectedTickers.size == state.items.size

    // Group items by section
    val grouped = remember(state.items, state.sections) {
        val map = LinkedHashMap<String?, MutableList<WatchlistItemEntity>>()
        map[null] = mutableListOf() // Ungrouped first
        state.sections.forEach { map[it] = mutableListOf() }
        state.items.forEach { item ->
            map.getOrPut(item.sectionName) { mutableListOf() }.add(item)
        }
        map
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(state.watchlist?.name ?: "Watchlist", maxLines = 1)
                        Text(
                            "${state.items.size} tickers · auto-refresh 10s",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showNewSection = true }) {
                        Icon(Icons.Default.Add, contentDescription = "Add section")
                    }
                    IconButton(onClick = { showAddSearch = true }) {
                        Icon(Icons.Default.Search, contentDescription = "Add stock")
                    }
                    IconButton(onClick = { vm.refresh() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(Modifier.fillMaxSize().padding(innerPadding)) {

            // Error banner
            state.error?.let { err ->
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    modifier = Modifier.fillMaxWidth().padding(8.dp),
                    shape = MaterialTheme.shapes.small,
                ) {
                    Row(
                        Modifier.padding(10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(err, fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.weight(1f))
                        IconButton(onClick = { vm.dismissError() }, Modifier.size(24.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Dismiss",
                                modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }

            // Bulk action bar
            if (state.items.isNotEmpty()) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Checkbox(
                            checked = allSelected,
                            onCheckedChange = {
                                if (allSelected) vm.clearSelection() else vm.selectAll()
                            },
                            modifier = Modifier.size(20.dp),
                        )
                        Text(
                            if (someSelected) "${state.selectedTickers.size} selected" else "Select all",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (someSelected) {
                            Spacer(Modifier.weight(1f))
                            // Move to section
                            if (state.sections.isNotEmpty()) {
                                FilledTonalButton(
                                    onClick = { showBulkSection = true },
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                    modifier = Modifier.height(30.dp),
                                ) {
                                    Text("Move to section", fontSize = 11.sp)
                                }
                            }
                            // Delete
                            FilledTonalButton(
                                onClick = { vm.bulkDelete() },
                                colors = ButtonDefaults.filledTonalButtonColors(
                                    containerColor = MaterialTheme.colorScheme.errorContainer,
                                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                                ),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                modifier = Modifier.height(30.dp),
                            ) {
                                Text("Delete ${state.selectedTickers.size}", fontSize = 11.sp)
                            }
                        }
                    }
                }
            }

            if (state.loading && state.items.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Column
            }

            if (state.items.isEmpty() && !state.loading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("No stocks yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(8.dp))
                        FilledTonalButton(onClick = { showAddSearch = true }) {
                            Text("Add a stock")
                        }
                    }
                }
                return@Column
            }

            LazyColumn(Modifier.fillMaxSize()) {
                grouped.forEach { (sectionName, sectionItems) ->
                    // Section header
                    if (sectionName != null || sectionItems.isNotEmpty()) {
                        item(key = "section_$sectionName") {
                            SectionHeader(
                                name = sectionName ?: "UNGROUPED",
                                isUngrouped = sectionName == null,
                                itemCount = sectionItems.size,
                                onDelete = if (sectionName != null) {
                                    { deleteSectionTarget = sectionName }
                                } else null,
                            )
                        }
                    }
                    // Items
                    items(sectionItems, key = { "${it.watchlistId}:${it.ticker}" }) { item ->
                        WatchlistItemRow(
                            item = item,
                            isSelected = state.selectedTickers.contains(item.ticker),
                            onToggleSelect = { vm.toggleSelect(item.ticker) },
                            onDelete = { deleteItemTarget = item.ticker },
                        )
                        HorizontalDivider(
                            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                        )
                    }
                }
            }
        }
    }

    // Add stock search sheet
    if (showAddSearch) {
        AddStockBottomSheet(
            state = state,
            sections = state.sections,
            onDismiss = { showAddSearch = false; vm.clearSearch() },
            onQueryChange = { vm.setSearchQuery(it) },
            onAdd = { hit, section, note ->
                vm.addItem(hit.ticker, hit.name, section, note)
                showAddSearch = false
            },
        )
    }

    // New section dialog
    if (showNewSection) {
        NewSectionDialog(
            onDismiss = { showNewSection = false },
            onCreate = { name -> vm.addSection(name); showNewSection = false },
        )
    }

    // Bulk move to section
    if (showBulkSection) {
        BulkMoveSectionSheet(
            sections = state.sections,
            onDismiss = { showBulkSection = false },
            onMove = { section ->
                vm.bulkMoveToSection(section)
                showBulkSection = false
            },
        )
    }

    // Delete item confirmation
    deleteItemTarget?.let { ticker ->
        AlertDialog(
            onDismissRequest = { deleteItemTarget = null },
            title = { Text("Remove $ticker?") },
            confirmButton = {
                TextButton(
                    onClick = { vm.removeItem(ticker); deleteItemTarget = null },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Remove") }
            },
            dismissButton = {
                TextButton(onClick = { deleteItemTarget = null }) { Text("Cancel") }
            },
        )
    }

    // Delete section confirmation
    deleteSectionTarget?.let { name ->
        AlertDialog(
            onDismissRequest = { deleteSectionTarget = null },
            title = { Text("Delete section \"$name\"?") },
            text = { Text("Items will become ungrouped.") },
            confirmButton = {
                TextButton(
                    onClick = { vm.deleteSection(name); deleteSectionTarget = null },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { deleteSectionTarget = null }) { Text("Cancel") }
            },
        )
    }
}

// ── Section header row ─────────────────────────────────────────────────────────

@Composable
private fun SectionHeader(
    name: String,
    isUngrouped: Boolean,
    itemCount: Int,
    onDelete: (() -> Unit)?,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(
                if (isUngrouped) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                else MaterialTheme.colorScheme.surfaceVariant
            )
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                name.uppercase(),
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                letterSpacing = 0.8.sp,
            )
            Text(
                "($itemCount)",
                fontSize = 10.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
            )
        }
        if (!isUngrouped && onDelete != null) {
            IconButton(onClick = onDelete, Modifier.size(28.dp)) {
                Icon(Icons.Default.Close, contentDescription = "Delete section",
                    modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ── Watchlist item row ─────────────────────────────────────────────────────────

@Composable
private fun WatchlistItemRow(
    item: WatchlistItemEntity,
    isSelected: Boolean,
    onToggleSelect: () -> Unit,
    onDelete: () -> Unit,
) {
    val ltp = D(item.currentPrice)
    val prev = D(item.prevClose)
    val change = D(item.dayChange)
    val changePct = D(item.dayChangePct)
    val cur = if (item.currency == "USD") Currency.USD else Currency.INR

    // Display name logic: show full name on top, ticker below only if different
    val displayName = if (item.name != item.ticker) item.name
                      else item.ticker.replace(Regex("\\.(NS|BO)$"), "")
    val showTicker = item.ticker != displayName

    Row(
        Modifier
            .fillMaxWidth()
            .background(if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.08f) else Color.Transparent)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = isSelected,
            onCheckedChange = { onToggleSelect() },
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(8.dp))

        // Name + ticker
        Column(Modifier.weight(1.5f)) {
            Text(displayName, fontWeight = FontWeight.Medium, fontSize = 14.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (showTicker) {
                Text(item.ticker, fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            item.note?.let {
                Text("📝 $it", fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }

        // LTP
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.weight(1f)) {
            Text(formatMoney(ltp, cur), fontSize = 13.sp, fontWeight = FontWeight.Medium)
        }

        // Change
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.weight(1f)) {
            Text(formatSignedMoney(change, cur), fontSize = 12.sp, color = trendColor(change))
            Text(formatPct(changePct), fontSize = 11.sp, color = trendColor(changePct))
        }

        // Delete
        IconButton(onClick = onDelete, Modifier.size(32.dp)) {
            Icon(Icons.Default.Close, contentDescription = "Remove",
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ── Add stock bottom sheet ─────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddStockBottomSheet(
    state: com.tickernest.app.viewmodel.WatchlistDetailUiState,
    sections: List<String>,
    onDismiss: () -> Unit,
    onQueryChange: (String) -> Unit,
    onAdd: (hit: SearchHitDto, section: String?, note: String?) -> Unit,
) {
    var note by remember { mutableStateOf("") }
    var selectedSection by remember { mutableStateOf<String?>(null) }
    var sectionExpanded by remember { mutableStateOf(false) }
    var pickedHit by remember { mutableStateOf<SearchHitDto?>(null) }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.padding(horizontal = 16.dp).padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Add Stock", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)

            if (pickedHit == null) {
                // Search field
                OutlinedTextField(
                    value = state.searchQuery,
                    onValueChange = onQueryChange,
                    label = { Text("Search ticker / name") },
                    trailingIcon = {
                        if (state.searchLoading) {
                            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        }
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                // Results
                if (state.searchResults.isNotEmpty()) {
                    Surface(
                        shape = MaterialTheme.shapes.medium,
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column {
                            state.searchResults.take(8).forEach { hit ->
                                Row(
                                    Modifier
                                        .fillMaxWidth()
                                        .clickable { pickedHit = hit }
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(hit.name, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text("${hit.ticker} · ${hit.exchange}", fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Icon(Icons.Default.Add, contentDescription = null,
                                        Modifier.size(18.dp),
                                        tint = MaterialTheme.colorScheme.primary)
                                }
                                HorizontalDivider(
                                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                                )
                            }
                        }
                    }
                }
            } else {
                // Picked — show confirmation form
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(pickedHit!!.name, fontWeight = FontWeight.Medium)
                            Text("${pickedHit!!.ticker} · ${pickedHit!!.exchange}", fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onClick = { pickedHit = null; onQueryChange("") }) {
                            Icon(Icons.Default.Close, contentDescription = "Clear pick")
                        }
                    }
                }

                // Optional note
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Note (optional)") },
                    placeholder = { Text("e.g. Breakout above 200 DMA") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                // Section selector
                if (sections.isNotEmpty()) {
                    ExposedDropdownMenuBox(
                        expanded = sectionExpanded,
                        onExpandedChange = { sectionExpanded = it },
                    ) {
                        OutlinedTextField(
                            value = selectedSection ?: "None",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Section") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(sectionExpanded) },
                            modifier = Modifier.fillMaxWidth().menuAnchor(),
                        )
                        ExposedDropdownMenu(
                            expanded = sectionExpanded,
                            onDismissRequest = { sectionExpanded = false },
                        ) {
                            DropdownMenuItem(
                                text = { Text("None") },
                                onClick = { selectedSection = null; sectionExpanded = false },
                            )
                            sections.forEach { s ->
                                DropdownMenuItem(
                                    text = { Text(s) },
                                    onClick = { selectedSection = s; sectionExpanded = false },
                                )
                            }
                        }
                    }
                }

                Button(
                    onClick = {
                        onAdd(pickedHit!!, selectedSection, note.ifBlank { null })
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Add to Watchlist")
                }
            }
        }
    }
}

// ── New section dialog ─────────────────────────────────────────────────────────

@Composable
private fun NewSectionDialog(onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create Section") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Section name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            Button(
                onClick = { if (name.isNotBlank()) onCreate(name.trim()) },
                enabled = name.isNotBlank(),
            ) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ── Bulk move section sheet ────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BulkMoveSectionSheet(
    sections: List<String>,
    onDismiss: () -> Unit,
    onMove: (String?) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.padding(horizontal = 16.dp).padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text("Move to Section", fontWeight = FontWeight.SemiBold, fontSize = 16.sp,
                modifier = Modifier.padding(bottom = 8.dp))
            // Ungrouped option
            ListItem(
                headlineContent = { Text("Ungrouped", fontStyle = androidx.compose.ui.text.font.FontStyle.Italic) },
                modifier = Modifier.clickable { onMove(null) },
                colors = ListItemDefaults.colors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                ),
            )
            HorizontalDivider()
            sections.forEach { s ->
                ListItem(
                    headlineContent = { Text(s) },
                    modifier = Modifier.clickable { onMove(s) },
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
            }
        }
    }
}
