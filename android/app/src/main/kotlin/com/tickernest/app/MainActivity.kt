package com.tickernest.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import com.tickernest.app.ui.TickerNestTheme
import com.tickernest.app.ui.screens.BrokerScreen
import com.tickernest.app.ui.screens.ConsolidatedScreen
import com.tickernest.app.ui.screens.HoldingEditDialog
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import com.tickernest.app.viewmodel.BrokerViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TickerNestTheme {
                Surface(Modifier.fillMaxSize()) {
                    val nav = rememberNavController()
                    NavHost(nav, startDestination = "consolidated") {
                        composable("consolidated") { ConsolidatedScreen() }
                        composable(
                            "broker/{brokerId}",
                            arguments = listOf(navArgument("brokerId") { type = NavType.StringType }),
                        ) {
                            val vm: BrokerViewModel = hiltViewModel()
                            var editing by remember { mutableStateOf<com.tickernest.app.db.BrokerHoldingEntity?>(null) }
                            BrokerScreen(
                                onEdit = { editing = it },
                                onImportCsv = { /* nav.navigate("import/...") */ },
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
                    }
                }
            }
        }
    }
}
