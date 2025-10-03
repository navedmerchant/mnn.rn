#pragma once

#include <string>
#include <functional>

namespace mls {

/**
 * UTF8 stream processor for handling streaming text generation
 */
class Utf8StreamProcessor {
public:
    using OnUtf8CharCallback = std::function<void(const std::string& utf8Char)>;
    
    explicit Utf8StreamProcessor(OnUtf8CharCallback callback);
    
    /**
     * Process a stream of bytes and extract UTF-8 characters
     * @param data Raw byte data
     * @param len Length of data
     */
    void processStream(const char* data, size_t len);
    
private:
    OnUtf8CharCallback callback_;
    std::string buffer_;
    
    bool isValidUtf8Start(unsigned char byte);
    int getUtf8CharLength(unsigned char byte);
    bool isUtf8Continuation(unsigned char byte);
    void processCompleteCharacters();
};

} // namespace mls