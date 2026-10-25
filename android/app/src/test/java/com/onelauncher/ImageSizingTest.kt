package com.onelauncher

import org.junit.Assert.*
import org.junit.Test

class ImageSizingTest {
  @Test fun `small images never divide by zero or upscale`() {
    assertEquals(1, ImageSizing.sampleSize(100, 100))
    assertEquals(1, ImageSizing.sampleSize(1920, 1080))
  }
  @Test fun `large portrait and landscape photos fit the memory budget`() {
    for ((width, height) in listOf(30000 to 30000, 8000 to 6000, 4000 to 9000)) {
      val sample = ImageSizing.sampleSize(width, height)
      assertTrue(sample > 0)
      assertTrue(width / sample <= 2560 && height / sample <= 1440)
      assertEquals(0, sample and (sample - 1))
    }
  }
  @Test(expected = IllegalArgumentException::class) fun `invalid image bounds are rejected`() {
    ImageSizing.sampleSize(-1, -1)
  }
}
