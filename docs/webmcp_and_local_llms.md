# WebMCP and Local LLM Integration

This guide provides technical specifications, browser configuration steps, and architecture details for using the Web Model Context Protocol (WebMCP) and local LLM clients (such as Chrome or Edge built-in AI, or a local Ollama instance) within the AWS Status Dashboard.

## 1. WebMCP Protocol Architecture

The Web Model Context Protocol (WebMCP) is a proposed web standard designed to allow websites to securely expose their internal functionalities and data assets as structured, schema-defined tools for AI agents.

Unlike traditional Model Context Protocol (MCP) integrations which run on a server, WebMCP runs client-side in the browser.

### Communication Flow

WebMCP enables a one-way communication surface: Agent to Webpage.

* Browser Agent to Webpage: AI browser assistants (such as the Gemini Chrome Extension or Claude/Copilot sidecar extensions with WebMCP support) scan the webpage context. The webpage registers its tools with navigator.modelContext (or document.modelContext). The agent can discover and invoke these tools to gather live data.
* Webpage to LLM: The webpage's built-in assistant chat interface cannot use WebMCP to query the browser extension's LLM directly. Instead, to provide completion services for the page's chat window, the page queries either browser-native AI APIs (like window.ai) or a local Ollama server.

## 2. Browser-Native AI (window.ai) Requirements

Modern browsers include native, on-device large language models (such as Gemini Nano or Phi-mini) that webpages can call directly via client-side JavaScript APIs.

### Chrome Configuration (Google Chrome 128+)

To enable native Gemini Nano access through window.ai in Google Chrome:

1. Open a new Chrome tab and navigate to:
   chrome://flags/#optimization-guide-on-device-model
   Set this flag to: Enabled BypassPrefRequirement
2. Navigate to:
   chrome://flags/#prompt-api-for-gemini-nano
   Set this flag to: Enabled
3. Relaunch Chrome to apply the changes.
4. Navigate to:
   chrome://components
   Locate the "Optimization Guide On Device Model" component and click "Check for update" to ensure the Gemini Nano weights are fully downloaded.
5. Verification: Open the developer console (F12) and check that window.ai is defined. You can test capabilities by running:
   await window.ai.languageModel.capabilities()

### Microsoft Edge Configuration (Edge Dev/Canary 138+)

To enable native on-device model support in Microsoft Edge:

1. Download and install Microsoft Edge Canary or Edge Dev.
2. Navigate to:
   edge://flags/
3. Search for:
   Prompt API for on-device language model
   Set this flag to: Enabled
4. Optional: If you wish to enable debug logging, search for and enable:
   Enable on device AI model debug logs
5. Relaunch Edge. The browser will download the required on-device model (such as Phi-mini or Aion-Instruct) the first time the API is called.

## 3. Local Ollama LLM Client

For environments where browser-native AI is not enabled or supported, the dashboard falls back to a local Ollama server.

### Setup and Requirements

1. Ensure Ollama is running on your host machine (default endpoint: http://localhost:11434).
2. Pull the required models depending on the assistant provider selected:
   * Gemini: Run "ollama pull gemma2" (or "ollama pull gemma")
   * Claude: Run "ollama pull llama3" (or another general-purpose model)
   * Ollama (Default): Run "ollama pull llama3" (or your preferred general-purpose model)

### Dynamic Model Selector

The dashboard implements an intelligent model matching algorithm to automatically detect installed models on your local Ollama instance:

* If Gemini is selected, the page queries Ollama's tags list for any model matching "gemma" or "gemini" (such as gemma4:12b or gemma4:e4b).
* If Claude is selected, the page queries Ollama's tags list for any model matching "llama" or "claude".
* If no direct brand model is found, the selector will fall back to other high-quality general-purpose models (such as qwen, llama, gemma, mistral, or phi) or the first available non-embedding model on your host. This prevents 404 Model Not Found errors.
