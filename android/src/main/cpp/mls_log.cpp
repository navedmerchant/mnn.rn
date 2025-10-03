#include "mls_log.h"
#include <android/log.h>

void mls_log_debug(const char* format, ...) {
    va_list args;
    va_start(args, format);
    __android_log_vprint(ANDROID_LOG_DEBUG, "MNN_RN_DEBUG", format, args);
    va_end(args);
}

void mls_log_error(const char* format, ...) {
    va_list args;
    va_start(args, format);
    __android_log_vprint(ANDROID_LOG_ERROR, "MNN_RN_ERROR", format, args);
    va_end(args);
}

void mls_log_info(const char* format, ...) {
    va_list args;
    va_start(args, format);
    __android_log_vprint(ANDROID_LOG_INFO, "MNN_RN_INFO", format, args);
    va_end(args);
}

void mls_log_warn(const char* format, ...) {
    va_list args;
    va_start(args, format);
    __android_log_vprint(ANDROID_LOG_WARN, "MNN_RN_WARN", format, args);
    va_end(args);
}