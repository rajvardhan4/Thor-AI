const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const memoryManager = require('./memoryManager');
const contextManager = require('./contextManager');
const promptManager = require('./promptManager');

class OpenAIService {
  constructor() {
    this.openaiClient = null;
  }

  /**
   * Initializes the OpenAI client dynamically.
   */
  init(apiKey) {
    const key = apiKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
    if (key && key.startsWith('sk-')) {
      this.openaiClient = new OpenAI({ apiKey: key });
    } else {
      this.openaiClient = null;
    }
  }

  /**
   * Processes a message turn through OpenAI GPT (or falls back to Gemini).
   */
  async processMessage(text, apiKey) {
    const startTime = Date.now();
    this.init(apiKey);

    // Add user turn to history
    memoryManager.addMessage('user', text);

    // Build message prompts
    const messages = promptManager.buildMessages(memoryManager, contextManager);

    if (this.openaiClient) {
      try {
        const modelName = process.env.LLM_MODEL || 'gpt-4o-mini';
        console.log(`Sending prompt to OpenAI model: ${modelName}...`);
        
        const completion = await this.openaiClient.chat.completions.create({
          model: modelName,
          messages: messages,
          temperature: 0.7,
        });

        const processingTimeMs = Date.now() - startTime;
        const responseText = completion.choices[0].message.content.trim();
        const totalTokens = completion.usage ? completion.usage.total_tokens : 0;

        let parsedResponse;
        try {
          const cleanJson = responseText.replace(/^```json/, '').replace(/```$/, '').trim();
          parsedResponse = JSON.parse(cleanJson);
        } catch (e) {
          parsedResponse = {
            mode: 'conversation',
            speechReply: responseText,
            feedback: 'Conversational response generated.',
            plan: [],
            finalSpeechReply: ''
          };
        }

        // Add assistant turn to history
        memoryManager.addMessage('assistant', parsedResponse.speechReply);

        // Update pending state if clarification
        if (parsedResponse.mode === 'clarification') {
          memoryManager.setPendingAction({ type: 'clean-downloads' }); // downloads clean clarification simulation
        } else {
          memoryManager.setPendingAction(null);
        }

        return {
          success: true,
          data: parsedResponse,
          tokensUsed: totalTokens,
          processingTimeMs
        };
      } catch (error) {
        console.error("OpenAI failed, falling back to Gemini:", error.message);
        return this.processMessageWithGeminiFallback(text, startTime);
      }
    } else {
      console.warn("OpenAI key not configured, using Gemini fallback...");
      return this.processMessageWithGeminiFallback(text, startTime);
    }
  }

  /**
   * Fallback generation using Google Gemini.
   */
  async processMessageWithGeminiFallback(text, startTime) {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
    if (!geminiKey) {
      // If neither is configured, fallback to rule-based parser
      console.error("No API keys found. Resorting to rule-based fallback.");
      const ruleResponse = require('../server').parseFallbackDirectly(text);
      const processingTimeMs = Date.now() - startTime;
      return {
        success: true,
        data: ruleResponse,
        tokensUsed: 0,
        processingTimeMs
      };
    }

    try {
      const ai = new GoogleGenerativeAI({ apiKey: geminiKey });
      const modelName = 'gemini-1.5-flash';
      const model = ai.getGenerativeModel({ model: modelName });

      // Compile current prompt context for Gemini
      const messages = promptManager.buildMessages(memoryManager, contextManager);
      const systemMsg = messages.find(m => m.role === 'system')?.content || '';
      const promptText = `${systemMsg}\n\nUser command: "${text}"`;

      console.log(`Sending fallback prompt to Gemini model: ${modelName}...`);
      const result = await model.generateContent(promptText);
      const responseText = result.response.text().trim();
      const processingTimeMs = Date.now() - startTime;

      let parsedResponse;
      try {
        const cleanJson = responseText.replace(/^```json/, '').replace(/```$/, '').trim();
        parsedResponse = JSON.parse(cleanJson);
      } catch (e) {
        parsedResponse = {
          mode: 'conversation',
          speechReply: responseText,
          feedback: 'Conversational response generated via Gemini Fallback.',
          plan: [],
          finalSpeechReply: ''
        };
      }

      memoryManager.addMessage('assistant', parsedResponse.speechReply);

      if (parsedResponse.mode === 'clarification') {
        memoryManager.setPendingAction({ type: 'clean-downloads' });
      } else {
        memoryManager.setPendingAction(null);
      }

      return {
        success: true,
        data: parsedResponse,
        tokensUsed: 0, // Gemini doesn't report standard token usage in basic API responses
        processingTimeMs
      };
    } catch (err) {
      console.error("Gemini fallback failed:", err.message);
      // Fallback to rules
      const ruleResponse = require('../server').parseFallbackDirectly(text);
      const processingTimeMs = Date.now() - startTime;
      return {
        success: true,
        data: ruleResponse,
        tokensUsed: 0,
        processingTimeMs
      };
    }
  }
}

module.exports = new OpenAIService();
