package com.onelauncher

object ImageSizing {
  fun sampleSize(width: Int, height: Int): Int {
    require(width in 1..30000 && height in 1..30000) { "Choose a valid JPEG, PNG or WebP image." }
    var sample = 1
    while (width / sample > 2560 || height / sample > 1440) { sample *= 2 }
    return sample
  }
}
