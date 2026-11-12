package au.com.opax.textmetrics

import android.os.Build
import android.util.TypedValue
import com.facebook.react.uimanager.DisplayMetricsHolder
import com.facebook.react.uimanager.PixelUtil
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Pure unit conversion using the same metrics and SP conversion as RN Text.
// No cached scale: configuration changes can replace the nonlinear curve.
class OpaxTextMetricsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OpaxTextMetrics")
    Function("spToDp") { sp: Double ->
      PixelUtil.toDIPFromPixel(PixelUtil.toPixelFromSP(sp)).toDouble()
    }
    Function("dpToSp") { dp: Double ->
      val metrics = DisplayMetricsHolder.getScreenDisplayMetrics()
      val px = PixelUtil.toPixelFromDIP(dp)
      if (Build.VERSION.SDK_INT >= 34) {
        TypedValue.deriveDimension(TypedValue.COMPLEX_UNIT_SP, px, metrics).toDouble()
      } else {
        (px / metrics.scaledDensity).toDouble()
      }
    }
  }
}
