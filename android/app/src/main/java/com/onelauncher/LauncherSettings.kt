package com.onelauncher

import android.content.Context
import android.graphics.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.TimeZone

/** Personal settings and uploaded images stay in private app storage. */
class LauncherSettings(private val context: Context, private val onChanged: () -> Unit) {
  private val prefs = context.getSharedPreferences("home", Context.MODE_PRIVATE)
  private val zones = java.time.ZoneId.getAvailableZoneIds() + TimeZone.getDefault().id

  @Synchronized
  fun read(): JSONObject {
    val stored = try { JSONObject(prefs.getString("settings", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    val result = JSONObject()
      .put("homeName", stored.optString("homeName", "Welcome home"))
      .put("timeZones", stored.optJSONArray("timeZones") ?: JSONArray().put(TimeZone.getDefault().id))
      .put("hour24", stored.optBoolean("hour24", false))
      .put("weather", stored.optJSONObject("weather") ?: JSONObject.NULL)
    val custom = prefs.getString("wallpaperFile", null)?.let { File(context.filesDir, it) }?.takeIf { it.exists() }
    result.put("wallpaperUri", "file://" + (custom ?: defaultWallpaper()).absolutePath)
    result.put("customWallpaper", custom != null)
    return result
  }

  @Synchronized
  fun update(input: JSONObject): JSONObject {
    val current = read()
    val name = input.optString("homeName", current.getString("homeName")).trim()
    require(name.length <= 60) { "The home name must be 60 characters or fewer." }
    val chosen = input.optJSONArray("timeZones") ?: current.getJSONArray("timeZones")
    require(chosen.length() in 1..3) { "Choose one to three time zones." }
    val unique = linkedSetOf<String>()
    for (i in 0 until chosen.length()) {
      val zone = chosen.getString(i)
      require(zone in zones) { "Choose a valid time zone." }
      unique.add(zone)
    }
    val weather = if (input.has("weather")) input.optJSONObject("weather") else current.optJSONObject("weather")
    var cleanWeather: JSONObject? = null
    if (weather != null) {
      val lat = weather.getDouble("latitude")
      val lon = weather.getDouble("longitude")
      require(lat.isFinite() && lon.isFinite() && lat in -90.0..90.0 && lon in -180.0..180.0) { "Invalid weather location." }
      val city = weather.getString("name").trim()
      require(city.isNotEmpty() && city.length <= 100) { "Choose a weather location." }
      cleanWeather = JSONObject().put("name", city).put("latitude", lat).put("longitude", lon)
        .put("source", if (weather.optString("source") == "device") "device" else "city")
    }
    val next = JSONObject().put("homeName", name).put("timeZones", JSONArray(unique.toList()))
      .put("hour24", input.optBoolean("hour24", current.getBoolean("hour24")))
      .put("weather", cleanWeather ?: JSONObject.NULL)
    check(prefs.edit().putString("settings", next.toString()).commit()) { "Could not save your settings." }
    onChanged()
    return read()
  }

  @Synchronized
  fun saveWallpaper(bytes: ByteArray): JSONObject {
    require(bytes.size in 1..MAX_WALLPAPER_BYTES) { "Choose an image smaller than 8 MB." }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val options = BitmapFactory.Options().apply { inSampleSize = ImageSizing.sampleSize(bounds.outWidth, bounds.outHeight) }
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
      ?: throw IllegalArgumentException("This image could not be opened.")
    val file = File(context.filesDir, "wallpaper-${java.util.UUID.randomUUID()}.jpg")
    try {
      file.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it)) }
      val previous = prefs.getString("wallpaperFile", null)
      check(prefs.edit().putString("wallpaperFile", file.name).commit()) { "Could not save your wallpaper." }
      previous?.let { File(context.filesDir, it).delete() }
    } catch (e: Exception) { file.delete(); throw e }
    finally { bitmap.recycle() }
    onChanged()
    return read()
  }

  @Synchronized
  fun resetWallpaper(): JSONObject {
    val previous = prefs.getString("wallpaperFile", null)
    check(prefs.edit().remove("wallpaperFile").commit())
    previous?.let { File(context.filesDir, it).delete() }
    onChanged()
    return read()
  }

  private fun defaultWallpaper(): File {
    val file = File(context.filesDir, "aurora-desktop-v1.png")
    if (file.exists()) return file
    val bitmap = Bitmap.createBitmap(1920, 1080, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.shader = LinearGradient(0f, 0f, 1920f, 1080f, intArrayOf(Color.rgb(10, 27, 61), Color.rgb(38, 74, 115), Color.rgb(115, 74, 126)), null, Shader.TileMode.CLAMP)
    canvas.drawRect(0f, 0f, 1920f, 1080f, paint)
    val back = Path().apply { moveTo(-200f, 1200f); cubicTo(180f, 380f, 850f, 1100f, 1330f, 460f); cubicTo(1590f, 100f, 1800f, 20f, 2150f, 280f); lineTo(2150f, 1200f); close() }
    paint.shader = LinearGradient(400f, 600f, 1900f, 1080f, intArrayOf(Color.rgb(246, 143, 143), Color.rgb(157, 97, 159), Color.rgb(71, 72, 153)), null, Shader.TileMode.CLAMP)
    canvas.drawPath(back, paint)
    val front = Path().apply { moveTo(-100f, 900f); cubicTo(400f, 350f, 920f, 1250f, 1520f, 750f); cubicTo(1750f, 570f, 1850f, 670f, 2050f, 430f); lineTo(2050f, 1200f); lineTo(-100f, 1200f); close() }
    paint.shader = LinearGradient(0f, 620f, 1400f, 1150f, intArrayOf(Color.rgb(42, 134, 168), Color.rgb(31, 66, 115), Color.rgb(22, 33, 71)), null, Shader.TileMode.CLAMP)
    canvas.drawPath(front, paint)
    file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
    return file
  }

  companion object { const val MAX_WALLPAPER_BYTES = 8 * 1024 * 1024 }
}
