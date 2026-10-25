package com.onelauncher

import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.net.HttpURLConnection
import java.net.Socket
import java.net.URL

class CompanionServerTest {
  private lateinit var server: CompanionServer
  private lateinit var info: JSONObject
  private var saved = JSONObject().put("homeName", "Welcome home")
  private var stopped = false

  @Before fun start() {
    server = CompanionServer("<h1>oneLauncher</h1>".toByteArray(), listOf("127.0.0.1"),
      { saved }, { input -> saved = input; saved }, { bytes -> JSONObject().put("receivedBytes", bytes.size) },
      { JSONObject().put("reset", true) }, { stopped = true }, port = 0,
      assets = mapOf("/companion.css" to "body { color: white; }".toByteArray(),
        "/companion.js" to "window.companionReady = true;".toByteArray()))
    info = server.start()
  }
  @After fun close() { server.stop() }

  private fun request(path: String, method: String = "GET", body: String? = null, token: String? = null, origin: String? = null): Pair<Int, String> {
    val connection = URL(info.getString("url") + path).openConnection() as HttpURLConnection
    connection.connectTimeout = 2000; connection.readTimeout = 2000
    connection.requestMethod = method
    token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
    origin?.let { connection.setRequestProperty("Origin", it) }
    if (body != null) {
      connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { it.write(body.toByteArray()) }
    }
    try {
      val status = connection.responseCode
      val text = (if (status >= 400) connection.errorStream else connection.inputStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
      return status to text
    } finally { connection.disconnect() }
  }
  private fun pair(): String {
    val response = request("/api/pair", "POST", JSONObject().put("code", info.getString("code")).toString())
    assertEquals(200, response.first)
    return JSONObject(response.second).getString("token")
  }

  @Test fun `phone assets load before pairing without exposing other paths`() {
    assertEquals(200 to "body { color: white; }", request("/companion.css"))
    assertEquals(200 to "window.companionReady = true;", request("/companion.js"))
    assertEquals(401, request("/private.js").first)
    val address = URL(info.getString("url"))
    Socket("127.0.0.1", address.port).use { socket ->
      socket.soTimeout = 2000
      socket.getOutputStream().write("GET /companion.js HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\nOrigin: https://attacker.example\r\n\r\n".toByteArray())
      assertTrue(socket.getInputStream().bufferedReader().readLine().contains("403"))
    }
  }
  @Test fun `personal settings require pairing and a valid token`() {
    assertEquals(401, request("/api/settings").first)
    assertEquals(401, request("/api/settings", token = "wrong").first)
    val token = pair()
    assertEquals(200, request("/api/settings", token = token).first)
    val response = request("/api/settings", "POST", "{\"homeName\":\"Family room\"}", token)
    assertEquals(200, response.first)
    assertEquals("Family room", saved.getString("homeName"))
  }
  @Test fun `cross origin changes and DNS rebinding are rejected`() {
    val token = pair()
    val address = URL(info.getString("url"))
    // HttpURLConnection silently removes Origin; use the actual browser wire format.
    Socket("127.0.0.1", address.port).use { socket ->
      socket.soTimeout = 2000
      socket.getOutputStream().write("GET /api/settings HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\nOrigin: https://example.com\r\nAuthorization: Bearer $token\r\n\r\n".toByteArray())
      assertTrue(socket.getInputStream().bufferedReader().readLine().contains("403"))
    }
    Socket("127.0.0.1", address.port).use { socket ->
      socket.soTimeout = 2000
      socket.getOutputStream().write("GET / HTTP/1.1\r\nHost: attacker.example:${address.port}\r\n\r\n".toByteArray())
      assertTrue(socket.getInputStream().bufferedReader().readLine().contains("403"))
    }
  }
  @Test fun `wallpaper transport forwards bytes only after successful pairing`() {
    val address = URL(info.getString("url"))
    val connection = URL(address.toString() + "/api/wallpaper").openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "POST"; connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer ${pair()}")
      connection.setRequestProperty("Content-Type", "image/jpeg")
      connection.outputStream.use { it.write(byteArrayOf(1, 2, 3)) }
      assertEquals(200, connection.responseCode)
      val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
      assertEquals(3, json.getInt("receivedBytes"))
    } finally { connection.disconnect() }
  }
  @Test fun `pairing guesses are rate limited`() {
    val wrong = if (info.getString("code") == "111111") "222222" else "111111"
    repeat(5) { assertEquals(401, request("/api/pair", "POST", "{\"code\":\"$wrong\"}").first) }
    assertEquals(429, request("/api/pair", "POST", JSONObject().put("code", info.getString("code")).toString()).first)
  }
  @Test fun `oversized wallpaper is rejected before reading upload`() {
    val token = pair()
    val address = URL(info.getString("url"))
    Socket("127.0.0.1", address.port).use { socket ->
      socket.soTimeout = 2000
      val request = "POST /api/wallpaper HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\nAuthorization: Bearer $token\r\nContent-Type: image/jpeg\r\nContent-Length: ${CompanionServer.MAX_IMAGE_BYTES + 1}\r\n\r\n"
      socket.getOutputStream().write(request.toByteArray())
      assertTrue(socket.getInputStream().bufferedReader().readLine().contains("413"))
    }
  }
  @Test fun `public page is available without exposing settings and stopping closes listener`() {
    assertEquals(200, request("/").first)
    server.stop()
    assertTrue(stopped)
    var connected = false
    try { request("/"); connected = true } catch (_: Exception) { }
    assertFalse(connected)
  }
}
