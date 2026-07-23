package com.tickernest.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.tickernest.app.ui.TickerNestTheme
import com.tickernest.app.ui.screens.*
import com.tickernest.app.viewmodel.BrokerViewModel
import dagger.hilt.android.AndroidEntryPoint

private enum class Tab(
    val route: String,
    val label: String,
    val icon: ImageVector,
) {
    Portfolio("consolidated", "Portfolio", Icons.Default.PieChart),
    Watchlists("watchlists", "Watchlists", Icons.Default.Bookmarks),
    SoldShares("sold_shares", "Journal", Icons.Default.History),
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TickerNestTheme {
                Surface(Modifier.fillMaxSize()) {
                    MainNav()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainNav() {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    // Determine if we are on a top-level tab route (hide bottom bar on sub-screens)
    val tabRoutes = Tab.entries.map { it.route }.toSet()
    val showBottomBar = currentRoute in tabRoutes

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    Tab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = {
                                if (currentRoute != tab.route) {
                                    nav.navigate(tab.route) {
                                        popUpTo(Tab.Portfolio.route) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = nav,
            startDestination = Tab.Portfolio.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            // ── Portfolio / Consolidated ────────────────────────────────────────
            composable(Tab.Portfolio.route) {
                ConsolidatedScreen(
                    onOpenBroker = { brokerId -> nav.navigate("broker/$brokerId") },
                )
            }

            // ── Broker holdings ────────────────────────────────────────────────
            composable(
                "broker/{brokerId}",
                arguments = listOf(navArgument("brokerId") { type = NavType.StringType }),
            ) {
                val vm: BrokerViewModel = hiltViewModel()
                var editing by remember {
                    mutableStateOf<com.tickernest.app.db.BrokerHoldingEntity?>(null)
                }
                BrokerScreen(
                    onBack = { nav.popBackStack() },
                    onEdit = { editing = it },
                    onImportCsv = { /* future */ },
                    vm = vm,
                )
                editing?.let { row ->
                    HoldingEditDialog(
                        current = row,
                        onDismiss = { editing = null },
                        onSubmit = { dto ->
                            vm.upsert(row.ticker, dto)
                            editing = null
                        },
                    )
                }
            }

            // ── Watchlists hub ─────────────────────────────────────────────────
            composable(Tab.Watchlists.route) {
                WatchlistsScreen(
                    onOpenWatchlist = { id -> nav.navigate("watchlist/$id") },
                )
            }

            // ── Watchlist detail ────────────────────────────────────────────────
            composable(
                "watchlist/{watchlistId}",
                arguments = listOf(navArgument("watchlistId") { type = NavType.StringType }),
            ) {
                WatchlistDetailScreen(
                    onBack = { nav.popBackStack() },
                )
            }

            // ── Sold shares journal ────────────────────────────────────────────
            composable(Tab.SoldShares.route) {
                SoldSharesScreen()
            }
        }
    }
}
