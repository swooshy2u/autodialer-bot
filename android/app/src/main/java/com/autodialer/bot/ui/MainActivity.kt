package com.autodialer.bot.ui

import android.Manifest
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.telecom.TelecomManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.content.ContextCompat
import com.autodialer.bot.service.AutoDialerForegroundService
import com.autodialer.bot.service.DialerRepository

class MainActivity : ComponentActivity() {

    private var pendingStartAfterPermissions = false

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val callGranted = results[Manifest.permission.CALL_PHONE] == true ||
            hasPermission(Manifest.permission.CALL_PHONE)
        val audioGranted = results[Manifest.permission.RECORD_AUDIO] == true ||
            hasPermission(Manifest.permission.RECORD_AUDIO)

        if (callGranted && audioGranted && pendingStartAfterPermissions) {
            pendingStartAfterPermissions = false
            DialerRepository.setBanner(null)
            AutoDialerForegroundService.sendAction(this, AutoDialerForegroundService.ACTION_START)
        } else if (!callGranted || !audioGranted) {
            pendingStartAfterPermissions = false
            DialerRepository.setBanner(
                "Для автодозвона и блокировки микрофона выдайте разрешения на телефон и аудио."
            )
        }
    }

    private val defaultDialerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        refreshDefaultDialerFlag()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        refreshDefaultDialerFlag()

        setContent {
            MaterialTheme {
                val state by DialerRepository.state.collectAsState()
                DialerScreen(
                    state = state,
                    onStartBot = { startBotWithPermissions() },
                    onStopBot = {
                        AutoDialerForegroundService.sendAction(
                            this,
                            AutoDialerForegroundService.ACTION_STOP
                        )
                    },
                    onHangupAndNext = {
                        AutoDialerForegroundService.sendAction(
                            this,
                            AutoDialerForegroundService.ACTION_NEXT
                        )
                    },
                    onSkipCurrent = {
                        AutoDialerForegroundService.sendAction(
                            this,
                            AutoDialerForegroundService.ACTION_SKIP
                        )
                    },
                    onToggleManualMic = {
                        AutoDialerForegroundService.sendAction(
                            this,
                            AutoDialerForegroundService.ACTION_TOGGLE_MIC
                        )
                    },
                    onRequestDefaultDialer = { requestDefaultDialerRole() }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshDefaultDialerFlag()
    }

    private fun startBotWithPermissions() {
        val missing = requiredRuntimePermissions().filterNot(::hasPermission)
        if (missing.isEmpty()) {
            DialerRepository.setBanner(null)
            AutoDialerForegroundService.sendAction(this, AutoDialerForegroundService.ACTION_START)
        } else {
            pendingStartAfterPermissions = true
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    private fun requiredRuntimePermissions(): List<String> = buildList {
        add(Manifest.permission.CALL_PHONE)
        add(Manifest.permission.READ_PHONE_STATE)
        add(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            add(Manifest.permission.ANSWER_PHONE_CALLS)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun refreshDefaultDialerFlag() {
        val isDefault = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            roleManager.isRoleHeld(RoleManager.ROLE_DIALER)
        } else {
            val telecom = getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecom.defaultDialerPackage == packageName
        }
        DialerRepository.setDefaultDialerStatus(isDefault)
    }

    @Suppress("DEPRECATION")
    private fun requestDefaultDialerRole() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            if (roleManager.isRoleAvailable(RoleManager.ROLE_DIALER) &&
                !roleManager.isRoleHeld(RoleManager.ROLE_DIALER)
            ) {
                defaultDialerLauncher.launch(roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER))
            }
        } else {
            val intent = Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER).apply {
                putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, packageName)
            }
            defaultDialerLauncher.launch(intent)
        }
    }
}
