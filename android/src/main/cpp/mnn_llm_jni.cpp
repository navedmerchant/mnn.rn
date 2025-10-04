#include <android/asset_manager_jni.h>
#include <android/bitmap.h>
#include <android/log.h>
#include <jni.h>
#include <string>
#include <utility>
#include <vector>
#include <thread>
#include <mutex>
#include <ostream>
#include <sstream>
#include <chrono>
#include "mls_log.h"
#include "MNN/expr/ExecutorScope.hpp"
#include "nlohmann/json.hpp"
#include "llm_stream_buffer.hpp"
#include "utf8_stream_processor.hpp"
#include "llm_session.h"

using MNN::Transformer::Llm;
using json = nlohmann::json;

extern "C" {

JNIEXPORT jint JNI_OnLoad(JavaVM *vm, void *reserved) {
    __android_log_print(ANDROID_LOG_DEBUG, "MNN_RN_DEBUG", "JNI_OnLoad");
    return JNI_VERSION_1_4;
}

JNIEXPORT void JNI_OnUnload(JavaVM *vm, void *reserved) {
    __android_log_print(ANDROID_LOG_DEBUG, "MNN_RN_DEBUG", "JNI_OnUnload");
}

JNIEXPORT jlong JNICALL Java_com_mnnrn_MnnRnModule_initNative(JNIEnv *env,
                                                              jobject thiz,
                                                              jstring modelDir,
                                                              jobject chat_history,
                                                              jstring mergeConfigStr,
                                                              jstring configJsonStr) {
    MNN_DEBUG("initNative: START");
    const char *model_dir = env->GetStringUTFChars(modelDir, nullptr);
    auto model_dir_str = std::string(model_dir);
    MNN_DEBUG("initNative: modelDir=%s", model_dir_str.c_str());
    const char *config_json_cstr = env->GetStringUTFChars(configJsonStr, nullptr);
    const char *merged_config_cstr = env->GetStringUTFChars(mergeConfigStr, nullptr);
    MNN_DEBUG("initNative: Parsing config JSON");
    json merged_config = json::parse(merged_config_cstr);
    json extra_json_config = json::parse(config_json_cstr);
    env->ReleaseStringUTFChars(modelDir, model_dir);
    env->ReleaseStringUTFChars(configJsonStr, config_json_cstr);
    env->ReleaseStringUTFChars(mergeConfigStr, merged_config_cstr);
    
    MNN_DEBUG("createLLM BeginLoad %s", model_dir_str.c_str());
    
    std::vector<std::string> history;
    history.clear();
    MNN_DEBUG("initNative: Processing chat history");
    if (chat_history != nullptr) {
        jclass listClass = env->GetObjectClass(chat_history);
        jmethodID sizeMethod = env->GetMethodID(listClass, "size", "()I");
        jmethodID getMethod = env->GetMethodID(listClass, "get", "(I)Ljava/lang/Object;");
        jint listSize = env->CallIntMethod(chat_history, sizeMethod);
        MNN_DEBUG("initNative: Chat history size=%d", listSize);
        for (jint i = 0; i < listSize; i++) {
            jobject element = env->CallObjectMethod(chat_history, getMethod, i);
            const char *elementCStr = env->GetStringUTFChars((jstring) element, nullptr);
            history.emplace_back(elementCStr);
            env->ReleaseStringUTFChars((jstring) element, elementCStr);
            env->DeleteLocalRef(element);
        }
    }
    
    auto llm_session = new mls::LlmSession(model_dir_str, merged_config, extra_json_config, history);
    llm_session->Load();
    MNN_DEBUG("LIFECYCLE: LlmSession CREATED at %p", llm_session);
    MNN_DEBUG("createLLM EndLoad %ld ", reinterpret_cast<jlong>(llm_session));
    return reinterpret_cast<jlong>(llm_session);
}

JNIEXPORT jobject JNICALL Java_com_mnnrn_MnnRnModule_submitNative(JNIEnv *env,
                                                                  jobject thiz,
                                                                  jlong llmPtr,
                                                                  jstring inputStr,
                                                                  jboolean keepHistory,
                                                                  jobject progressListener) {
    MNN_DEBUG("submitNative: START - llmPtr=%p", reinterpret_cast<void*>(llmPtr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(llmPtr);
    if (!llm) {
        MNN_DEBUG("submitNative: ERROR - LLM session is null");
        // Return error result
        jclass hashMapClass = env->FindClass("java/util/HashMap");
        jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
        return env->NewObject(hashMapClass, hashMapInit);
    }
    
    const char *input_str = env->GetStringUTFChars(inputStr, nullptr);
    MNN_DEBUG("submitNative: input=%s, keepHistory=%d", input_str, keepHistory);
    jclass progressListenerClass = env->GetObjectClass(progressListener);
    jmethodID onProgressMethod = env->GetMethodID(progressListenerClass, "onProgress",
                                                  "(Ljava/lang/String;)Z");
    if (!onProgressMethod) {
        MNN_DEBUG("submitNative: ERROR - ProgressListener onProgress method not found");
    }
    
    MNN_DEBUG("submitNative: Calling llm->Response()");
    auto *context = llm->Response(input_str, [&, progressListener, onProgressMethod](
            const std::string &response, bool is_eop) {
        if (progressListener && onProgressMethod) {
            MNN_DEBUG("submitNative: Response callback - is_eop=%d, response_len=%zu", is_eop, response.length());
            if (!is_eop && response.length() > 0) {
                MNN_DEBUG("submitNative: Response chunk: %s", response.c_str());
            }
            jstring javaString = is_eop ? nullptr : env->NewStringUTF(response.c_str());
            jboolean user_stop_requested = env->CallBooleanMethod(progressListener,
                                                                  onProgressMethod, javaString);
            MNN_DEBUG("submitNative: Response callback - user_stop_requested=%d", user_stop_requested);
            if (javaString) {
                env->DeleteLocalRef(javaString);
            }
            return (bool) user_stop_requested;
        } else {
            MNN_DEBUG("submitNative: Response callback - no listener, returning true");
            return true;
        }
    });
    
    env->ReleaseStringUTFChars(inputStr, input_str);
    
    int64_t prompt_len = 0;
    int64_t decode_len = 0;
    int64_t vision_time = 0;
    int64_t audio_time = 0;
    int64_t prefill_time = 0;
    int64_t decode_time = 0;
    
    if (context) {
        prompt_len += context->prompt_len;
        decode_len += context->gen_seq_len;
        vision_time += context->vision_us;
        audio_time += context->audio_us;
        prefill_time += context->prefill_us;
        decode_time += context->decode_us;
        MNN_DEBUG("submitNative: Context stats - prompt_len=%lld, decode_len=%lld, vision_time=%lld, audio_time=%lld, prefill_time=%lld, decode_time=%lld",
                  (long long)prompt_len, (long long)decode_len, (long long)vision_time,
                  (long long)audio_time, (long long)prefill_time, (long long)decode_time);
    } else {
        MNN_DEBUG("submitNative: WARNING - context is null");
    }
    
    jclass hashMapClass = env->FindClass("java/util/HashMap");
    jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
    jmethodID putMethod = env->GetMethodID(hashMapClass, "put",
                                           "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");
    jobject hashMap = env->NewObject(hashMapClass, hashMapInit);

    // Add metrics to the HashMap
    jclass longClass = env->FindClass("java/lang/Long");
    jmethodID longInit = env->GetMethodID(longClass, "<init>", "(J)V");
    
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("promptLen"),
                          env->NewObject(longClass, longInit, prompt_len));
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("decodeLen"),
                          env->NewObject(longClass, longInit, decode_len));
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("visionTime"),
                          env->NewObject(longClass, longInit, vision_time));
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("audioTime"),
                          env->NewObject(longClass, longInit, audio_time));
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("prefillTime"),
                          env->NewObject(longClass, longInit, prefill_time));
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("decodeTime"),
                          env->NewObject(longClass, longInit, decode_time));
    
    MNN_DEBUG("submitNative: END - returning metrics");
    return hashMap;
}

