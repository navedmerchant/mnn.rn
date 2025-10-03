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
    const char *model_dir = env->GetStringUTFChars(modelDir, nullptr);
    auto model_dir_str = std::string(model_dir);
    const char *config_json_cstr = env->GetStringUTFChars(configJsonStr, nullptr);
    const char *merged_config_cstr = env->GetStringUTFChars(mergeConfigStr, nullptr);
    json merged_config = json::parse(merged_config_cstr);
    json extra_json_config = json::parse(config_json_cstr);
    env->ReleaseStringUTFChars(modelDir, model_dir);
    env->ReleaseStringUTFChars(configJsonStr, config_json_cstr);
    env->ReleaseStringUTFChars(mergeConfigStr, merged_config_cstr);
    
    MNN_DEBUG("createLLM BeginLoad %s", model_dir_str.c_str());
    
    std::vector<std::string> history;
    history.clear();
    if (chat_history != nullptr) {
        jclass listClass = env->GetObjectClass(chat_history);
        jmethodID sizeMethod = env->GetMethodID(listClass, "size", "()I");
        jmethodID getMethod = env->GetMethodID(listClass, "get", "(I)Ljava/lang/Object;");
        jint listSize = env->CallIntMethod(chat_history, sizeMethod);
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
    auto *llm = reinterpret_cast<mls::LlmSession *>(llmPtr);
    if (!llm) {
        // Return error result
        jclass hashMapClass = env->FindClass("java/util/HashMap");
        jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
        return env->NewObject(hashMapClass, hashMapInit);
    }
    
    const char *input_str = env->GetStringUTFChars(inputStr, nullptr);
    jclass progressListenerClass = env->GetObjectClass(progressListener);
    jmethodID onProgressMethod = env->GetMethodID(progressListenerClass, "onProgress",
                                                  "(Ljava/lang/String;)Z");
    if (!onProgressMethod) {
        MNN_DEBUG("ProgressListener onProgress method not found.");
    }
    
    auto *context = llm->Response(input_str, [&, progressListener, onProgressMethod](
            const std::string &response, bool is_eop) {
        if (progressListener && onProgressMethod) {
            jstring javaString = is_eop ? nullptr : env->NewStringUTF(response.c_str());
            jboolean user_stop_requested = env->CallBooleanMethod(progressListener,
                                                                  onProgressMethod, javaString);
            if (javaString) {
                env->DeleteLocalRef(javaString);
            }
            return (bool) user_stop_requested;
        } else {
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
    
    return hashMap;
}

JNIEXPORT jobject JNICALL Java_com_mnnrn_MnnRnModule_submitFullHistoryNative(
        JNIEnv *env,
        jobject thiz,
        jlong llmPtr,
        jobject historyList,  // List<Pair<String, String>>
        jobject progressListener
) {
    auto *llm = reinterpret_cast<mls::LlmSession *>(llmPtr);
    if (!llm) {
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

    // Get Pair class and related methods
    jclass pairClass = env->FindClass("android/util/Pair");
    if (pairClass == nullptr) {
        MNN_DEBUG("Failed to find android.util.Pair class");
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
        MNN_DEBUG("ProgressListener onProgress method not found.");
    }

    // Call API service inference method
    auto *context = llm->ResponseWithHistory(history, [&, progressListener, onProgressMethod](
            const std::string &response, bool is_eop) {
        if (progressListener && onProgressMethod) {
            jstring javaString = is_eop ? nullptr : env->NewStringUTF(response.c_str());
            jboolean user_stop_requested = env->CallBooleanMethod(progressListener,
                                                                  onProgressMethod, javaString);
            if (javaString) {
                env->DeleteLocalRef(javaString);
            }
            return (bool) user_stop_requested;
        } else {
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

    return hashMap;
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_resetNative(JNIEnv *env, jobject thiz, jlong object_ptr) {
    auto *llm = reinterpret_cast<mls::LlmSession *>(object_ptr);
    if (llm) {
        MNN_DEBUG("RESET");
        llm->Reset();
    }
}

JNIEXPORT jboolean JNICALL Java_com_mnnrn_MnnRnModule_setWavformCallbackNative(
        JNIEnv *env, jobject thiz, jlong instance_id, jobject listener) {

    if (instance_id == 0 || !listener) {
        return JNI_FALSE;
    }
    auto *session = reinterpret_cast<mls::LlmSession *>(instance_id);
    jobject global_ref = env->NewGlobalRef(listener);
    JavaVM *jvm;
    env->GetJavaVM(&jvm);
    session->SetWavformCallback(
            [jvm, global_ref](const float *data, size_t size, bool is_end) -> bool {
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
                return result == JNI_TRUE;
            });

    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL Java_com_mnnrn_MnnRnModule_getDebugInfoNative(JNIEnv *env, jobject thiz, jlong objecPtr) {
    auto *llm = reinterpret_cast<mls::LlmSession *>(objecPtr);
    if (llm == nullptr) {
        return env->NewStringUTF("");
    }
    return env->NewStringUTF(llm->getDebugInfo().c_str());
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
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    if (llm) {
        llm->SetMaxNewTokens(max_new_tokens);
    }
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_updateSystemPromptNative(JNIEnv *env, jobject thiz,
                                                                           jlong llm_ptr,
                                                                           jstring system_promp_j) {
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    const char *system_prompt_cstr = env->GetStringUTFChars(system_promp_j, nullptr);
    if (llm) {
        llm->setSystemPrompt(system_prompt_cstr);
    }
    env->ReleaseStringUTFChars(system_promp_j, system_prompt_cstr);
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_updateAssistantPromptNative(JNIEnv *env,
                                                                              jobject thiz,
                                                                              jlong llm_ptr,
                                                                              jstring assistant_prompt_j) {
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    const char *assistant_prompt_cstr = env->GetStringUTFChars(assistant_prompt_j, nullptr);
    if (llm) {
        llm->SetAssistantPrompt(assistant_prompt_cstr);
    }
    env->ReleaseStringUTFChars(assistant_prompt_j, assistant_prompt_cstr);
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_updateConfigNative(JNIEnv *env,
                                                                     jobject thiz,
                                                                     jlong llm_ptr,
                                                                     jstring config_json_j) {
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    const char *config_json_cstr = env->GetStringUTFChars(config_json_j, nullptr);
    if (llm) {
        llm->updateConfig(config_json_cstr);
    }
    env->ReleaseStringUTFChars(config_json_j, config_json_cstr);
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_updateEnableAudioOutputNative(JNIEnv *env,jobject thiz, jlong llm_ptr, jboolean enable) {
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    if (llm) {
        llm->enableAudioOutput((bool)enable);
    }
}

JNIEXPORT jstring JNICALL Java_com_mnnrn_MnnRnModule_getSystemPromptNative(JNIEnv *env, jobject thiz, jlong llm_ptr) {
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    if (llm) {
        std::string system_prompt = llm->getSystemPrompt();
        return env->NewStringUTF(system_prompt.c_str());
    }
    return nullptr;
}

JNIEXPORT void JNICALL Java_com_mnnrn_MnnRnModule_clearHistoryNative(JNIEnv *env, jobject thiz, jlong llm_ptr) {
    auto *llm = reinterpret_cast<mls::LlmSession *>(llm_ptr);
    if (llm) {
        llm->clearHistory();
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
    auto *llm_session = reinterpret_cast<mls::LlmSession *>(llmPtr);
    if (!llm_session) {
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
    
    return hashMap;
}

} // extern "C"