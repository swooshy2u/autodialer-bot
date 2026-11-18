package com.autodialer.bot.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.autodialer.bot.logic.PhoneParser
import com.autodialer.bot.model.DialerPhase
import com.autodialer.bot.model.DialerUiState
import com.autodialer.bot.model.MicLockMode
import com.autodialer.bot.model.QueueItem
import com.autodialer.bot.model.QueueItemStatus
import com.autodialer.bot.service.DialerRepository
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private enum class ScreenTab { QUEUE, SETTINGS, HISTORY }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DialerScreen(
    state: DialerUiState,
    onStartBot: () -> Unit,
    onStopBot: () -> Unit,
    onHangupAndNext: () -> Unit,
    onSkipCurrent: () -> Unit,
    onToggleManualMic: () -> Unit,
    onRequestDefaultDialer: () -> Unit
) {
    var activeTab by remember { mutableStateOf(ScreenTab.QUEUE) }
    var showBulkDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "АвтоДозвон Бот",
                        fontWeight = FontWeight.SemiBold
                    )
                },
                actions = {
                    if (state.isRunning) {
                        TextButton(onClick = onStopBot) {
                            Text("Стоп", color = MaterialTheme.colorScheme.error)
                        }
                    } else {
                        TextButton(onClick = { showBulkDialog = true }) {
                            Text("Импорт")
                        }
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = activeTab == ScreenTab.QUEUE,
                    onClick = { activeTab = ScreenTab.QUEUE },
                    icon = { Icon(Icons.Default.PlayArrow, contentDescription = null) },
                    label = { Text("Очередь") }
                )
                NavigationBarItem(
                    selected = activeTab == ScreenTab.SETTINGS,
                    onClick = { activeTab = ScreenTab.SETTINGS },
                    icon = { Icon(Icons.Default.MicOff, contentDescription = null) },
                    label = { Text("Настройки") }
                )
                NavigationBarItem(
                    selected = activeTab == ScreenTab.HISTORY,
                    onClick = { activeTab = ScreenTab.HISTORY },
                    icon = { Icon(Icons.Default.Refresh, contentDescription = null) },
                    label = { Text("Журнал (${state.history.size})") }
                )
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp)
        ) {
            state.statusBanner?.let { banner ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp)
                ) {
                    Text(
                        text = banner,
                        color = Color(0xFFB91C1C),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            when (activeTab) {
                ScreenTab.QUEUE -> QueueTabContent(
                    state = state,
                    onStartBot = onStartBot,
                    onStopBot = onStopBot,
                    onHangupAndNext = onHangupAndNext,
                    onSkipCurrent = onSkipCurrent,
                    onToggleManualMic = onToggleManualMic,
                    onOpenBulkDialog = { showBulkDialog = true }
                )
                ScreenTab.SETTINGS -> SettingsTabContent(
                    state = state,
                    onRequestDefaultDialer = onRequestDefaultDialer
                )
                ScreenTab.HISTORY -> HistoryTabContent(state = state)
            }
        }
    }

    if (showBulkDialog) {
        BulkImportDialog(
            onDismiss = { showBulkDialog = false },
            onConfirm = { raw ->
                DialerRepository.importBulkNumbers(raw)
                showBulkDialog = false
            }
        )
    }
}