JNIEXPORT jobject JNICALL Java_com_mnnrn_MnnRnModule_submitFullHistoryNative(
        JNIEnv *env,
        jobject thiz,
        jlong llmPtr,
        jobject historyList,  // List<Pair<String, String>>
        jobject progressListener
) {
    MNN_DEBUG("submitFullHistoryNative: START - llmPtr=%p", reinterpret_cast<void*>(llmPtr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(llmPtr);
    if (!llm) {
        MNN_DEBUG("submitFullHistoryNative: ERROR - LLM session is null");
        // Return error result
        jclass hashMapClass = env->FindClass("java/util/HashMap");
        jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
        return env->NewObject(hashMapClass, hashMapInit);
    }

    // Parse Java List<Pair<String, String>> to C++ vector
    std::vector<mls::PromptItem> history;

    // Get List class and related methods
    jclass listClass = env->GetObjectClass(historyList);
    jmethodID sizeMethod = env->GetMethodID(listClass, "size", "()I");
    jmethodID getMethod = env->GetMethodID(listClass, "get", "(I)Ljava/lang/Object;");

    jint listSize = env->CallIntMethod(historyList, sizeMethod);
    MNN_DEBUG("submitFullHistoryNative: History list size=%d", listSize);

    // Get Pair class and related methods
    jclass pairClass = env->FindClass("android/util/Pair");
    if (pairClass == nullptr) {
        MNN_DEBUG("submitFullHistoryNative: ERROR - Failed to find android.util.Pair class");
        jclass hashMapClass = env->FindClass("java/util/HashMap");
        jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
        return env->NewObject(hashMapClass, hashMapInit);
    }
    jfieldID firstField = env->GetFieldID(pairClass, "first", "Ljava/lang/Object;");
    jfieldID secondField = env->GetFieldID(pairClass, "second", "Ljava/lang/Object;");

    // Iterate through List, extract each Pair
    for (jint i = 0; i < listSize; i++) {
        jobject pairObj = env->CallObjectMethod(historyList, getMethod, i);
        if (pairObj == nullptr) {
            continue;
        }
        jobject roleObj = env->GetObjectField(pairObj, firstField);
        jobject contentObj = env->GetObjectField(pairObj, secondField);

        const char *role = nullptr;
        const char *content = nullptr;
        if (roleObj != nullptr) {
            role = env->GetStringUTFChars((jstring) roleObj, nullptr);
        }
        if (contentObj != nullptr) {
            content = env->GetStringUTFChars((jstring) contentObj, nullptr);
        }

        if (role && content) {
            MNN_DEBUG("submitFullHistoryNative: History item %d - role=%s, content_len=%zu", i, role, strlen(content));
            history.emplace_back(std::string(role), std::string(content));
        }

        if (role) {
            env->ReleaseStringUTFChars((jstring) roleObj, role);
        }
        if (content) {
            env->ReleaseStringUTFChars((jstring) contentObj, content);
        }
        
        if (pairObj) env->DeleteLocalRef(pairObj);
        if (roleObj) env->DeleteLocalRef(roleObj);
        if (contentObj) env->DeleteLocalRef(contentObj);
    }

    // Set progress callback
    jclass progressListenerClass = env->GetObjectClass(progressListener);
    jmethodID onProgressMethod = env->GetMethodID(progressListenerClass, "onProgress",
                                                  "(Ljava/lang/String;)Z");

    if (!onProgressMethod) {
        MNN_DEBUG("submitFullHistoryNative: ERROR - ProgressListener onProgress method not found");
    }
    
    MNN_DEBUG("submitFullHistoryNative: Calling llm->ResponseWithHistory()");
    // Call API service inference method
    auto *context = llm->ResponseWithHistory(history, [&, progressListener, onProgressMethod](
            const std::string &response, bool is_eop) {
        if (progressListener && onProgressMethod) {
            MNN_DEBUG("submitFullHistoryNative: Response callback - is_eop=%d, response_len=%zu", is_eop, response.length());
            if (!is_eop && response.length() > 0) {
                MNN_DEBUG("submitFullHistoryNative: Response chunk: %s", response.c_str());
            }
            jstring javaString = is_eop ? nullptr : env->NewStringUTF(response.c_str());
            jboolean user_stop_requested = env->CallBooleanMethod(progressListener,
                                                                  onProgressMethod, javaString);
            MNN_DEBUG("submitFullHistoryNative: Response callback - user_stop_requested=%d", user_stop_requested);
            if (javaString) {
                env->DeleteLocalRef(javaString);
            }
            return (bool) user_stop_requested;
        } else {
            MNN_DEBUG("submitFullHistoryNative: Response callback - no listener, returning true");
            return true;
        }
    });

    // Build return result
    int64_t prompt_len = 0;
    int64_t decode_len = 0;
    int64_t vision_time = 0;
    int64_t audio_time = 0;
    int64_t prefill_time = 0;
    int64_t decode_time = 0;

    if (context) {
        prompt_len += context->prompt_len;
        decode_len += context->gen_seq_len;
        vision_time += context->vision_us;
        audio_time += context->audio_us;
        prefill_time += context->prefill_us;
        decode_time += context->decode_us;
        MNN_DEBUG("submitFullHistoryNative: Context stats - prompt_len=%lld, decode_len=%lld, vision_time=%lld, audio_time=%lld, prefill_time=%lld, decode_time=%lld",
                  (long long)prompt_len, (long long)decode_len, (long long)vision_time,
                  (long long)audio_time, (long long)prefill_time, (long long)decode_time);
    } else {
        MNN_DEBUG("submitFullHistoryNative: WARNING - context is null");
    }

    jclass hashMapClass = env->FindClass("java/util/HashMap");
    jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
    jmethodID hashMapPut = env->GetMethodID(hashMapClass, "put",
                                            "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");
    jobject hashMap = env->NewObject(hashMapClass, hashMapInit);

    // Add statistics
    jclass longClass = env->FindClass("java/lang/Long");
    jmethodID longInit = env->GetMethodID(longClass, "<init>", "(J)V");

    env->CallObjectMethod(hashMap, hashMapPut, env->NewStringUTF("promptLen"),
                          env->NewObject(longClass, longInit, prompt_len));
    env->CallObjectMethod(hashMap, hashMapPut, env->NewStringUTF("decodeLen"),
                          env->NewObject(longClass, longInit, decode_len));
    env->CallObjectMethod(hashMap, hashMapPut, env->NewStringUTF("visionTime"),
                          env->NewObject(longClass, longInit, vision_time));
    env->CallObjectMethod(hashMap, hashMapPut, env->NewStringUTF("audioTime"),
                          env->NewObject(longClass, longInit, audio_time));
    env->CallObjectMethod(hashMap, hashMapPut, env->NewStringUTF("prefillTime"),
                          env->NewObject(longClass, longInit, prefill_time));
    env->CallObjectMethod(hashMap, hashMapPut, env->NewStringUTF("decodeTime"),
                          env->NewObject(longClass, longInit, decode_time));
    
    MNN_DEBUG("submitFullHistoryNative: END - returning metrics");
    return hashMap;
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_resetNative(JNIEnv *env, jobject thiz, jlong object_ptr) {
    MNN_DEBUG("resetNative: START - object_ptr=%p", reinterpret_cast<void*>(object_ptr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(object_ptr);
    if (llm) {
        MNN_DEBUG("resetNative: Calling llm->Reset()");
        llm->Reset();
        MNN_DEBUG("resetNative: END - Reset complete");
    } else {
        MNN_DEBUG("resetNative: ERROR - LLM session is null");
    }
}

JNIEXPORT jboolean JNICALL Java_com_mnnrn_MnnRnModule_setWavformCallbackNative(
        JNIEnv *env, jobject thiz, jlong instance_id, jobject listener) {
    MNN_DEBUG("setWavformCallbackNative: START - instance_id=%p", reinterpret_cast<void*>(instance_id));
    if (instance_id == 0 || !listener) {
        MNN_DEBUG("setWavformCallbackNative: ERROR - invalid parameters");
        return JNI_FALSE;
    }
    auto *session = reinterpret_cast<mls::LlmSession *>(instance_id);
    jobject global_ref = env->NewGlobalRef(listener);
    JavaVM *jvm;
    env->GetJavaVM(&jvm);
    MNN_DEBUG("setWavformCallbackNative: Setting callback");
    session->SetWavformCallback(
            [jvm, global_ref](const float *data, size_t size, bool is_end) -> bool {
                MNN_DEBUG("Wavform callback: size=%zu, is_end=%d", size, is_end);
                bool needDetach = false;
                JNIEnv *env;
                if (jvm->GetEnv(reinterpret_cast<void **>(&env), JNI_VERSION_1_6) != JNI_OK) {
                    jvm->AttachCurrentThread(&env, NULL);
                    needDetach = true;
                }
                jclass listenerClass = env->GetObjectClass(global_ref);
                jmethodID onAudioDataMethod = env->GetMethodID(listenerClass, "onAudioData",
                                                               "([FZ)Z");
                jfloatArray audioDataArray = env->NewFloatArray(size);
                env->SetFloatArrayRegion(audioDataArray, 0, size, data);
                jboolean result = env->CallBooleanMethod(global_ref, onAudioDataMethod,
                                                         audioDataArray, is_end);
                env->DeleteLocalRef(audioDataArray);
                env->DeleteLocalRef(listenerClass);
                if (needDetach) {
                    jvm->DetachCurrentThread();
                }
                MNN_DEBUG("Wavform callback: result=%d", result);
                return result == JNI_TRUE;
            });

    MNN_DEBUG("setWavformCallbackNative: END - callback set successfully");
    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL Java_com_mnnrn_MnnRnModule_getDebugInfoNative(JNIEnv *env, jobject thiz, jlong objecPtr) {
    MNN_DEBUG("getDebugInfoNative: START - objecPtr=%p", reinterpret_cast<void*>(objecPtr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(objecPtr);
    if (llm == nullptr) {
        MNN_DEBUG("getDebugInfoNative: ERROR - LLM session is null");
        return env->NewStringUTF("");
    }
    std::string debug_info = llm->getDebugInfo();
    MNN_DEBUG("getDebugInfoNative: END - returning debug info (len=%zu)", debug_info.length());
    return env->NewStringUTF(debug_info.c_str());
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_releaseNative(JNIEnv *env, jobject thiz, jlong objecPtr) {
    MNN_DEBUG("LIFECYCLE: About to DESTROY LlmSession at %p", reinterpret_cast<void*>(objecPtr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(objecPtr);
    delete llm;
    MNN_DEBUG("LIFECYCLE: LlmSession DESTROYED at %p", reinterpret_cast<void*>(objecPtr));
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_updateMaxNewTokensNative(JNIEnv *env, jobject thiz,
                                                                           jlong llm_ptr,
                                                                           jint max_new_tokens) {
    MNN_DEBUG("updateMaxNewTokensNative: START - llm_ptr=%p, max_new_tokens=%d", reinterpret_cast<void*>(llm_ptr), max_new_tokens);
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    if (llm) {
        llm->SetMaxNewTokens(max_new_tokens);
        MNN_DEBUG("updateMaxNewTokensNative: END - updated successfully");
    } else {
        MNN_DEBUG("updateMaxNewTokensNative: ERROR - LLM session is null");
    }
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_updateSystemPromptNative(JNIEnv *env, jobject thiz,
                                                                           jlong llm_ptr,
                                                                           jstring system_promp_j) {
    MNN_DEBUG("updateSystemPromptNative: START - llm_ptr=%p", reinterpret_cast<void*>(llm_ptr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    const char *system_prompt_cstr = env->GetStringUTFChars(system_promp_j, nullptr);
    MNN_DEBUG("updateSystemPromptNative: system_prompt=%s", system_prompt_cstr);
    if (llm) {
        llm->setSystemPrompt(system_prompt_cstr);
        MNN_DEBUG("updateSystemPromptNative: END - updated successfully");
    } else {
        MNN_DEBUG("updateSystemPromptNative: ERROR - LLM session is null");
    }
    env->ReleaseStringUTFChars(system_promp_j, system_prompt_cstr);
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_updateAssistantPromptNative(JNIEnv *env,
                                                                              jobject thiz,
                                                                              jlong llm_ptr,
                                                                              jstring assistant_prompt_j) {
    MNN_DEBUG("updateAssistantPromptNative: START - llm_ptr=%p", reinterpret_cast<void*>(llm_ptr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    const char *assistant_prompt_cstr = env->GetStringUTFChars(assistant_prompt_j, nullptr);
    MNN_DEBUG("updateAssistantPromptNative: assistant_prompt=%s", assistant_prompt_cstr);
    if (llm) {
        llm->SetAssistantPrompt(assistant_prompt_cstr);
        MNN_DEBUG("updateAssistantPromptNative: END - updated successfully");
    } else {
        MNN_DEBUG("updateAssistantPromptNative: ERROR - LLM session is null");
    }
    env->ReleaseStringUTFChars(assistant_prompt_j, assistant_prompt_cstr);
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_updateConfigNative(JNIEnv *env,
                                                                     jobject thiz,
                                                                     jlong llm_ptr,
                                                                     jstring config_json_j) {
    MNN_DEBUG("updateConfigNative: START - llm_ptr=%p", reinterpret_cast<void*>(llm_ptr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    const char *config_json_cstr = env->GetStringUTFChars(config_json_j, nullptr);
    MNN_DEBUG("updateConfigNative: config_json=%s", config_json_cstr);
    if (llm) {
        llm->updateConfig(config_json_cstr);
        MNN_DEBUG("updateConfigNative: END - updated successfully");
    } else {
        MNN_DEBUG("updateConfigNative: ERROR - LLM session is null");
    }
    env->ReleaseStringUTFChars(config_json_j, config_json_cstr);
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_updateEnableAudioOutputNative(JNIEnv *env,jobject thiz, jlong llm_ptr, jboolean enable) {
    MNN_DEBUG("updateEnableAudioOutputNative: START - llm_ptr=%p, enable=%d", reinterpret_cast<void*>(llm_ptr), enable);
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    if (llm) {
        llm->enableAudioOutput((bool)enable);
        MNN_DEBUG("updateEnableAudioOutputNative: END - updated successfully");
    } else {
        MNN_DEBUG("updateEnableAudioOutputNative: ERROR - LLM session is null");
    }
}

JNIEXPORT jstring JNICALL Java_com_mnnrn_MnnRnModule_getSystemPromptNative(JNIEnv *env, jobject thiz, jlong llm_ptr) {
    MNN_DEBUG("getSystemPromptNative: START - llm_ptr=%p", reinterpret_cast<void*>(llm_ptr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    if (llm) {
        std::string system_prompt = llm->getSystemPrompt();
        MNN_DEBUG("getSystemPromptNative: END - returning prompt (len=%zu)", system_prompt.length());
        return env->NewStringUTF(system_prompt.c_str());
    }
    MNN_DEBUG("getSystemPromptNative: ERROR - LLM session is null");
    return nullptr;
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_clearHistoryNative(JNIEnv *env, jobject thiz, jlong llm_ptr) {
    MNN_DEBUG("clearHistoryNative: START - llm_ptr=%p", reinterpret_cast<void*>(llm_ptr));
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    if (llm) {
        llm->clearHistory();
        MNN_DEBUG("clearHistoryNative: END - history cleared");
    } else {
        MNN_DEBUG("clearHistoryNative: ERROR - LLM session is null");
    }
}

// Simplified benchmark implementation - can be expanded later
JNIEXPORT jobject JNICALL Java_com_mnnrn_MnnRnModule_runBenchmarkNative(
        JNIEnv *env,
        jobject thiz,
        jlong llmPtr,
        jint backend,
        jint threads,
        jboolean useMmap,
        jint power,
        jint precision,
        jint memory,
        jint dynamicOption,
        jint nPrompt,
        jint nGenerate,
        jint nRepeat,
        jboolean kvCache,
        jobject testInstance,
        jobject callback
) {
    MNN_DEBUG("runBenchmarkNative: START - llmPtr=%p, backend=%d, threads=%d, nPrompt=%d, nGenerate=%d",
              reinterpret_cast<void*>(llmPtr), backend, threads, nPrompt, nGenerate);
    auto *llm_session = reinterpret_cast<mls::LlmSession *>(llmPtr);
    if (!llm_session) {
        MNN_DEBUG("runBenchmarkNative: ERROR - LLM session is null");
        // Return failure result
        jclass hashMapClass = env->FindClass("java/util/HashMap");
        jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
        jmethodID putMethod = env->GetMethodID(hashMapClass, "put",
                                               "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");
        jobject hashMap = env->NewObject(hashMapClass, hashMapInit);
        env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("success"), 
                              env->NewObject(env->FindClass("java/lang/Boolean"),
                                           env->GetMethodID(env->FindClass("java/lang/Boolean"), "<init>", "(Z)V"),
                                           JNI_FALSE));
        env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("errorMessage"), 
                              env->NewStringUTF("LLM session is not initialized"));
        return hashMap;
    }

    MNN_DEBUG("BENCHMARK: Attempting to use LlmSession at %p", llm_session);
    
    // Return basic success result for now - full benchmark implementation can be added later
    jclass hashMapClass = env->FindClass("java/util/HashMap");
    jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
    jmethodID putMethod = env->GetMethodID(hashMapClass, "put",
                                           "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");
    jobject hashMap = env->NewObject(hashMapClass, hashMapInit);
    
    env->CallObjectMethod(hashMap, putMethod, env->NewStringUTF("success"), 
                          env->NewObject(env->FindClass("java/lang/Boolean"),
                                       env->GetMethodID(env->FindClass("java/lang/Boolean"), "<init>", "(Z)V"),
                                       JNI_TRUE));
    
    MNN_DEBUG("runBenchmarkNative: END - returning success");
    return hashMap;
}

} // extern "C"