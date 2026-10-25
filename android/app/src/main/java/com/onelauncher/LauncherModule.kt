package com.onelauncher

import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.net.ConnectivityManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.provider.Settings
import android.util.Base64
import com.facebook.react.bridge.*
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.net.NetworkInterface
import java.net.Inet4Address
import org.json.JSONObject
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class LauncherModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  private val settings = LauncherSettings(context) { emit("settingsChanged") }
  private var companion: CompanionServer? = null
  private val companionGeneration = AtomicLong(0)
  private val mainHandler = Handler(Looper.getMainLooper())
  private val locating = AtomicBoolean(false)
  private var locationListener: LocationListener? = null
  override fun getName() = "Launcher"

  private fun emit(event: String) {
    if (context.hasActiveReactInstance()) {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, null)
    }
  }

  @ReactMethod
  fun getSettings(promise: Promise) {
    executor.execute {
      try { promise.resolve(settings.read().toString()) }
      catch (e: Exception) { promise.reject("SETTINGS_FAILED", "Unable to read home settings", e) }
    }
  }

  @ReactMethod
  fun startCompanion(promise: Promise) {
    val generation = companionGeneration.incrementAndGet()
    executor.execute {
      try {
        if (generation != companionGeneration.get()) { promise.reject("PAIRING_CANCELLED", "Phone connection cancelled"); return@execute }
        companion?.stop()
        val connectivity = context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeAddresses = connectivity.activeNetwork?.let { connectivity.getLinkProperties(it) }
          ?.linkAddresses?.map { it.address }?.filterIsInstance<Inet4Address>()
          ?.filter { it.isSiteLocalAddress }?.mapNotNull { it.hostAddress }.orEmpty()
        val interfaceAddresses = NetworkInterface.getNetworkInterfaces().toList()
          .filter { it.isUp && !it.isLoopback }
          .flatMap { it.inetAddresses.toList() }
          .filterIsInstance<Inet4Address>().filter { it.isSiteLocalAddress }
          .mapNotNull { it.hostAddress }.distinct()
        val addresses = (activeAddresses + interfaceAddresses).distinct()
        val server = CompanionServer(context.assets.open("companion.html").use { it.readBytes() }, addresses,
          settings::read, settings::update, settings::saveWallpaper, settings::resetWallpaper,
          { if (generation == companionGeneration.get()) { emit("companionStopped") } },
          assets = listOf("companion.css", "companion.js").associate { name ->
            "/$name" to context.assets.open(name).use { it.readBytes() }
          })
        companion = server
        val info = server.start()
        if (generation != companionGeneration.get()) { server.stop(); promise.reject("PAIRING_CANCELLED", "Phone connection cancelled") }
        else {
          val link = info.getString("url") + "#code=" + info.getString("code")
          val matrix = com.google.zxing.qrcode.QRCodeWriter().encode(link, com.google.zxing.BarcodeFormat.QR_CODE, 600, 600)
          val bitmap = Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
          for (y in 0 until matrix.height) for (x in 0 until matrix.width) bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
          val bytes = ByteArrayOutputStream()
          bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)
          bitmap.recycle()
          info.put("qrImage", "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
          promise.resolve(info.toString())
        }
      } catch (e: Exception) { promise.reject("PAIRING_FAILED", "Unable to open a phone connection. Check Wi-Fi and try again.", e) }
    }
  }

  @ReactMethod
  fun stopCompanion() { companionGeneration.incrementAndGet(); companion?.stop(); companion = null }

  @ReactMethod
  fun resetWallpaper(promise: Promise) {
    executor.execute {
      try { promise.resolve(settings.resetWallpaper().toString()) }
      catch (e: Exception) { promise.reject("WALLPAPER_FAILED", "Unable to restore the default wallpaper", e) }
    }
  }

  @ReactMethod
  fun requestCurrentLocation(promise: Promise) {
    if (context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("LOCATION_PERMISSION", "Allow approximate location on the TV, or choose a city from your phone."); return
    }
    if (!locating.compareAndSet(false, true)) {
      promise.reject("LOCATION_BUSY", "A location request is already running."); return
    }
    mainHandler.post {
      val manager = context.getSystemService(android.content.Context.LOCATION_SERVICE) as LocationManager
      val done = AtomicBoolean(false)
      fun finish(location: Location?, message: String? = null) {
        if (!done.compareAndSet(false, true)) return
        locationListener?.let { manager.removeUpdates(it) }
        locationListener = null
        locating.set(false)
        if (location == null) { promise.reject("LOCATION_UNAVAILABLE", message ?: "Location is unavailable on this TV. Choose a city from your phone."); return }
        executor.execute {
          try {
            val weather = JSONObject().put("name", "Current location").put("latitude", location.latitude)
              .put("longitude", location.longitude).put("source", "device")
            promise.resolve(settings.update(JSONObject().put("weather", weather)).toString())
          } catch (e: Exception) { promise.reject("LOCATION_FAILED", "Unable to save the weather location", e) }
        }
      }
      try {
        if (!manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
          finish(null, "Turn on TV location services, or choose a city from your phone.")
        } else {
          val cached = manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
          val age = cached?.let { System.currentTimeMillis() - it.time }
          if (cached != null && age != null && age in 0..(30 * 60 * 1000L)) { finish(cached) }
          else {
            val listener = object : LocationListener {
              override fun onLocationChanged(location: Location) { finish(location) }
              override fun onProviderDisabled(provider: String) { finish(null) }
              override fun onProviderEnabled(provider: String) { }
              @Deprecated("Legacy Android location callback")
              override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) { }
            }
            locationListener = listener
            @Suppress("DEPRECATION")
            manager.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, listener, Looper.getMainLooper())
            mainHandler.postDelayed({ finish(null) }, 15000)
          }
        }
      } catch (_: Exception) { finish(null) }
    }
  }

  @ReactMethod
  fun getApps(promise: Promise) {
    executor.execute {
      try {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
        val apps = pm.queryIntentActivities(intent, 0)
          .filter { it.activityInfo.packageName != context.packageName }
          .distinctBy { it.activityInfo.packageName }
          .sortedBy { it.loadLabel(pm).toString().lowercase() }
        val result = Arguments.createArray()
        for (app in apps) {
          val entry = Arguments.createMap()
          entry.putString("packageName", app.activityInfo.packageName)
          entry.putString("label", app.loadLabel(pm).toString())
          try {
            val icon = app.loadIcon(pm)
            val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
            icon.setBounds(0, 0, 96, 96)
            icon.draw(Canvas(bitmap))
            val bytes = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)
            entry.putString("icon", "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
            bitmap.recycle()
          } catch (_: Exception) { /* Labels remain usable if a vendor icon cannot be decoded. */ }
          result.pushMap(entry)
        }
        promise.resolve(result)
      } catch (e: Exception) { promise.reject("APPS_FAILED", "Unable to load TV apps", e) }
    }
  }

  @ReactMethod
  fun openApp(packageName: String, promise: Promise) {
    try {
      require(packageName != context.packageName) { "Cannot launch the home screen from itself" }
      val pm = context.packageManager
      val intent = pm.getLeanbackLaunchIntentForPackage(packageName)
        ?: throw IllegalArgumentException("This app is no longer available")
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("OPEN_FAILED", "Unable to open this app", e) }
  }

  @ReactMethod
  fun openSettings(promise: Promise) {
    try {
      context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("SETTINGS_FAILED", "Unable to open settings", e) }
  }

  override fun invalidate() {
    stopCompanion()
    mainHandler.removeCallbacksAndMessages(null)
    val manager = context.getSystemService(android.content.Context.LOCATION_SERVICE) as LocationManager
    locationListener?.let { manager.removeUpdates(it) }
    locationListener = null
    executor.shutdown()
    super.invalidate()
  }
}
