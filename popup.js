// Hardcoded API key and prompt
const CLAUDE_API_KEY = ""; // Replace with your actual API key

const DEFAULT_PROMPT = "awnser only";

document.getElementById("capture").addEventListener("click", async () => {
  const responseDiv = document.getElementById("response");

  try {
    responseDiv.innerHTML = '<div class="loading">Taking screenshot...</div>';

    // Capture screenshot
    const dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(dataUrl);
        }
      });
    });

    responseDiv.innerHTML = '<div class="loading">Sending to Claude AI...</div>';

    // Convert data URL to base64 (remove data:image/png;base64, prefix)
    const base64Image = dataUrl.split(',')[1];

    // Send to Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: DEFAULT_PROMPT
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    // Better error handling for API response
    if (!data.content || !data.content[0] || !data.content[0].text) {
      console.error('Unexpected API response:', data);
      throw new Error('Invalid response format from Claude API');
    }
    
    const claudeResponse = data.content[0].text;

    responseDiv.innerHTML = `<strong>Analysis:</strong><br><br>${claudeResponse.replace(/\n/g, '<br>')}`;

  } catch (error) {
    console.error('Error:', error);
    console.error('Full error details:', error);
    responseDiv.innerHTML = `<div style="color: red;">
      <strong>Error:</strong> ${error.message}<br><br>
      <small>Check browser console for more details.</small>
    </div>`;
  }
});