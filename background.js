const CLAUDE_API_KEY = ""; // Replace with your actual API key// Replace with your actual API key
const DEFAULT_PROMPT = "This is a computer networking question. Analyze the screenshot and provide the correct answer(s). If it's multiple choice, state the correct option (A, B, C, D, etc.). If it's a calculation, show the final answer clearly. If it's checkboxes, list which options should be selected. Be direct and concise - just give me the answer I need.";
const CLAUDE_MODEL = "claude-opus-4-1-20250805";

let isProcessing = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeScreenshot") {
    handleScreenshotAnalysis(request.screenshot, request.tabUrl);
    sendResponse({ success: true });
  } else if (request.action === "getProcessingStatus") {
    sendResponse({ isProcessing });
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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: DEFAULT_PROMPT },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Image
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    const data = await response.json();
    const claudeResponse = data.content?.[0]?.text || "No response";
    
    // Store the response in history
    await storeResponse(claudeResponse, dataUrl, tabUrl);

    // Set badge to show completion
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });

  } catch (err) {
    console.error("Error:", err);
    // Store error in history too
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