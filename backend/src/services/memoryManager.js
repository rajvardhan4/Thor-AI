class MemoryManager {
  constructor() {
    this.history = []; // Array of { role: 'user' | 'assistant' | 'system', content: string }
    this.pendingAction = null; // Stored state for clarifying questions (e.g., { type: 'clean-downloads' })
  }

  /**
   * Adds a message turn to the history.
   * @param {string} role - 'user' | 'assistant' | 'system'
   * @param {string} content - Message text
   */
  addMessage(role, content) {
    this.history.push({ role, content });
    // Cap memory to last 20 messages for prompt efficiency
    if (this.history.length > 20) {
      this.history.shift();
    }
  }

  /**
   * Returns conversation history as string for formatting context.
   */
  getContextString() {
    return this.history
      .map(m => `${m.role === 'user' ? 'User' : 'Thor'}: ${m.content}`)
      .join('\n');
  }

  /**
   * Returns standard OpenAI messages array.
   */
  getOpenAIMessages() {
    return [...this.history];
  }

  /**
   * Sets a pending action to clarify in subsequent turns.
   */
  setPendingAction(action) {
    this.pendingAction = action;
  }

  /**
   * Gets the active pending action.
   */
  getPendingAction() {
    return this.pendingAction;
  }

  /**
   * Clears conversational history and pending states.
   */
  clear() {
    this.history = [];
    this.pendingAction = null;
  }
}

// Export singleton instance
module.exports = new MemoryManager();
