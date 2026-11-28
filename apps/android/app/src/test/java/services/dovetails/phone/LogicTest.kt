package services.dovetails.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import services.dovetails.phone.Logic.SmsRow

class LogicTest {
    private val now = 1_800_000_000_000L

    @Test
    fun callTypesMapToWhatTheServerExpects() {
        assertEquals(Logic.CallKind("inbound", "answered"), Logic.callKind(1))
        assertEquals(Logic.CallKind("outbound", "answered"), Logic.callKind(2))
        assertEquals(Logic.CallKind("inbound", "missed"), Logic.callKind(3))
        assertEquals(Logic.CallKind("inbound", "voicemail"), Logic.callKind(4))
        assertEquals(Logic.CallKind("inbound", "rejected"), Logic.callKind(5))
        assertEquals(Logic.CallKind("inbound", "blocked"), Logic.callKind(6))
        assertNull(Logic.callKind(99))
    }

    @Test
    fun onlyReceivedAndSentTextsAreUploaded() {
        assertEquals("in", Logic.smsDirection(1))
        assertEquals("out", Logic.smsDirection(2))
        assertNull(Logic.smsDirection(3)) // draft
        assertNull(Logic.smsDirection(5)) // failed
    }

    @Test
    fun checkpointAdvancesPastFinishedTexts() {
        val rows = listOf(SmsRow(11, 1, now), SmsRow(12, 2, now), SmsRow(13, 3, now))
        assertEquals(13, Logic.nextSmsCheckpoint(rows, 10, now))
    }

    @Test
    fun checkpointStopsInFrontOfATextStillSending() {
        val rows = listOf(SmsRow(11, 1, now), SmsRow(12, 4, now - 1000), SmsRow(13, 1, now))
        assertEquals(11, Logic.nextSmsCheckpoint(rows, 10, now))
    }

    @Test
    fun checkpointGivesUpOnATextStuckSending() {
        val stuck = now - Logic.IN_FLIGHT_GRACE_MS - 1
        val rows = listOf(SmsRow(12, 6, stuck), SmsRow(13, 1, now))
        assertEquals(13, Logic.nextSmsCheckpoint(rows, 10, now))
    }

    @Test
    fun checkpointNeverMovesBackwards() {
        assertEquals(50, Logic.nextSmsCheckpoint(emptyList(), 50, now))
        assertEquals(50, Logic.nextSmsCheckpoint(listOf(SmsRow(40, 1, now)), 50, now))
    }

    @Test
    fun eventIdsAreStable() {
        assertEquals("dev:call:5:123", Logic.eventId("dev", "call", 5, 123))
    }

    @Test
    fun shortCodesAndEmailsAreNotPhoneNumbers() {
        assertTrue(Logic.isPhoneNumber("+1 (603) 555-0142"))
        assertFalse(Logic.isPhoneNumber("72975"))
        assertFalse(Logic.isPhoneNumber("someone1234567@example.com"))
        assertFalse(Logic.isPhoneNumber(null))
    }

    @Test
    fun backoffGrowsAndCaps() {
        assertEquals(30_000L, Logic.backoffMs(0))
        assertEquals(60_000L, Logic.backoffMs(1))
        assertEquals(30 * 60 * 1000L, Logic.backoffMs(20))
    }

    @Test
    fun serverUrlRequiresHttpsOutsideTheHouse() {
        assertEquals("https://app.example.com", Logic.normalizeServerUrl(" app.example.com/ "))
        assertEquals("https://app.example.com", Logic.normalizeServerUrl("https://app.example.com"))
        assertEquals("http://garonhome.local:3000", Logic.normalizeServerUrl("http://garonhome.local:3000"))
        assertEquals("http://192.168.1.20:3000", Logic.normalizeServerUrl("http://192.168.1.20:3000"))
        assertNull(Logic.normalizeServerUrl("http://app.example.com"))
        assertNull(Logic.normalizeServerUrl("ftp://x"))
        assertNull(Logic.normalizeServerUrl(""))
    }

    @Test
    fun aMultipartTextIsSentOnlyWhenEveryPartWent() {
        var s = Logic.SendState(partsTotal = 2)
        assertNull(s.outcome)
        s = s.withPart(true)
        assertNull(s.outcome)
        s = s.withPart(true)
        assertEquals("sent", s.outcome)
        assertEquals("failed", Logic.SendState(2).withPart(true).withPart(false).outcome)
    }
}
