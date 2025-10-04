package com.mnnrn

import android.util.Pair
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicBoolean

@ReactModule(name = MnnRnModule.NAME)
class MnnRnModule(reactContext: ReactApplicationContext) :
  NativeMnnRnSpec(reactContext) {

  private val sessionMap = ConcurrentHashMap<Long, Long>()
  private val sessionIdCounter = AtomicLong(1)
  private val stopFlags = ConcurrentHashMap<Long, AtomicBoolean>()

  override fun getName(): String = NAME

  // ===== Session Lifecycle =====

  @ReactMethod
  override fun init(
    modelDir: String,
    chatHistory: ReadableArray?,
    mergedConfig: String,
    extraConfig: String,
    promise: Promise
  ) {
    Thread {
      try {
        val historyList = chatHistory?.toArrayList() as? ArrayList<String>
        val nativePtr = initNative(modelDir, historyList, mergedConfig, extraConfig)
        
        if (nativePtr == 0L) {
          promise.reject("INIT_ERROR", "Failed to initialize session")
          return@Thread
        }
        
        val sessionId = sessionIdCounter.getAndIncrement()
        sessionMap[sessionId] = nativePtr
        promise.resolve(sessionId.toDouble())
      } catch (e: Exception) {
        promise.reject("INIT_ERROR", e.message, e)
      }
    }.start()
  }

  @ReactMethod
  override fun release(sessionId: Double, promise: Promise) {
    val sid = sessionId.toLong()
    val nativePtr = sessionMap.remove(sid)
    stopFlags.remove(sid)
    if (nativePtr != null) {
      releaseNative(nativePtr)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun reset(sessionId: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      resetNative(nativePtr)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  // ===== Text Generation (Event-based streaming) =====

  @ReactMethod
  override fun submitPromptStreaming(
    sessionId: Double,
    prompt: String,
    keepHistory: Boolean,
    promise: Promise
  ) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr == null) {
      promise.reject("INVALID_SESSION", "Invalid session ID")
      return
    }

    Thread {
      try {
        val sid = sessionId.toLong()
        val stopFlag = stopFlags.getOrPut(sid, { AtomicBoolean(false) })
        stopFlag.set(false) // Reset stop flag at start
        
        // Create progress listener that emits events
        val progressListener = ProgressListener { text ->
          if (stopFlag.get()) {
            true // Stop generation
          } else {
            sendEvent("onLlmChunk", Arguments.createMap().apply {
              putDouble("sessionId", sessionId)
              putString("chunk", text)
            })
            false // Continue generation
          }
        }

        val metricsMap = submitNative(nativePtr, prompt, keepHistory, progressListener)
        
        // Emit completion event
        sendEvent("onLlmComplete", Arguments.createMap().apply {
          putDouble("sessionId", sessionId)
          putMap("metrics", convertHashMapToWritableMap(metricsMap))
        })
        
        promise.resolve(convertHashMapToWritableMap(metricsMap))
      } catch (e: Exception) {
        sendEvent("onLlmError", Arguments.createMap().apply {
          putDouble("sessionId", sessionId)
          putString("error", e.message ?: "Unknown error")
        })
        promise.reject("GENERATION_ERROR", e.message, e)
      }
    }.start()
  }

  // ===== Submit with History (Event-based streaming) =====

  @ReactMethod
  override fun submitWithHistoryStreaming(
    sessionId: Double,
    messages: ReadableArray,
    promise: Promise
  ) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr == null) {
      promise.reject("INVALID_SESSION", "Invalid session ID")
      return
    }

    Thread {
      try {
        val sid = sessionId.toLong()
        val stopFlag = stopFlags.getOrPut(sid, { AtomicBoolean(false) })
        stopFlag.set(false) // Reset stop flag at start
        
        val historyList = convertMessagesToPairs(messages)
        val progressListener = ProgressListener { text ->
          if (stopFlag.get()) {
            true // Stop generation
          } else {
            sendEvent("onLlmChunk", Arguments.createMap().apply {
              putDouble("sessionId", sessionId)
              putString("chunk", text)
            })
            false
          }
        }

        val metricsMap = submitFullHistoryNative(nativePtr, historyList, progressListener)
        
        // Emit completion event
        sendEvent("onLlmComplete", Arguments.createMap().apply {
          putDouble("sessionId", sessionId)
          putMap("metrics", convertHashMapToWritableMap(metricsMap))
        })
        
        promise.resolve(convertHashMapToWritableMap(metricsMap))
      } catch (e: Exception) {
        sendEvent("onLlmError", Arguments.createMap().apply {
          putDouble("sessionId", sessionId)
          putString("error", e.message ?: "Unknown error")
        })
        promise.reject("GENERATION_ERROR", e.message, e)
      }
    }.start()
  }

  // ===== Configuration Methods =====

  @ReactMethod
  override fun updateMaxNewTokens(sessionId: Double, maxTokens: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      updateMaxNewTokensNative(nativePtr, maxTokens.toInt())
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun updateSystemPrompt(sessionId: Double, systemPrompt: String, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      updateSystemPromptNative(nativePtr, systemPrompt)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun updateAssistantPrompt(sessionId: Double, assistantPrompt: String, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      updateAssistantPromptNative(nativePtr, assistantPrompt)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun updateConfig(sessionId: Double, configJson: String, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      updateConfigNative(nativePtr, configJson)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  // ===== History Management =====

  @ReactMethod
  override fun clearHistory(sessionId: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      clearHistoryNative(nativePtr)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  // ===== Information Methods =====

  @ReactMethod
  override fun getSystemPrompt(sessionId: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      val systemPrompt = getSystemPromptNative(nativePtr)
      promise.resolve(systemPrompt)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun getDebugInfo(sessionId: Double, promise: Promise) {
    val nativePtr = sessionMap[sessionId.toLong()]
    if (nativePtr != null) {
      val debugInfo = getDebugInfoNative(nativePtr)
      promise.resolve(debugInfo)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  @ReactMethod
  override fun stopGeneration(sessionId: Double, promise: Promise) {
    val sid = sessionId.toLong()
    val stopFlag = stopFlags[sid]
    if (stopFlag != null) {
      stopFlag.set(true)
      promise.resolve(null)
    } else {
      promise.reject("INVALID_SESSION", "Invalid session ID")
    }
  }

  // ===== Helper Methods =====

  private fun sendEvent(eventName: String, params: WritableMap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  private fun convertMessagesToPairs(messages: ReadableArray): ArrayList<Pair<String, String>> {
    val pairs = ArrayList<Pair<String, String>>()
    for (i in 0 until messages.size()) {
      val message = messages.getMap(i)
      if (message != null) {
        val role = message.getString("role") ?: "user"
        val content = message.getString("content") ?: ""
        pairs.add(Pair(role, content))
      }
    }
    return pairs
  }

  private fun convertHashMapToWritableMap(hashMap: HashMap<*, *>): WritableMap {
    val map = Arguments.createMap()
    for ((key, value) in hashMap) {
      when (value) {
        is Long -> map.putDouble(key.toString(), value.toDouble())
        is Int -> map.putInt(key.toString(), value)
        is String -> map.putString(key.toString(), value)
        is Boolean -> map.putBoolean(key.toString(), value)
      }
    }
    return map
  }

  // ===== Native Method Declarations =====

  private external fun initNative(
    modelDir: String,
    chatHistory: ArrayList<String>?,
    mergedConfig: String,
    extraConfig: String
  ): Long

  private external fun submitNative(
    llmPtr: Long,
    prompt: String,
    keepHistory: Boolean,
    progressListener: ProgressListener?
  ): HashMap<*, *>

  private external fun submitFullHistoryNative(
    llmPtr: Long,
    historyList: ArrayList<Pair<String, String>>,
    progressListener: ProgressListener?
  ): HashMap<*, *>

  private external fun resetNative(llmPtr: Long)
  private external fun releaseNative(llmPtr: Long)
  private external fun updateMaxNewTokensNative(llmPtr: Long, maxTokens: Int)
  private external fun updateSystemPromptNative(llmPtr: Long, systemPrompt: String)
  private external fun updateAssistantPromptNative(llmPtr: Long, assistantPrompt: String)
  private external fun updateConfigNative(llmPtr: Long, configJson: String)
  private external fun clearHistoryNative(llmPtr: Long)
  private external fun getSystemPromptNative(llmPtr: Long): String
  private external fun getDebugInfoNative(llmPtr: Long): String

  // ===== Progress Listener Interface =====

  fun interface ProgressListener {
    fun onProgress(text: String): Boolean
  }

  companion object {
    const val NAME = "MnnRn"

    init {
      System.loadLibrary("mnn-rn")
    }
  }
}
