const OPENAI_API_KEY = ""; // Replace with your actual OpenAI API key
const DEFAULT_PROMPT = "This is a computer networking question. Analyze the screenshot and provide the correct answer(s). If it's multiple choice, state the correct option (A, B, C, D, etc.). If it's a calculation, show the final answer clearly. If it's checkboxes, list which options should be selected. Be direct and concise - just give me the answer I need.";
const OPENAI_MODEL = "gpt-4o"; // or "gpt-4-turbo" or "gpt-4o-mini" for cheaper option

let isProcessing = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeScreenshot") {
    handleScreenshotAnalysis(request.screenshot, request.tabUrl);
    sendResponse({ success: true });
  } else if (request.action === "getProcessingStatus") {
    sendResponse({ isProcessing });
  } else if (request.action === "resetChat") {
    resetChatHistory();
    sendResponse({ success: true });
  }
  return true;
});

async function handleScreenshotAnalysis(dataUrl, tabUrl) {
  try {
    isProcessing = true;

    // Handle both JPEG and PNG formats
    let base64Image, mediaType;
    if (dataUrl.startsWith('data:image/jpeg')) {
      base64Image = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
      mediaType = "image/jpeg";
    } else {
      base64Image = dataUrl.replace(/^data:image\/png;base64,/, "");
      mediaType = "image/png";
    }

    // Get existing chat history
    const { chatHistory = [] } = await chrome.storage.local.get(['chatHistory']);
    
    // If this is the first message, add system prompt
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "system",
        content: DEFAULT_PROMPT
      });
    }

    // Add the new user message with image
    const newUserMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: "Please analyze this screenshot and provide the answer."
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mediaType};base64,${base64Image}`
          }
        }
      ]
    };

    chatHistory.push(newUserMessage);

    // Make API call to OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: chatHistory,
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    const openaiResponse = data.choices?.[0]?.message?.content || "No response";
    
    // Add assistant response to chat history
    chatHistory.push({
      role: "assistant",
      content: openaiResponse
    });

    // Save updated chat history (limit to last 20 messages to avoid token limits)
    // Keep system message + last 19 messages
    const trimmedHistory = chatHistory.length > 20 
      ? [chatHistory[0], ...chatHistory.slice(-19)] 
      : chatHistory;
    
    await chrome.storage.local.set({ chatHistory: trimmedHistory });

    // Store the response in display history (separate from chat history)
    await storeResponse(openaiResponse, dataUrl, tabUrl);

    // Set badge to show completion
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });

  } catch (err) {
    console.error("Error:", err);
    // Store error in history
    await storeResponse(`Error: ${err.message}`, dataUrl, tabUrl);
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
  } finally {
    isProcessing = false;
  }
}

async function storeResponse(response, screenshot, url) {
  const timestamp = Date.now();
  const responseData = { 
    id: timestamp.toString(), 
    response, 
    screenshot, 
    timestamp, 
    url: url || "Unknown URL" 
  };

  const result = await chrome.storage.local.get(["responses"]);
  const responses = result.responses || [];
  responses.unshift(responseData);
  await chrome.storage.local.set({ responses: responses.slice(0, 50) });
}

async function resetChatHistory() {
  // Clear the chat conversation history
  await chrome.storage.local.set({ chatHistory: [] });
  console.log("Chat history reset");
}