cmake_minimum_required(VERSION 3.22.1)
project(mnn-rn)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_VERBOSE_MAKEFILE ON)

# Include directories
include_directories(
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/MNN
  ${CMAKE_CURRENT_SOURCE_DIR}/llm
  ${CMAKE_CURRENT_SOURCE_DIR}/nlohmann
)

# Add prebuilt MNN library (shared, will be linked)
add_library(MNN SHARED IMPORTED)
set_target_properties(MNN PROPERTIES
  IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/../../../prebuilt/libs/arm64-v8a/libMNN.so
)

# Source files (they are in android/src/main/, not in cpp/)
add_library(
  mnn-rn
  SHARED
  ${CMAKE_CURRENT_SOURCE_DIR}/mnn_llm_jni.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/llm_session.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/utf8_stream_processor.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/mls_log.cpp
)

# Link libraries
target_link_libraries(
  mnn-rn
  MNN
  android
  log
)

# Compiler flags for ARM64
target_compile_options(mnn-rn PRIVATE -march=armv8-a -O2)