#pragma once

#include <cstdarg>

// Debug logging macros
#define MNN_DEBUG(...) mls_log_debug(__VA_ARGS__)
#define MNN_ERROR(...) mls_log_error(__VA_ARGS__)
#define MNN_INFO(...) mls_log_info(__VA_ARGS__)
#define MNN_WARN(...) mls_log_warn(__VA_ARGS__)

// Function declarations
void mls_log_debug(const char* format, ...);
void mls_log_error(const char* format, ...);
void mls_log_info(const char* format, ...);
void mls_log_warn(const char* format, ...);