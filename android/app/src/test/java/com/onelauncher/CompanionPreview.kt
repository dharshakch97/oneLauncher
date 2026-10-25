package com.onelauncher

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CountDownLatch

/** Desktop-only harness: exercises the real phone server without connecting to a TV. */
object CompanionPreview {
  @JvmStatic fun main(args: Array<String>) {
    val root = File(args[0])
    val directory = File(root, "work/phone-preview").apply { mkdirs() }
    var settings = JSONObject().put("homeName", "Welcome home").put("timeZones", JSONArray().put("UTC"))
      .put("hour24", false).put("weather", JSONObject.NULL)
    val latch = CountDownLatch(1)
    val server = CompanionServer(File(root, "android/app/src/main/assets/companion.html").readBytes(), listOf("127.0.0.1"),
      { settings },
      { input -> settings = input; File(directory, "saved-settings.json").writeText(input.toString()); settings },
      { bytes -> File(directory, "uploaded-wallpaper.jpg").writeBytes(bytes); JSONObject().put("ok", true) },
      { File(directory, "uploaded-wallpaper.jpg").delete(); JSONObject().put("reset", true) },
      { latch.countDown() }, port = 0,
      assets = listOf("companion.css", "companion.js").associate { name ->
        "/$name" to File(root, "android/app/src/main/assets/$name").readBytes()
      })
    val info = server.start()
    File(directory, "connection.json").writeText(info.toString())
    println("Phone preview is ready on loopback. Connection details: work/phone-preview/connection.json")
    Runtime.getRuntime().addShutdownHook(Thread { server.stop() })
    latch.await()
  }
}
