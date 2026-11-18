package com.autodialer.bot.telecom

import android.os.Build
import android.telecom.Call
import android.telecom.InCallService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class NativeCallState {
    NONE,
    DIALING,
    RINGING,
    ACTIVE,
    DISCONNECTED
}

/**
 * InCallService позволяет приложению получать точный статус ответа собеседника (STATE_ACTIVE)
 * и гарантированно завершать исходящий вызов (call.disconnect()) на всех версиях Android,
 * если пользователь выбрал это приложение звонилкой по умолчанию (ROLE_DIALER).
 */
class BotInCallService : InCallService() {

    private var activeCall: Call? = null

    private val callCallback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            _callState.value = mapState(state)
            if (state == Call.STATE_DISCONNECTED) {
                call.unregisterCallback(this)
                if (activeCall === call) {
                    activeCall = null
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        if (instance === this) {
            instance = null
        }
        activeCall?.unregisterCallback(callCallback)
        activeCall = null
        _callState.value = NativeCallState.NONE
        super.onDestroy()
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        activeCall?.unregisterCallback(callCallback)
        activeCall = call
        call.registerCallback(callCallback)
        @Suppress("DEPRECATION")
        val initialState = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            call.details.state
        } else {
            call.state
        }
        _callState.value = mapState(initialState)
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        call.unregisterCallback(callCallback)
        if (activeCall === call) {
            activeCall = null
            _callState.value = NativeCallState.DISCONNECTED
        }
    }

    fun disconnectCurrentCall(): Boolean {
        val call = activeCall ?: return false
        call.disconnect()
        return true
    }

    private fun mapState(state: Int): NativeCallState = when (state) {
        Call.STATE_NEW,
        Call.STATE_CONNECTING,
        Call.STATE_DIALING -> NativeCallState.DIALING
        Call.STATE_RINGING -> NativeCallState.RINGING
        Call.STATE_ACTIVE -> NativeCallState.ACTIVE
        Call.STATE_DISCONNECTED,
        Call.STATE_DISCONNECTING -> NativeCallState.DISCONNECTED
        else -> NativeCallState.NONE
    }

    companion object {
        @Volatile
        private var instance: BotInCallService? = null

        private val _callState = MutableStateFlow(NativeCallState.NONE)
        val callState: StateFlow<NativeCallState> = _callState.asStateFlow()

        fun isBound(): Boolean = instance != null

        fun disconnectActiveCall(): Boolean = instance?.disconnectCurrentCall() ?: false

        fun resetState() {
            _callState.value = NativeCallState.NONE
        }
    }
}