@Composable
private fun QueueTabContent(
    state: DialerUiState,
    onStartBot: () -> Unit,
    onStopBot: () -> Unit,
    onHangupAndNext: () -> Unit,
    onSkipCurrent: () -> Unit,
    onToggleManualMic: () -> Unit,
    onOpenBulkDialog: () -> Unit
) {
    var phoneInput by remember { mutableStateOf("") }
    var nameInput by remember { mutableStateOf("") }
    var durationInput by remember { mutableStateOf("") }
    var formError by remember { mutableStateOf<String?>(null) }

    val queuedCount = state.queue.count { it.status == QueueItemStatus.QUEUED }

    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        item {
            ActiveCallCard(
                state = state,
                hasQueued = queuedCount > 0,
                onStartBot = onStartBot,
                onStopBot = onStopBot,
                onHangupAndNext = onHangupAndNext,
                onSkipCurrent = onSkipCurrent,
                onToggleManualMic = onToggleManualMic
            )
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Добавить номер", style = MaterialTheme.typography.titleSmall)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            TextButton(onClick = onOpenBulkDialog) { Text("Списком") }
                            TextButton(onClick = { DialerRepository.loadDemoQueue() }) { Text("Демо") }
                        }
                    }

                    OutlinedTextField(
                        value = phoneInput,
                        onValueChange = { phoneInput = it; formError = null },
                        label = { Text("Телефон (+7...)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = nameInput,
                            onValueChange = { nameInput = it },
                            label = { Text("Имя / заметка") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = durationInput,
                            onValueChange = { durationInput = it.filter(Char::isDigit) },
                            label = { Text("Сек") },
                            placeholder = { Text("${state.settings.callDurationSec}") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.width(92.dp)
                        )
                    }

                    formError?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }

                    Button(
                        onClick = {
                            val customDur = durationInput.toIntOrNull()
                            val err = DialerRepository.addSingleNumber(phoneInput, nameInput, customDur)
                            if (err != null) {
                                formError = err
                            } else {
                                phoneInput = ""
                                nameInput = ""
                                durationInput = ""
                                formError = null
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Добавить в очередь")
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Очередь: $queuedCount из ${state.queue.size}",
                    style = MaterialTheme.typography.titleSmall
                )
                if (state.queue.isNotEmpty() && !state.isRunning) {
                    Row {
                        TextButton(onClick = { DialerRepository.resetAllQueue() }) {
                            Text("Сбросить")
                        }
                        TextButton(onClick = { DialerRepository.clearQueue() }) {
                            Text("Очистить", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }

        items(state.queue, key = { it.id }) { item ->
            QueueItemRow(
                item = item,
                defaultDurationSec = state.settings.callDurationSec,
                isActive = item.id == state.activeItemId,
                onRetry = { DialerRepository.resetItemToQueued(item.id) },
                onDelete = { DialerRepository.removeItem(item.id) }
            )
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun ActiveCallCard(
    state: DialerUiState,
    hasQueued: Boolean,
    onStartBot: () -> Unit,
    onStopBot: () -> Unit,
    onHangupAndNext: () -> Unit,
    onSkipCurrent: () -> Unit,
    onToggleManualMic: () -> Unit
) {
    val active = state.activeItem
    val nextQueued = state.queue.firstOrNull { it.status == QueueItemStatus.QUEUED }

    val phaseTitle = when (state.phase) {
        DialerPhase.IDLE -> "Готов к запуску"
        DialerPhase.DIALING -> "Набор номера…"
        DialerPhase.CONNECTED -> "Идёт звонок"
        DialerPhase.COOLDOWN -> "Пауза перед следующим"
        DialerPhase.FINISHED -> "Обзвон завершён"
    }

    val timerText = when (state.phase) {
        DialerPhase.CONNECTED -> PhoneParser.formatDuration(state.remainingSec)
        DialerPhase.COOLDOWN -> PhoneParser.formatDuration(state.cooldownRemainingSec)
        else -> PhoneParser.formatDuration(state.settings.callDurationSec)
    }

    val progress = when (state.phase) {
        DialerPhase.CONNECTED -> {
            val total = state.targetDurationSec.coerceAtLeast(1)
            ((total - state.remainingSec).toFloat() / total).coerceIn(0f, 1f)
        }
        DialerPhase.DIALING -> 0.15f
        else -> 0f
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = phaseTitle,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (state.phase == DialerPhase.CONNECTED) Color(0xFF15803D) else Color(0xFF1D4ED8)
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (state.micLocked) Icons.Default.MicOff else Icons.Default.Mic,
                        contentDescription = null,
                        tint = if (state.micLocked) Color(0xFF15803D) else Color(0xFFB45309)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = if (state.micLocked) "Микрофон заблокирован" else "Микрофон открыт",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (state.micLocked) Color(0xFF15803D) else Color(0xFFB45309)
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = active?.phone ?: nextQueued?.phone ?: "Нет номеров в очереди",
                        style = MaterialTheme.typography.headlineSmall,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    val subtitle = active?.name ?: nextQueued?.name ?: ""
                    if (subtitle.isNotEmpty()) {
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Text(
                    text = timerText,
                    style = MaterialTheme.typography.headlineMedium,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }

            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth()
            )

            if (!state.isRunning) {
                Button(
                    onClick = onStartBot,
                    enabled = hasQueued || (state.settings.loopQueue && state.queue.isNotEmpty()),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Запустить автодозвон")
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (state.phase != DialerPhase.COOLDOWN) {
                        OutlinedButton(
                            onClick = onHangupAndNext,
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.SkipNext, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Далее")
                        }
                        OutlinedButton(
                            onClick = onSkipCurrent,
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.CallEnd, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Пропуск")
                        }
                    }
                    Button(
                        onClick = onStopBot,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Stop, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text("Стоп")
                    }
                }

                if (state.phase != DialerPhase.COOLDOWN) {
                    OutlinedButton(
                        onClick = onToggleManualMic,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            imageVector = if (state.micLocked) Icons.Default.Mic else Icons.Default.MicOff,
                            contentDescription = null
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (state.micLocked) {
                                "Временно открыть микрофон"
                            } else {
                                "Заблокировать микрофон"
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun QueueItemRow(
    item: QueueItem,
    defaultDurationSec: Int,
    isActive: Boolean,
    onRetry: () -> Unit,
    onDelete: () -> Unit
) {
    val statusText = when (item.status) {
        QueueItemStatus.QUEUED -> "В очереди"
        QueueItemStatus.DIALING -> "Набор..."
        QueueItemStatus.CONNECTED -> "Разговор"
        QueueItemStatus.COMPLETED -> "Завершён"
        QueueItemStatus.SKIPPED -> "Пропущен"
        QueueItemStatus.FAILED -> "Ошибка"
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (isActive) Color(0xFFEFF6FF) else MaterialTheme.colorScheme.surface
        ),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.phone,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Medium
                )
                val desc = listOfNotNull(
                    item.name.takeIf { it.isNotBlank() },
                    "$statusText · ${item.customDurationSec ?: defaultDurationSec}с"
                ).joinToString(" · ")
                Text(
                    text = desc,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            if (item.status == QueueItemStatus.COMPLETED ||
                item.status == QueueItemStatus.SKIPPED ||
                item.status == QueueItemStatus.FAILED
            ) {
                IconButton(onClick = onRetry) {
                    Icon(Icons.Default.Refresh, contentDescription = "Повторить ${item.phone}")
                }
            }

            IconButton(onClick = onDelete, enabled = !isActive) {
                Icon(Icons.Default.Delete, contentDescription = "Удалить ${item.phone}")
            }
        }
    }
}

@Composable
private fun SettingsTabContent(
    state: DialerUiState,
    onRequestDefaultDialer: () -> Unit
) {
    val settings = state.settings
    val presets = listOf(10, 15, 30, 60, 120)

    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Длительность звонка: ${settings.callDurationSec} сек", fontWeight = FontWeight.SemiBold)
                    Slider(
                        value = settings.callDurationSec.coerceIn(3, 180).toFloat(),
                        onValueChange = { v ->
                            DialerRepository.updateSettings { it.copy(callDurationSec = v.toInt()) }
                        },
                        valueRange = 3f..180f
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        presets.forEach { preset ->
                            OutlinedButton(
                                onClick = {
                                    DialerRepository.updateSettings { it.copy(callDurationSec = preset) }
                                },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("${preset}с", maxLines = 1)
                            }
                        }
                    }

                    HorizontalDivider()

                    Text("Пауза между звонками: ${settings.cooldownSec} сек")
                    Slider(
                        value = settings.cooldownSec.coerceIn(0, 30).toFloat(),
                        onValueChange = { v ->
                            DialerRepository.updateSettings { it.copy(cooldownSec = v.toInt()) }
                        },
                        valueRange = 0f..30f
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Зациклить список")
                        Switch(
                            checked = settings.loopQueue,
                            onCheckedChange = { checked ->
                                DialerRepository.updateSettings { it.copy(loopQueue = checked) }
                            }
                        )
                    }
                }
            }
        }

        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Автоблокировка микрофона", fontWeight = FontWeight.SemiBold)
                            Text(
                                text = "Отключает системный микрофон через AudioManager при каждом вызове",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = settings.autoMuteMic,
                            onCheckedChange = { checked ->
                                DialerRepository.updateSettings { it.copy(autoMuteMic = checked) }
                            }
                        )
                    }

                    if (settings.autoMuteMic) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(
                                selected = settings.micLockMode == MicLockMode.ALWAYS_DURING_CALL,
                                onClick = {
                                    DialerRepository.updateSettings {
                                        it.copy(micLockMode = MicLockMode.ALWAYS_DURING_CALL)
                                    }
                                }
                            )
                            Text("С начала набора и на всё время звонка", style = MaterialTheme.typography.bodySmall)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(
                                selected = settings.micLockMode == MicLockMode.ON_CONNECT,
                                onClick = {
                                    DialerRepository.updateSettings {
                                        it.copy(micLockMode = MicLockMode.ON_CONNECT)
                                    }
                                }
                            )
                            Text("После соединения с абонентом", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }

        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Интеграция со звонилкой Android", fontWeight = FontWeight.SemiBold)
                    Text(
                        text = if (state.isDefaultDialer) {
                            "Приложение назначено системной звонилкой по умолчанию (доступен точный контроль ответа и сброса через InCallService)."
                        } else {
                            "Назначьте приложение звонилкой по умолчанию, чтобы точно фиксировать момент ответа абонента и гарантированно завершать звонок на любых прошивках."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (!state.isDefaultDialer) {
                        OutlinedButton(
                            onClick = onRequestDefaultDialer,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Назначить звонилкой по умолчанию")
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun HistoryTabContent(state: DialerUiState) {
    val formatter = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }

    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Журнал вызовов", style = MaterialTheme.typography.titleSmall)
                if (state.history.isNotEmpty()) {
                    TextButton(onClick = { DialerRepository.clearHistory() }) {
                        Text("Очистить", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }

        if (state.history.isEmpty()) {
            item {
                Text(
                    text = "Вызовов пока нет.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 24.dp)
                )
            }
        } else {
            items(state.history, key = { it.id }) { entry ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(entry.phone, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium)
                            Text(
                                text = formatter.format(Date(entry.timestampMillis)),
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        Text(
                            text = "${entry.outcome} · ${entry.actualDurationSec}с / ${entry.configuredDurationSec}с · Микрофон: ${if (entry.micLocked) "Заблокирован" else "Был открыт"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BulkImportDialog(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var text by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Массовый импорт номеров") },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("По одному номеру в строке") },
                placeholder = { Text("+7 999 123-45-67; Иван\n89165550122") },
                minLines = 5,
                maxLines = 8,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(text) },
                enabled = text.isNotBlank()
            ) {
                Text("Импортировать")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Отмена")
            }
        }
    )
}
