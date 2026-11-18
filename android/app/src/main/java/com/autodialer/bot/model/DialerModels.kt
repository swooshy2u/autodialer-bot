package com.autodialer.bot.model

import java.util.UUID

enum class QueueItemStatus {
    QUEUED,
    DIALING,
    CONNECTED,
    COMPLETED,
    SKIPPED,
    FAILED
}

enum class DialerPhase {
    IDLE,
    DIALING,
    CONNECTED,
    COOLDOWN,
    FINISHED
}

enum class MicLockMode {
    ALWAYS_DURING_CALL,
    ON_CONNECT
}

data class QueueItem(
    val id: String = UUID.randomUUID().toString(),
    val phone: String,
    val name: String = "",
    val status: QueueItemStatus = QueueItemStatus.QUEUED,
    val customDurationSec: Int? = null,
    val lastCallDurationSec: Int? = null,
    val micWasLocked: Boolean = false
)

data class DialerSettings(
    val callDurationSec: Int = 15,
    val cooldownSec: Int = 2,
    val ringTimeoutSec: Int = 25,
    val autoMuteMic: Boolean = true,
    val micLockMode: MicLockMode = MicLockMode.ALWAYS_DURING_CALL,
    val loopQueue: Boolean = false
)

data class CallLogEntry(
    val id: String = UUID.randomUUID().toString(),
    val phone: String,
    val name: String,
    val timestampMillis: Long,
    val configuredDurationSec: Int,
    val actualDurationSec: Int,
    val micLocked: Boolean,
    val outcome: String
)

data class DialerUiState(
    val queue: List<QueueItem> = defaultDemoQueue(),
    val settings: DialerSettings = DialerSettings(),
    val phase: DialerPhase = DialerPhase.IDLE,
    val activeItemId: String? = null,
    val remainingSec: Int = 15,
    val targetDurationSec: Int = 15,
    val cooldownRemainingSec: Int = 0,
    val micLocked: Boolean = true,
    val manualMicOverride: Boolean = false,
    val isDefaultDialer: Boolean = false,
    val history: List<CallLogEntry> = emptyList(),
    val statusBanner: String? = null
) {
    val activeItem: QueueItem?
        get() = queue.firstOrNull { it.id == activeItemId }

    val isRunning: Boolean
        get() = phase == DialerPhase.DIALING || phase == DialerPhase.CONNECTED || phase == DialerPhase.COOLDOWN
}

fun defaultDemoQueue(): List<QueueItem> = listOf(
    QueueItem(phone = "+79991102481", name = "Алексей Морозов (Отдел продаж)"),
    QueueItem(phone = "+79164829015", name = "Елена Соколова (Логистика)"),
    QueueItem(phone = "+79037551840", name = "Сергей Волков (Поддержка)", customDurationSec = 20),
    QueueItem(phone = "+79263094412", name = "Марина Кузнецова (Партнёр)")
)
