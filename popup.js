document.getElementById("capture").addEventListener("click", () => {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      // Open in new tab
      const newTab = window.open();
      newTab.document.write(`<img src="${dataUrl}">`);
  
      // Or trigger a download:
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "screenshot.png";
      link.click();
    });
  });