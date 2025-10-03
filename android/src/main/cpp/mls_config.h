#pragma once

// Configuration constants for MLS (MNN LLM Session)

namespace mls {

// Default configuration values
constexpr int DEFAULT_MAX_NEW_TOKENS = 2048;
constexpr const char* DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

// R1 model constants  
constexpr const char* R1_USER_START = "<|User|>";
constexpr const char* R1_ASSISTANT_START = "<|Assistant|>";
constexpr const char* R1_THINK_START = "<think>\n";
constexpr const char* R1_THINK_END = "</think>";
constexpr const char* R1_SENTENCE_START = "<|begin_of_sentence|>";
constexpr const char* R1_SENTENCE_END = "<|end_of_sentence|>";

// Stream processing constants
constexpr const char* END_OF_PROMPT = "<eop>";

} // namespace mls