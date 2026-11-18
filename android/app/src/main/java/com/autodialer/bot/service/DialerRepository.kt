package com.autodialer.bot.service

import com.autodialer.bot.logic.PhoneParser
import com.autodialer.bot.model.CallLogEntry
import com.autodialer.bot.model.DialerPhase
import com.autodialer.bot.model.DialerSettings
import com.autodialer.bot.model.DialerUiState
import com.autodialer.bot.model.MicLockMode
import com.autodialer.bot.model.QueueItem
import com.autodialer.bot.model.QueueItemStatus
import com.autodialer.bot.model.defaultDemoQueue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

object DialerRepository {
    private val _state = MutableStateFlow(DialerUiState())
    val state: StateFlow<DialerUiState> = _state.asStateFlow()

    fun updateSettings(transform: (DialerSettings) -> DialerSettings) {
        _state.update { current ->
            val updated = transform(current.settings)
            val clamped = updated.copy(
                callDurationSec = PhoneParser.clampDuration(updated.callDurationSec, 3, 3600),
                cooldownSec = PhoneParser.clampDuration(updated.cooldownSec, 0, 120),
                ringTimeoutSec = PhoneParser.clampDuration(updated.ringTimeoutSec, 5, 90)
            )
            val nextMicLocked = if (current.isRunning) current.micLocked else clamped.autoMuteMic
            current.copy(settings = clamped, micLocked = nextMicLocked)
        }
    }

    fun addSingleNumber(rawPhone: String, name: String, customDurationSec: Int?): String? {
        val normalized = PhoneParser.normalizePhoneNumber(rawPhone)
        if (!PhoneParser.isValidPhoneNumber(normalized)) {
            return "Неверный формат номера (нужно 7–15 цифр)"
        }
        val currentQueue = _state.value.queue
        if (currentQueue.any { it.phone == normalized }) {
            return "Номер уже есть в списке"
        }
        val item = QueueItem(
            phone = normalized,
            name = name.trim(),
            customDurationSec = customDurationSec?.let { PhoneParser.clampDuration(it, 3, 3600) }
        )
        _state.update {
            it.copy(
                queue = it.queue + item,
                phase = if (it.phase == DialerPhase.FINISHED) DialerPhase.IDLE else it.phase
            )
        }
        return null
    }

    fun importBulkNumbers(rawText: String): Int {
        val existing = _state.value.queue.map { it.phone }.toSet()
        val parsed = PhoneParser.parseBulkPhoneList(rawText, existing)
        if (parsed.isNotEmpty()) {
            _state.update {
                it.copy(
                    queue = it.queue + parsed,
                    phase = if (it.phase == DialerPhase.FINISHED) DialerPhase.IDLE else it.phase
                )
            }
        }
        return parsed.size
    }

    fun removeItem(id: String) {
        _state.update { current ->
            if (current.activeItemId == id) return@update current
            current.copy(queue = current.queue.filterNot { it.id == id })
        }
    }

    fun resetItemToQueued(id: String) {
        _state.update { current ->
            current.copy(
                queue = current.queue.map {
                    if (it.id == id) it.copy(status = QueueItemStatus.QUEUED) else it
                },
                phase = if (current.phase == DialerPhase.FINISHED) DialerPhase.IDLE else current.phase
            )
        }
    }

    fun resetAllQueue() {
        _state.update { current ->
            if (current.isRunning) return@update current
            current.copy(
                queue = current.queue.map { it.copy(status = QueueItemStatus.QUEUED) },
                phase = DialerPhase.IDLE,
                statusBanner = null
            )
        }
    }

    fun loadDemoQueue() {
        _state.update { current ->
            if (current.isRunning) return@update current
            current.copy(
                queue = defaultDemoQueue(),
                phase = DialerPhase.IDLE,
                statusBanner = null
            )
        }
    }

    fun clearQueue() {
        _state.update { current ->
            if (current.isRunning) return@update current
            current.copy(queue = emptyList(), phase = DialerPhase.IDLE)
        }
    }

    fun clearHistory() {
        _state.update { it.copy(history = emptyList()) }
    }

    fun setDefaultDialerStatus(isDefault: Boolean) {
        _state.update { it.copy(isDefaultDialer = isDefault) }
    }

    fun setBanner(message: String?) {
        _state.update { it.copy(statusBanner = message) }
    }

    internal fun updateRuntimeState(transform: (DialerUiState) -> DialerUiState) {
        _state.update(transform)
    }

    internal fun appendCallLog(entry: CallLogEntry) {
        _state.update { current ->
            current.copy(history = listOf(entry) + current.history)
        }
    }

    fun shouldLockMicNow(
        phase: DialerPhase,
        settings: DialerSettings,
        manualOverride: Boolean
    ): Boolean {
        if (!settings.autoMuteMic || manualOverride) return false
        return when (phase) {
            DialerPhase.DIALING -> settings.micLockMode == MicLockMode.ALWAYS_DURING_CALL
            DialerPhase.CONNECTED -> true
            else -> false
        }
    }
}
