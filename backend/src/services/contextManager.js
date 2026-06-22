class ContextManager {
  /**
   * Compiles the conversational and environmental context into structured properties.
   * @param {Object} memoryManager - The memory manager instance
   * @returns {Object} Context metadata
   */
  getContext(memoryManager) {
    const pendingAction = memoryManager.getPendingAction();
    const systemTime = new Date().toISOString();
    
    return {
      user: "Rajvardhan",
      time: systemTime,
      pendingAction: pendingAction ? JSON.stringify(pendingAction) : "None"
    };
  }

  /**
   * Compiles context details into a markdown context block for prompts.
   */
  getContextInstruction(memoryManager) {
    const ctx = this.getContext(memoryManager);
    return `
User Profile:
- Name: ${ctx.user}
- Role: Software Developer

Current Active Constraints:
- Current Time: ${ctx.time}
- Active Pending State (waiting for clarification): ${ctx.pendingAction}
`;
  }
}

module.exports = new ContextManager();
