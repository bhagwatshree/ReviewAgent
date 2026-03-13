/**
 * IDE Provider - implementations for different IDE chat interfaces
 * Each provider uses the IDE's built-in LLM (no external API calls)
 */

import type { IDEProvider } from "./types.js";

/**
 * VS Code Provider - uses VS Code Chat API
 * Works with: Claude extension, Copilot, other chat-enabled extensions
 */
export class VSCodeProvider implements IDEProvider {
  name = "vs-code";

  isAvailable(): boolean {
    // Check if we're in VS Code environment
    return typeof process !== "undefined" && process.env.VSCODE_PID !== undefined;
  }

  async sendPromptToLLM(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    // In VS Code extension context, use vscode.commands.executeCommand
    // This is a placeholder - actual implementation depends on VS Code version and extensions
    console.log(
      "VS Code Provider: Sending prompt to IDE chat interface...\n"
    );
    console.log("System:", systemPrompt.substring(0, 100) + "...\n");
    console.log("User:", userPrompt.substring(0, 200) + "...\n");

    throw new Error(
      "VS Code Provider requires VS Code extension context. Use the extension UI instead."
    );
  }
}

/**
 * Cursor IDE Provider - uses Cursor's native chat
 * Cursor has built-in LLM access without API keys
 */
export class CursorProvider implements IDEProvider {
  name = "cursor";

  isAvailable(): boolean {
    // Check for Cursor environment markers
    return (
      typeof process !== "undefined" &&
      (process.env.CURSOR_API !== undefined ||
        process.env.CURSOR_HOME !== undefined)
    );
  }

  async sendPromptToLLM(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    console.log("Cursor Provider: Use Cursor's built-in chat\n");
    console.log("System Prompt:", systemPrompt.substring(0, 150) + "...\n");
    console.log("User Prompt:", userPrompt.substring(0, 200) + "...\n");
    throw new Error(
      "Cursor Provider requires Cursor IDE context. Use Cursor's chat interface directly."
    );
  }
}

/**
 * IntelliJ / JetBrains Provider
 * Works with IntelliJ IDEA, WebStorm, PyCharm, etc.
 */
export class JetBrainsProvider implements IDEProvider {
  name = "jetbrains";

  isAvailable(): boolean {
    return (
      typeof process !== "undefined" &&
      (process.env.IDEA_PROPERTIES !== undefined ||
        process.env.JETBRAINS_IDE !== undefined)
    );
  }

  async sendPromptToLLM(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    console.log(
      "JetBrains Provider: Use JetBrains IDE AI Assistant\n"
    );
    console.log("System:", systemPrompt.substring(0, 100) + "...\n");
    console.log("User:", userPrompt.substring(0, 200) + "...\n");
    throw new Error(
      "JetBrains Provider requires JetBrains IDE plugin context."
    );
  }
}

/**
 * CLI Provider - generates formatted prompts for manual IDE entry
 * User copies/pastes the prompt into their IDE's chat
 * Works with ANY IDE that has a chat interface
 */
export class CLIProvider implements IDEProvider {
  name = "cli";
  private currentResponse?: string;

  isAvailable(): boolean {
    return true; // Always available as fallback
  }

  async sendPromptToLLM(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    // In CLI mode, we print the prompt for the user to paste into their IDE
    // In real usage, this would integrate with the IDE's chat API
    // For now, return a placeholder that indicates where the LLM response should go

    return `[LLM RESPONSE]\n(Use your IDE's chat with the provided prompts above and copy the JSON response here)\n`;
  }

  setResponse(response: string): void {
    this.currentResponse = response;
  }

  getResponse(): string | undefined {
    return this.currentResponse;
  }
}

/**
 * Auto-detect available IDE provider
 */
export function detectProvider(): IDEProvider {
  const providers: IDEProvider[] = [
    new CursorProvider(),
    new VSCodeProvider(),
    new JetBrainsProvider(),
    new CLIProvider(), // Fallback
  ];

  for (const provider of providers) {
    if (provider.isAvailable()) {
      return provider;
    }
  }

  return new CLIProvider();
}

/**
 * Get provider by name
 */
export function getProvider(name: string): IDEProvider {
  switch (name.toLowerCase()) {
    case "vscode":
      return new VSCodeProvider();
    case "cursor":
      return new CursorProvider();
    case "jetbrains":
    case "intellij":
      return new JetBrainsProvider();
    case "cli":
    default:
      return new CLIProvider();
  }
}
