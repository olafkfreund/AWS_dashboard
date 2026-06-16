const fs = require('fs');
const path = require('path');

function compile(sourceDir, targetFile) {
    const layout = fs.readFileSync(path.join(sourceDir, '_layouts/default.html'), 'utf8');
    const contentRaw = fs.readFileSync(path.join(sourceDir, 'index.html'), 'utf8');
    
    // Strip Jekyll Frontmatter
    const content = contentRaw.replace(/^---\n[\s\S]*?\n---\n/, '');
    
    let combined = layout.replace('{{ content }}', content);
    
    // Inject Navigation Tabs right after <body>
    // Inject Navigation Tabs right after <body>
    const navHtml = `
    <!-- Central Navigation Tabs -->
    <div style="display: flex; justify-content: center; padding-top: 16px; padding-bottom: 16px; background-color: var(--bg-medium); z-index: 1000; position: relative; width: 100%;">
        <div style="display: flex; padding: 4px; border-radius: 12px; background: rgba(30, 41, 59, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); gap: 4px;">
            <a href="/" style="padding: 8px 24px; border-radius: 8px; color: #94a3b8; text-decoration: none; font-weight: 500; font-family: 'Inter', sans-serif;">AWS Overview</a>
            <a href="/gitlab/index.html" style="padding: 8px 24px; border-radius: 8px; ${targetFile.includes('gitlab') ? 'background: #1e293b; color: white;' : 'color: #94a3b8;'} text-decoration: none; font-weight: 500; font-family: 'Inter', sans-serif;">GitLab</a>
            <a href="/github/index.html" style="padding: 8px 24px; border-radius: 8px; ${targetFile.includes('github') ? 'background: #1e293b; color: white;' : 'color: #94a3b8;'} text-decoration: none; font-weight: 500; font-family: 'Inter', sans-serif;">GitHub</a>
            <a href="/?view=settings" style="padding: 8px 24px; border-radius: 8px; color: #94a3b8; text-decoration: none; font-weight: 500; font-family: 'Inter', sans-serif;">Settings</a>
        </div>
    </div>
    `;
    
    combined = combined.replace('<body>', '<body>\n' + navHtml);
    
    // Replace liquid tags with relative paths
    combined = combined.replace(/\{\{\s*site\.time[^}]*\}\}/g, Date.now());
    combined = combined.replace(/\{\{\s*page\.title[^\}]*\}\}/g, 'Dashboard');
    combined = combined.replace(/\{\{\s*page\.description[^\}]*\}\}/g, 'Dashboard');
    combined = combined.replace(/\{\{\s*site\.github_username\s*\}\}/g, 'olafkfreund');
    
    combined = combined.replace(/\{\{\s*'\/assets\/([^']+)'\s*\|\s*relative_url\s*\}\}/g, './assets/$1');
    
    // Remove Dev Blog link
    combined = combined.replace(/<li class="nav-item">\s*<a href="\{\{\s*'\/blog\/'\s*\|\s*relative_url\s*\}\}">[\s\S]*?<\/a>\s*<\/li>/g, '');
    
    // Inject extra Assistant options
    const newOptions = `
      <option value="ollama">Ollama (Local LLM)</option>
      <option value="github-copilot">GitHub Copilot</option>
      <option value="gitlab-duo">GitLab Duo</option>
      <option value="aws-q">AWS Q (Cloud)</option>
    `;
    combined = combined.replace(/<option value="ollama">Ollama \(Local LLM\)<\/option>/g, newOptions);
    
    // Completely remove the logo and title from Huginn/Muninn
    combined = combined.replace(/<div class="logo">[\s\S]*?<\/div>/g, '');
    
    // Add cache busting to the script tags so the browser never uses old app.js
    combined = combined.replace(/src="assets\/js\/app\.js"/g, `src="assets/js/app.js?v=${Date.now()}"`);
    
    // Inject Assistant Voice UI
    const micHtml = `
      <button id="copilot-mic-btn" style="position: absolute; right: 45px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; padding: 5px; z-index: 10;">
          <i class="fa-solid fa-microphone"></i>
      </button>
    `;
    combined = combined.replace('class="copilot-chat-input-area">', 'class="copilot-chat-input-area" style="position: relative;">\n' + micHtml);
    combined = combined.replace('id="copilot-chat-input"', 'id="copilot-chat-input" style="padding-right: 60px;"');

    const voiceToggleHtml = `
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 4px 12px; background: var(--bg-soft); border-bottom: 1px solid var(--border-color);">
          <label for="enable-voice-feedback" style="font-size: 11px; cursor: pointer;">Spoken Feedback</label>
          <input type="checkbox" id="enable-voice-feedback" style="cursor: pointer;">
      </div>
    `;
    combined = combined.replace('id="copilot-chat-body"', 'id="copilot-chat-body"').replace('<div class="copilot-chat-body"', voiceToggleHtml + '\n<div class="copilot-chat-body"');
    
    combined = combined.replace(/<option value="github-copilot">GitHub Copilot<\/option>/g, '<option value="github-copilot" selected>GitHub Copilot</option>');
    
    // Inject Voice JS logic at the end of the body
    const voiceJs = `
    <script>
      window.addEventListener('load', () => {
        const micBtn = document.getElementById('copilot-mic-btn');
        const voiceFeedbackCheck = document.getElementById('enable-voice-feedback');
        const chatInput = document.getElementById('copilot-chat-input');
        const sendBtn = document.getElementById('copilot-send-btn');
        
        if(micBtn && chatInput && sendBtn) {
            let recognition = null;
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                
                recognition.onstart = function() { micBtn.style.color = '#ef4444'; };
                recognition.onresult = function(event) {
                    chatInput.value = event.results[0][0].transcript;
                    sendBtn.click();
                };
                recognition.onerror = function() { micBtn.style.color = '#94a3b8'; };
                recognition.onend = function() { micBtn.style.color = '#94a3b8'; };
            }
            
            micBtn.addEventListener('click', () => {
                if (recognition) recognition.start();
                else alert('Speech recognition not supported in this browser.');
            });
        }
        
        // Intercept DOM node insertions in the chat body to read bot messages aloud
        const chatBody = document.getElementById('copilot-chat-body');
        if (chatBody && voiceFeedbackCheck) {
            const observer = new MutationObserver((mutations) => {
                if (!voiceFeedbackCheck.checked) return;
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.classList.contains('msg-bot')) {
                            // Don't read the typing indicator
                            if (node.innerText === 'Thinking...' || node.classList.contains('italic')) return;
                            if ('speechSynthesis' in window) {
                                window.speechSynthesis.cancel();
                                const utterance = new SpeechSynthesisUtterance(node.innerText);
                                window.speechSynthesis.speak(utterance);
                            }
                        }
                    });
                });
            });
            observer.observe(chatBody, { childList: true });
        }
      });
    </script>
    `;
    combined = combined.replace('</body>', voiceJs + '\n</body>');
    
    fs.writeFileSync(targetFile, combined);
    console.log(`Compiled ${targetFile}`);
}

compile('/tmp/Huginn', '/home/olafkfreund/Source/Calitii/Synechron-ARC/AWS-dashboard/public/gitlab/index.html');
compile('/tmp/Muninn', '/home/olafkfreund/Source/Calitii/Synechron-ARC/AWS-dashboard/public/github/index.html');
