#include "utf8_stream_processor.hpp"

namespace mls {

Utf8StreamProcessor::Utf8StreamProcessor(OnUtf8CharCallback callback)
    : callback_(std::move(callback)) {
}

void Utf8StreamProcessor::processStream(const char* data, size_t len) {
    if (!data || len == 0) {
        return;
    }
    
    // Append new data to buffer
    buffer_.append(data, len);
    
    // Process complete UTF-8 characters
    processCompleteCharacters();
}

bool Utf8StreamProcessor::isValidUtf8Start(unsigned char byte) {
    // ASCII (0xxxxxxx) or UTF-8 start bytes
    return (byte & 0x80) == 0x00 ||  // ASCII
           (byte & 0xE0) == 0xC0 ||  // 110xxxxx (2-byte)
           (byte & 0xF0) == 0xE0 ||  // 1110xxxx (3-byte)
           (byte & 0xF8) == 0xF0;    // 11110xxx (4-byte)
}

int Utf8StreamProcessor::getUtf8CharLength(unsigned char byte) {
    if ((byte & 0x80) == 0x00) return 1;  // ASCII
    if ((byte & 0xE0) == 0xC0) return 2;  // 2-byte
    if ((byte & 0xF0) == 0xE0) return 3;  // 3-byte
    if ((byte & 0xF8) == 0xF0) return 4;  // 4-byte
    return -1; // Invalid
}

bool Utf8StreamProcessor::isUtf8Continuation(unsigned char byte) {
    return (byte & 0xC0) == 0x80; // 10xxxxxx
}

void Utf8StreamProcessor::processCompleteCharacters() {
    size_t pos = 0;
    
    while (pos < buffer_.size()) {
        unsigned char firstByte = static_cast<unsigned char>(buffer_[pos]);
        
        if (!isValidUtf8Start(firstByte)) {
            // Skip invalid byte
            pos++;
            continue;
        }
        
        int charLen = getUtf8CharLength(firstByte);
        if (charLen == -1) {
            // Invalid UTF-8 start byte
            pos++;
            continue;
        }
        
        // Check if we have enough bytes for complete character
        if (pos + charLen > buffer_.size()) {
            // Incomplete character, wait for more data
            break;
        }
        
        // Validate continuation bytes
        bool validChar = true;
        for (int i = 1; i < charLen; i++) {
            if (pos + i >= buffer_.size() || 
                !isUtf8Continuation(static_cast<unsigned char>(buffer_[pos + i]))) {
                validChar = false;
                break;
            }
        }
        
        if (validChar) {
            // Extract complete UTF-8 character
            std::string utf8Char = buffer_.substr(pos, charLen);
            
            // Call callback with the character
            if (callback_) {
                callback_(utf8Char);
            }
            
            pos += charLen;
        } else {
            // Skip invalid sequence
            pos++;
        }
    }
    
    // Remove processed characters from buffer
    if (pos > 0) {
        buffer_.erase(0, pos);
    }
}

} // namespace mls