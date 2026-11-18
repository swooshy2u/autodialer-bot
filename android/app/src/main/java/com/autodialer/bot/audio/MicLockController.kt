package com.autodialer.bot.audio

import android.content.Context
import android.media.AudioManager

/**
 * Управляет системной блокировкой микрофона через AudioManager.
 * При активном звонке принудительно выставляет audioManager.isMicrophoneMute = true
 * и повторно проверяет состояние, чтобы Bluetooth/система не сбросили mute.
 */
class MicLockController(context: Context) {

    private val audioManager =
        context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var savedInitialMuteState: Boolean? = null

    fun setMicrophoneMuted(muted: Boolean) {
        if (muted && savedInitialMuteState == null) {
            savedInitialMuteState = audioManager.isMicrophoneMute
        }
        try {
            audioManager.isMicrophoneMute = muted
        } catch (_: SecurityException) {
            // Требуется разрешение MODIFY_AUDIO_SETTINGS
        }
    }

    fun enforceLockIfNeeded(shouldBeMuted: Boolean) {
        if (shouldBeMuted && !audioManager.isMicrophoneMute) {
            setMicrophoneMuted(true)
        }
    }

    fun isMicrophoneMuted(): Boolean = audioManager.isMicrophoneMute

    fun restoreInitialState() {
        val initial = savedInitialMuteState ?: false
        savedInitialMuteState = null
        try {
            audioManager.isMicrophoneMute = initial
        } catch (_: SecurityException) {
            // Игнорируем если разрешение отозвано
        }
    }
}
