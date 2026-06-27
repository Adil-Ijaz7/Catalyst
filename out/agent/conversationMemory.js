"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationMemory = void 0;
class ConversationMemory {
    messages = [];
    add(message) {
        this.messages.push(message);
    }
    getAll() {
        return [...this.messages];
    }
    clear() {
        this.messages.length = 0;
    }
}
exports.ConversationMemory = ConversationMemory;
//# sourceMappingURL=conversationMemory.js.map