package expo.modules.truecallerfullstack

import android.util.Log
import androidx.fragment.app.FragmentActivity
import com.truecaller.android.sdk.common.VerificationCallback
import com.truecaller.android.sdk.common.VerificationDataBundle
import com.truecaller.android.sdk.common.models.TrueProfile
import com.truecaller.android.sdk.common.TrueException
import com.truecaller.android.sdk.oAuth.TcSdk
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class TruecallerFullstackModule : Module() {
  private val verificationCallback = object : VerificationCallback {
    override fun onRequestSuccess(callbackType: Int, verificationDataBundle: VerificationDataBundle?) {
      val callbackStr = when (callbackType) {
        VerificationCallback.TYPE_MISSED_CALL_INITIATED -> "MISSED_CALL_INITIATED"
        VerificationCallback.TYPE_MISSED_CALL_RECEIVED -> "MISSED_CALL_RECEIVED"
        VerificationCallback.TYPE_IM_OTP_INITIATED -> "IM_OTP_INITIATED"
        VerificationCallback.TYPE_IM_OTP_RECEIVED -> "IM_OTP_RECEIVED"
        VerificationCallback.TYPE_VERIFICATION_COMPLETE -> "VERIFICATION_COMPLETE"
        VerificationCallback.TYPE_PROFILE_VERIFIED_BEFORE -> "PROFILE_VERIFIED_BEFORE"
        else -> "UNKNOWN"
      }
      val map = mutableMapOf<String, Any?>(
        "callbackType" to callbackType,
        "status" to callbackStr
      )
      
      if (verificationDataBundle != null) {
        map["ttl"] = verificationDataBundle.getString(VerificationDataBundle.KEY_TTL)
        map["requestNonce"] = verificationDataBundle.getString(VerificationDataBundle.KEY_REQUEST_NONCE)
      }
      
      if (callbackType == VerificationCallback.TYPE_VERIFICATION_COMPLETE || 
          callbackType == VerificationCallback.TYPE_PROFILE_VERIFIED_BEFORE) {
        try {
          val accessToken = verificationDataBundle?.getString(VerificationDataBundle.KEY_ACCESS_TOKEN)
          map["accessToken"] = accessToken
        } catch (e: Exception) {
          Log.e("TruecallerFullstack", "Failed to get access token", e)
        }
      }
      
      sendEvent("onVerificationSuccess", map)
    }

    override fun onRequestFailure(requestCode: Int, e: TrueException) {
      val map = mapOf(
        "requestCode" to requestCode,
        "errorCode" to e.getExceptionType(),
        "errorMessage" to e.getExceptionMessage()
      )
      sendEvent("onVerificationFailure", map)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("TruecallerFullstack")

    Events("onVerificationSuccess", "onVerificationFailure")

    Function("isUsable") {
      try {
        TcSdk.getInstance() != null && TcSdk.getInstance().isOAuthFlowUsable
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("requestVerification") { phoneNumber: String, promise: Promise ->
      val activity = appContext.currentActivity as? FragmentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "Current activity is null or not a FragmentActivity", null)
        return@AsyncFunction
      }
      try {
        TcSdk.getInstance().requestVerification("IN", phoneNumber, verificationCallback, activity)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ERR_REQUEST_FAILED", e.message, e)
      }
    }

    AsyncFunction("verifyMissedCall") { firstName: String, lastName: String, promise: Promise ->
      try {
        val profile = TrueProfile.Builder(firstName, lastName).build()
        TcSdk.getInstance().verifyMissedCall(profile, verificationCallback)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ERR_VERIFY_MISSED_CALL_FAILED", e.message, e)
      }
    }

    AsyncFunction("verifyOtp") { firstName: String, lastName: String, otp: String, promise: Promise ->
      try {
        val profile = TrueProfile.Builder(firstName, lastName).build()
        TcSdk.getInstance().verifyOtp(profile, otp, verificationCallback)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ERR_VERIFY_OTP_FAILED", e.message, e)
      }
    }
  }
}
