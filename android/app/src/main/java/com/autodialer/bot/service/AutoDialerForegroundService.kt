package com.autodialer.bot.service

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.autodialer.bot.audio.MicLockController
import com.autodialer.bot.logic.PhoneParser
import com.autodialer.bot.model.CallLogEntry
import com.autodialer.bot.model.DialerPhase
import com.autodialer.bot.model.QueueItem
import com.autodialer.bot.model.QueueItemStatus
import com.autodialer.bot.telecom.BotInCallService
import com.autodialer.bot.telecom.NativeCallState
import com.autodialer.bot.ui.MainActivity
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Фоновый сервис автообзвона:
 * - последовательно набирает номера через TelecomManager.placeCall;
 * - включает системный mute микрофона (AudioManager.isMicrophoneMute = true) при каждом вызове;
 * - отсчитывает заданную длительность и принудительно завершает звонок по таймеру.
 */
class AutoDialerForegroundService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var telecomManager: TelecomManager
    private lateinit var telephonyManager: TelephonyManager
    private lateinit var micLockController: MicLockController

    private var loopJob: Job? = null
    private var micGuardJob: Job? = null
    private var skipSignal: CompletableDeferred<CallEndReason>? = null
    private var callEndedByNetwork: CompletableDeferred<Unit>? = null

    private var telephonyCallback: Any? = null
    @Suppress("DEPRECATION")
    private var legacyPhoneListener: PhoneStateListener? = null
    @Volatile
    private var lastTelephonyState: Int = TelephonyManager.CALL_STATE_IDLE

    enum class CallEndReason {
        TIMER_EXPIRED,
        HANGUP_AND_NEXT,
        SKIPPED,
        DISCONNECTED_BY_REMOTE,
        STOPPED
    }

    override fun onCreate() {
        super.onCreate()
        telecomManager = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        micLockController = MicLockController(this)
        createNotificationChannel()
        registerTelephonyObserver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startDialingLoop()
            ACTION_STOP -> stopDialingLoop()
            ACTION_NEXT -> skipSignal?.complete(CallEndReason.HANGUP_AND_NEXT)
            ACTION_SKIP -> skipSignal?.complete(CallEndReason.SKIPPED)
            ACTION_TOGGLE_MIC -> toggleManualMicOverride()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        unregisterTelephonyObserver()
        micGuardJob?.cancel()
        loopJob?.cancel()
        micLockController.restoreInitialState()
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun startDialingLoop() {
        if (loopJob?.isActive == true) return
        startAsForeground("Подготовка к автообзвону…")

        loopJob = serviceScope.launch {
            startMicGuardLoop()
            try {
                while (isActive) {
                    val snapshot = DialerRepository.state.value
                    var nextItem = snapshot.queue.firstOrNull { it.status == QueueItemStatus.QUEUED }

                    if (nextItem == null && snapshot.settings.loopQueue && snapshot.queue.isNotEmpty()) {
                        DialerRepository.updateRuntimeState { st ->
                            st.copy(queue = st.queue.map { it.copy(status = QueueItemStatus.QUEUED) })
                        }
                        nextItem = DialerRepository.state.value.queue.firstOrNull()
                    }

                    if (nextItem == null) {
                        DialerRepository.updateRuntimeState {
                            it.copy(
                                phase = DialerPhase.FINISHED,
                                activeItemId = null,
                                micLocked = it.settings.autoMuteMic
                            )
                        }
                        break
                    }

                    val reason = executeSingleCall(nextItem)
                    if (reason == CallEndReason.STOPPED || !isActive) {
                        break
                    }

                    val cooldownSec = DialerRepository.state.value.settings.cooldownSec
                    val hasMoreQueued = DialerRepository.state.value.queue.any {
                        it.status == QueueItemStatus.QUEUED
                    }
                    if (cooldownSec > 0 && hasMoreQueued) {
                        DialerRepository.updateRuntimeState {
                            it.copy(
                                phase = DialerPhase.COOLDOWN,
                                activeItemId = null,
                                cooldownRemainingSec = cooldownSec
                            )
                        }
                        for (sec in cooldownSec downTo 1) {
                            if (!isActive) break
                            DialerRepository.updateRuntimeState { it.copy(cooldownRemainingSec = sec) }
                            updateNotification("Пауза перед следующим звонком: ${sec}с")
                            delay(1000L)
                        }
                    }
                }
            } finally {
                micGuardJob?.cancel()
                micLockController.restoreInitialState()
                DialerRepository.updateRuntimeState {
                    it.copy(
                        activeItemId = null,
                        manualMicOverride = false,
                        micLocked = it.settings.autoMuteMic,
                        phase = if (it.phase == DialerPhase.FINISHED) DialerPhase.FINISHED else DialerPhase.IDLE
                    )
                }
                ServiceCompat.stopForeground(this@AutoDialerForegroundService, ServiceCompat.STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
    }

    private suspend fun executeSingleCall(item: QueueItem): CallEndReason {
        val settings = DialerRepository.state.value.settings
        val targetDuration = PhoneParser.clampDuration(
            item.customDurationSec ?: settings.callDurationSec,
            3,
            3600
        )

        // На каждом новом звонке сбрасываем ручную разблокировку микрофона
        val lockAtDial = DialerRepository.shouldLockMicNow(
            DialerPhase.DIALING,
            settings,
            manualOverride = false
        )
        micLockController.setMicrophoneMuted(lockAtDial)

        DialerRepository.updateRuntimeState { st ->
            st.copy(
                phase = DialerPhase.DIALING,
                activeItemId = item.id,
                targetDurationSec = targetDuration,
                remainingSec = targetDuration,
                manualMicOverride = false,
                micLocked = lockAtDial,
                statusBanner = null,
                queue = st.queue.map {
                    if (it.id == item.id) it.copy(status = QueueItemStatus.DIALING) else it
                }
            )
        }
        updateNotification("Набор: ${item.phone} (мик. ${if (lockAtDial) "заблокирован" else "открыт"})")

        val placed = placeSystemCall(item.phone)
        if (!placed) {
            DialerRepository.updateRuntimeState { st ->
                st.copy(
                    queue = st.queue.map {
                        if (it.id == item.id) it.copy(status = QueueItemStatus.FAILED) else it
                    },
                    statusBanner = "Нет разрешения CALL_PHONE для совершения вызова"
                )
            }
            return CallEndReason.SKIPPED
        }

        val currentSkip = CompletableDeferred<CallEndReason>()
        val networkDisconnect = CompletableDeferred<Unit>()
        skipSignal = currentSkip
        callEndedByNetwork = networkDisconnect

        val connected = awaitCallConnected(settings.ringTimeoutSec, currentSkip, networkDisconnect)
        if (!connected) {
            val reason = if (currentSkip.isCompleted) {
                currentSkip.await()
            } else {
                CallEndReason.DISCONNECTED_BY_REMOTE
            }
            terminateSystemCall()
            finalizeCallRecord(item, targetDuration, actualSec = 0, reason = reason)
            return reason
        }

        // Переходим в фазу активного звонка и принудительно блокируем микрофон
        val overrideNow = DialerRepository.state.value.manualMicOverride
        val lockOnConnect = DialerRepository.shouldLockMicNow(
            DialerPhase.CONNECTED,
            DialerRepository.state.value.settings,
            overrideNow
        )
        micLockController.setMicrophoneMuted(lockOnConnect)

        DialerRepository.updateRuntimeState { st ->
            st.copy(
                phase = DialerPhase.CONNECTED,
                micLocked = lockOnConnect,
                queue = st.queue.map {
                    if (it.id == item.id) it.copy(status = QueueItemStatus.CONNECTED) else it
                }
            )
        }

        var elapsedSec = 0
        var endReason = CallEndReason.TIMER_EXPIRED

        for (sec in targetDuration downTo 1) {
            if (currentSkip.isCompleted) {
                endReason = currentSkip.await()
                break
            }
            if (BotInCallService.isBound() &&
                BotInCallService.callState.value == NativeCallState.DISCONNECTED
            ) {
                networkDisconnect.complete(Unit)
            }
            if (networkDisconnect.isCompleted) {
                endReason = CallEndReason.DISCONNECTED_BY_REMOTE
                break
            }

            DialerRepository.updateRuntimeState { it.copy(remainingSec = sec) }
            val micText = if (DialerRepository.state.value.micLocked) "мик. заблокирован" else "мик. открыт"
            updateNotification("${item.phone} · осталось ${PhoneParser.formatDuration(sec)} ($micText)")

            // Спим по 250 мс для мгновенного отклика на кнопки «Завершить»/«Остановить»
            repeat(4) {
                if (currentSkip.isCompleted) {
                    endReason = currentSkip.await()
                    return@repeat
                }
                if (BotInCallService.isBound() &&
                    BotInCallService.callState.value == NativeCallState.DISCONNECTED
                ) {
                    networkDisconnect.complete(Unit)
                }
                if (networkDisconnect.isCompleted) {
                    endReason = CallEndReason.DISCONNECTED_BY_REMOTE
                    return@repeat
                }
                delay(250L)
            }
            if (currentSkip.isCompleted || networkDisconnect.isCompleted) break
            elapsedSec += 1
        }

        terminateSystemCall()
        finalizeCallRecord(item, targetDuration, elapsedSec, endReason)
        return endReason
    }

    private suspend fun awaitCallConnected(
        ringTimeoutSec: Int,
        skipDeferred: CompletableDeferred<CallEndReason>,
        disconnectDeferred: CompletableDeferred<Unit>
    ): Boolean {
        val maxWaitMs = ringTimeoutSec.coerceAtLeast(3) * 1000L
        val startMs = System.currentTimeMillis()

        while (System.currentTimeMillis() - startMs < maxWaitMs) {
            if (skipDeferred.isCompleted || disconnectDeferred.isCompleted) {
                return false
            }
            if (BotInCallService.isBound()) {
                when (BotInCallService.callState.value) {
                    NativeCallState.ACTIVE -> return true
                    NativeCallState.DISCONNECTED -> {
                        disconnectDeferred.complete(Unit)
                        return false
                    }
                    else -> Unit
                }
            } else {
                // Без роли звонилки по умолчанию TelephonyManager переходит в OFFHOOK сразу при старте вызова;
                // даём 3 секунды на установление вызова, затем запускаем отсчёт длительности
                if (lastTelephonyState == TelephonyManager.CALL_STATE_OFFHOOK &&
                    System.currentTimeMillis() - startMs >= 3000L
                ) {
                    return true
                }
            }
            delay(200L)
        }
        return true
    }

    private fun finalizeCallRecord(
        item: QueueItem,
        configuredDurationSec: Int,
        actualSec: Int,
        reason: CallEndReason
    ) {
        val wasLocked = DialerRepository.state.value.settings.autoMuteMic &&
            !DialerRepository.state.value.manualMicOverride

        val newStatus = when (reason) {
            CallEndReason.SKIPPED -> QueueItemStatus.SKIPPED
            CallEndReason.STOPPED -> QueueItemStatus.QUEUED
            else -> QueueItemStatus.COMPLETED
        }

        val outcomeText = when (reason) {
            CallEndReason.TIMER_EXPIRED -> "Завершён по таймеру"
            CallEndReason.HANGUP_AND_NEXT -> "Завершён вручную"
            CallEndReason.SKIPPED -> "Пропущен"
            CallEndReason.DISCONNECTED_BY_REMOTE -> "Сброшен абонентом"
            CallEndReason.STOPPED -> "Остановлен ботом"
        }

        DialerRepository.updateRuntimeState { st ->
            st.copy(
                queue = st.queue.map {
                    if (it.id == item.id) {
                        it.copy(
                            status = newStatus,
                            lastCallDurationSec = actualSec,
                            micWasLocked = wasLocked
                        )
                    } else it
                }
            )
        }

        DialerRepository.appendCallLog(
            CallLogEntry(
                phone = item.phone,
                name = item.name,
                timestampMillis = System.currentTimeMillis(),
                configuredDurationSec = configuredDurationSec,
                actualDurationSec = actualSec,
                micLocked = wasLocked,
                outcome = outcomeText
            )
        )
    }

    private fun startMicGuardLoop() {
        micGuardJob?.cancel()
        micGuardJob = serviceScope.launch {
            while (isActive) {
                val st = DialerRepository.state.value
                val mustMute = DialerRepository.shouldLockMicNow(
                    st.phase,
                    st.settings,
                    st.manualMicOverride
                )
                micLockController.enforceLockIfNeeded(mustMute)
                delay(400L)
            }
        }
    }

    private fun toggleManualMicOverride() {
        DialerRepository.updateRuntimeState { st ->
            val nextOverride = !st.manualMicOverride
            val shouldMute = DialerRepository.shouldLockMicNow(st.phase, st.settings, nextOverride)
            micLockController.setMicrophoneMuted(shouldMute)
            st.copy(manualMicOverride = nextOverride, micLocked = shouldMute)
        }
    }

    private fun stopDialingLoop() {
        skipSignal?.complete(CallEndReason.STOPPED)
        terminateSystemCall()
        loopJob?.cancel()
        micGuardJob?.cancel()
        micLockController.restoreInitialState()
        DialerRepository.updateRuntimeState {
            it.copy(
                phase = DialerPhase.IDLE,
                activeItemId = null,
                manualMicOverride = false,
                micLocked = it.settings.autoMuteMic
            )
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    @SuppressLint("MissingPermission")
    private fun placeSystemCall(phoneNumber: String): Boolean {
        if (!hasPermission(Manifest.permission.CALL_PHONE)) {
            return false
        }
        BotInCallService.resetState()
        return try {
            val uri = Uri.fromParts("tel", phoneNumber, null)
            val extras = Bundle().apply {
                putBoolean(TelecomManager.EXTRA_START_CALL_WITH_SPEAKERPHONE, false)
            }
            telecomManager.placeCall(uri, extras)
            true
        } catch (_: SecurityException) {
            false
        }
    }

    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    private fun terminateSystemCall() {
        if (BotInCallService.disconnectActiveCall()) {
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
            hasPermission(Manifest.permission.ANSWER_PHONE_CALLS)
        ) {
            try {
                telecomManager.endCall()
            } catch (_: SecurityException) {
                // Требуется ANSWER_PHONE_CALLS или роль звонилки по умолчанию
            }
        }
    }

    private fun registerTelephonyObserver() {
        if (!hasPermission(Manifest.permission.READ_PHONE_STATE)) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    handleTelephonyStateChange(state)
                }
            }
            telephonyCallback = callback
            try {
                telephonyManager.registerTelephonyCallback(mainExecutor, callback)
            } catch (_: SecurityException) {
                // Игнорируем если разрешение отозвано
            }
        } else {
            @Suppress("DEPRECATION")
            val listener = object : PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    handleTelephonyStateChange(state)
                }
            }
            legacyPhoneListener = listener
            try {
                @Suppress("DEPRECATION")
                telephonyManager.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
            } catch (_: SecurityException) {
                // Игнорируем если разрешение отозвано
            }
        }
    }

    private fun unregisterTelephonyObserver() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val cb = telephonyCallback as? TelephonyCallback ?: return
            telephonyManager.unregisterTelephonyCallback(cb)
            telephonyCallback = null
        } else {
            @Suppress("DEPRECATION")
            val listener = legacyPhoneListener ?: return
            @Suppress("DEPRECATION")
            telephonyManager.listen(listener, PhoneStateListener.LISTEN_NONE)
            legacyPhoneListener = null
        }
    }

    private fun handleTelephonyStateChange(state: Int) {
        val prev = lastTelephonyState
        lastTelephonyState = state
        if (prev != TelephonyManager.CALL_STATE_IDLE &&
            state == TelephonyManager.CALL_STATE_IDLE &&
            !BotInCallService.isBound()
        ) {
            callEndedByNetwork?.complete(Unit)
        }
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "АвтоДозвон Бот",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Уведомление активного сервиса автообзвона и блокировки микрофона"
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(text: String): Notification {
        val openIntent = Intent(this, MainActivity::class.java)
        val openPending = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, AutoDialerForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPending = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("АвтоДозвон Бот активен")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.sym_call_outgoing)
            .setOngoing(true)
            .setContentIntent(openPending)
            .addAction(android.R.drawable.ic_media_pause, "Остановить", stopPending)
            .build()
    }

    private fun startAsForeground(text: String) {
        val notification = buildNotification(text)
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    companion object {
        private const val CHANNEL_ID = "autodialer_bot_channel"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.autodialer.bot.action.START"
        const val ACTION_STOP = "com.autodialer.bot.action.STOP"
        const val ACTION_NEXT = "com.autodialer.bot.action.NEXT"
        const val ACTION_SKIP = "com.autodialer.bot.action.SKIP"
        const val ACTION_TOGGLE_MIC = "com.autodialer.bot.action.TOGGLE_MIC"

        fun sendAction(context: Context, action: String) {
            val intent = Intent(context, AutoDialerForegroundService::class.java).apply {
                this.action = action
            }
            if (action == ACTION_START) {
                ContextCompat.startForegroundService(context, intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
