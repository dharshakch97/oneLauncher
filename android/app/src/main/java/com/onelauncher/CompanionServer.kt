package com.onelauncher

import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.*
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.TimeZone
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean

/** Short-lived, paired, same-network companion. No external storage or cloud relay. */
class CompanionServer(
  private val page: ByteArray,
  private val addresses: List<String>,
  private val readSettings: () -> JSONObject,
  private val updateSettings: (JSONObject) -> JSONObject,
  private val saveWallpaper: (ByteArray) -> JSONObject,
  private val resetWallpaper: () -> JSONObject,
  private val onStopped: () -> Unit,
  private val port: Int = 8766,
  private val assets: Map<String, ByteArray> = emptyMap(),
  private val lifetimeMs: Long = 10 * 60 * 1000L,
) {
  private val running = AtomicBoolean(false)
  private var listener: ServerSocket? = null
  private val clients = ConcurrentHashMap.newKeySet<Socket>()
  private val workers = ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS, ArrayBlockingQueue<Runnable>(16),
    ThreadFactory { runnable -> Thread(runnable, "oneLauncher-phone").apply { isDaemon = true } })
  private val random = SecureRandom()
  private val code = (100000 + random.nextInt(900000)).toString()
  private val token = ByteArray(32).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }
  private var expiresAt = 0L
  private var failures = 0
  private var blockedUntil = 0L
  private var actualPort = port

  fun start(): JSONObject {
    check(!running.get()) { "A phone connection is already open." }
    require(addresses.isNotEmpty()) { "Connect the TV to Wi-Fi or Ethernet first." }
    val socket = ServerSocket()
    try {
      socket.reuseAddress = true
      socket.bind(InetSocketAddress(port))
      socket.soTimeout = 1000
    } catch (e: Exception) { socket.close(); throw e }
    listener = socket
    actualPort = socket.localPort
    expiresAt = System.currentTimeMillis() + lifetimeMs
    running.set(true)
    Thread({
      try {
        while (running.get() && System.currentTimeMillis() < expiresAt) {
          try {
            val client = socket.accept()
            client.soTimeout = 10000
            clients.add(client)
            try { workers.execute { handle(client) } }
            catch (_: RejectedExecutionException) { clients.remove(client); client.close() }
          } catch (_: SocketTimeoutException) { /* Check expiry once per second. */ }
          catch (_: SocketException) { break }
        }
      } finally { stop() }
    }, "oneLauncher-pairing").apply { isDaemon = true; start() }
    return JSONObject().put("url", "http://${addresses.first()}:$actualPort")
      .put("code", code).put("expiresAt", expiresAt)
  }

  fun stop() {
    if (!running.getAndSet(false)) return
    try { listener?.close() } catch (_: Exception) { }
    clients.forEach { try { it.close() } catch (_: Exception) { } }
    clients.clear()
    workers.shutdownNow()
    onStopped()
  }

  private fun handle(client: Socket) {
    client.use {
      try {
        if (System.currentTimeMillis() >= expiresAt) { respond(client, 410, "Pairing expired."); return }
        val stream = client.getInputStream()
        val header = ByteArrayOutputStream()
        var tail = 0
        while (header.size() < 16384) {
          val next = stream.read()
          if (next < 0) return
          header.write(next)
          tail = (tail shl 8) or next
          if (tail == 0x0d0a0d0a) break
        }
        require(tail == 0x0d0a0d0a) { "Request headers are too large." }
        val lines = header.toString("US-ASCII").split("\r\n")
        val first = lines.first().split(' ')
        require(first.size == 3 && first[2].startsWith("HTTP/1.")) { "Invalid request." }
        val method = first[0]
        val uri = URI(first[1])
        require(!uri.isAbsolute) { "Invalid request target." }
        val headers = mutableMapOf<String, String>()
        for (line in lines.drop(1).filter { it.isNotEmpty() }) {
          val colon = line.indexOf(':')
          require(colon > 0) { "Invalid header." }
          val key = line.substring(0, colon).lowercase()
          require(!headers.containsKey(key)) { "Duplicate header." }
          headers[key] = line.substring(colon + 1).trim()
        }
        val host = headers["host"] ?: ""
        val allowed = (addresses + "127.0.0.1" + "localhost").map { "$it:$actualPort" }
        if (host !in allowed || (headers["origin"] != null && headers["origin"] != "http://$host")) {
          respond(client, 403, "Open the address shown on the TV."); return
        }
        if (headers.containsKey("transfer-encoding")) { respond(client, 400, "Unsupported upload."); return }
        val path = uri.path
        if (method == "GET" && path == "/") { respondBytes(client, 200, page, "text/html; charset=utf-8"); return }
        if (method == "GET" && path in setOf("/companion.css", "/companion.js")) {
          val asset = assets[path]
          if (asset == null) { respond(client, 404, "Not found."); return }
          val mime = if (path.endsWith(".css")) "text/css; charset=utf-8" else "text/javascript; charset=utf-8"
          respondBytes(client, 200, asset, mime); return
        }
        if (path != "/api/pair" && !constantEquals(headers["authorization"] ?: "", "Bearer $token")) {
          respond(client, 401, "Enter the pairing code from your TV."); return
        }
        if (method == "POST" && path != "/api/wallpaper" && !headers["content-type"].orEmpty().startsWith("application/json")) {
          respond(client, 415, "Use a JSON request."); return
        }
        val length = headers["content-length"]?.toIntOrNull() ?: 0
        val maximum = if (path == "/api/wallpaper") MAX_IMAGE_BYTES else 16384
        if (length < 0 || length > maximum) { respond(client, 413, "The upload is too large (8 MB maximum)."); return }
        if (method == "POST" && !headers.containsKey("content-length")) { respond(client, 411, "Upload length is required."); return }
        val body = ByteArray(length)
        var read = 0
        while (read < length) {
          val count = stream.read(body, read, length - read)
          require(count > 0) { "Incomplete upload." }
          read += count
        }
        when {
          method == "POST" && path == "/api/pair" -> {
            val supplied = JSONObject(String(body, Charsets.UTF_8)).optString("code")
            val accepted = synchronized(this) {
              if (System.currentTimeMillis() < blockedUntil) null
              else if (constantEquals(supplied, code)) { failures = 0; true }
              else { failures++; if (failures >= 5) { blockedUntil = System.currentTimeMillis() + 60000; failures = 0 }; false }
            }
            when (accepted) {
              null -> respond(client, 429, "Too many attempts. Wait one minute.")
              false -> respond(client, 401, "That pairing code is incorrect.")
              true -> respondJson(client, JSONObject().put("token", token))
            }
          }
          method == "GET" && path == "/api/settings" -> respondJson(client,
            JSONObject().put("settings", readSettings()).put("timeZones", JSONArray((java.time.ZoneId.getAvailableZoneIds() + TimeZone.getDefault().id).sorted())))
          method == "POST" && path == "/api/settings" -> respondJson(client, updateSettings(JSONObject(String(body, Charsets.UTF_8))))
          method == "POST" && path == "/api/wallpaper" -> {
            if (!headers["content-type"].orEmpty().startsWith("image/")) { respond(client, 415, "Choose an image."); return }
            respondJson(client, saveWallpaper(body))
          }
          method == "POST" && path == "/api/wallpaper/reset" -> respondJson(client, resetWallpaper())
          method == "GET" && path == "/api/cities" -> {
            val query = uri.rawQuery.orEmpty().split('&').map { it.split('=', limit = 2) }
              .firstOrNull { it[0] == "q" }?.getOrNull(1)?.let { URLDecoder.decode(it, "UTF-8") }.orEmpty().trim()
            require(query.length in 2..100) { "Enter a city name." }
            val connection = URL("https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&name=" + URLEncoder.encode(query, "UTF-8")).openConnection() as HttpURLConnection
            try {
              connection.connectTimeout = 8000; connection.readTimeout = 8000
              require(connection.responseCode == 200) { "City search is unavailable. Try again." }
              val json = connection.inputStream.bufferedReader().use { reader -> reader.readText() }
              respondJson(client, JSONObject(json))
            } finally { connection.disconnect() }
          }
          else -> respond(client, 404, "Not found.")
        }
      } catch (_: SocketTimeoutException) { try { respond(client, 408, "The request timed out.") } catch (_: Exception) { } }
      catch (e: IllegalArgumentException) { try { respond(client, 400, e.message ?: "Invalid request.") } catch (_: Exception) { } }
      catch (_: Exception) { try { respond(client, 400, "The request could not be completed. Check the connection and try again.") } catch (_: Exception) { } }
      finally { clients.remove(client) }
    }
  }

  private fun constantEquals(a: String, b: String) = MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))
  private fun respondJson(client: Socket, json: JSONObject) = respondBytes(client, 200, json.toString().toByteArray(Charsets.UTF_8), "application/json; charset=utf-8")
  private fun respond(client: Socket, status: Int, message: String) = respondBytes(client, status, JSONObject().put("error", message).toString().toByteArray(Charsets.UTF_8), "application/json; charset=utf-8")
  private fun respondBytes(client: Socket, status: Int, bytes: ByteArray, contentType: String) {
    val reason = if (status == 200) "OK" else "Error"
    val header = "HTTP/1.1 $status $reason\r\nContent-Type: $contentType\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'\r\n\r\n"
    client.getOutputStream().apply { write(header.toByteArray(Charsets.US_ASCII)); write(bytes); flush() }
  }

  companion object { const val MAX_IMAGE_BYTES = 8 * 1024 * 1024 }
}
