package com.autodialer.bot.logic

import com.autodialer.bot.model.QueueItem

object PhoneParser {

    fun normalizePhoneNumber(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return ""
        val hasPlus = trimmed.startsWith("+")
        val digits = trimmed.filter { it.isDigit() }
        if (digits.isEmpty()) return ""

        return when {
            !hasPlus && digits.length == 11 && digits.startsWith("8") -> "+7${digits.drop(1)}"
            !hasPlus && digits.length == 11 && digits.startsWith("7") -> "+$digits"
            !hasPlus && digits.length == 10 && digits.startsWith("9") -> "+7$digits"
            hasPlus -> "+$digits"
            else -> "+$digits"
        }
    }

    fun isValidPhoneNumber(phone: String): Boolean {
        val normalized = normalizePhoneNumber(phone)
        val digits = normalized.filter { it.isDigit() }
        return digits.length in 7..15
    }

    fun parseBulkPhoneList(
        rawText: String,
        existingPhones: Set<String>
    ): List<QueueItem> {
        val seen = existingPhones.map { normalizePhoneNumber(it) }.toMutableSet()
        val result = mutableListOf<QueueItem>()

        rawText.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .forEach { line ->
                val parts = line.split(Regex("[;\t,]|(?:\\s+-\\s+)"))
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }

                val first = parts.getOrNull(0).orEmpty()
                val second = parts.drop(1).joinToString(" ").trim()

                val (rawPhone, name) = if (!isValidPhoneNumber(first) && isValidPhoneNumber(second)) {
                    second to first
                } else {
                    first to second
                }

                val normalized = normalizePhoneNumber(rawPhone)
                if (isValidPhoneNumber(normalized) && seen.add(normalized)) {
                    result += QueueItem(phone = normalized, name = name)
                }
            }

        return result
    }

    fun formatDuration(seconds: Int): String {
        val safe = seconds.coerceAtLeast(0)
        val mins = safe / 60
        val secs = safe % 60
        return "%02d:%02d".format(mins, secs)
    }

    fun clampDuration(value: Int, min: Int = 3, max: Int = 3600): Int =
        value.coerceIn(min, max)
}
