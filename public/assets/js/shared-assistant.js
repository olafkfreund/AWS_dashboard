/**
 * Shared Multi-Environment Assistant Widget
 * Implements a unified chat assistant for AWS, GitHub, and GitLab dashboard pages.
 */

(function () {
    // --- 1. CSS STYLES INJECTION ---
    const assistantStyles = `
        /* Floating Assistant Button */
        .copilot-badge-btn {
            position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px;
            border-radius: 50%; background: #FF9900; color: #000; border: none;
            box-shadow: 0 4px 15px rgba(255, 153, 0, 0.4); font-size: 24px; cursor: pointer;
            z-index: 9999; display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .copilot-badge-btn:hover { transform: scale(1.1); box-shadow: 0 6px 20px rgba(255, 153, 0, 0.6); }

        /* Assistant Chat Popup */
        .copilot-chat-popup {
            position: fixed; bottom: 90px; right: 24px; width: 350px; height: 500px;
            background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 9998; display: none;
            flex-direction: column; overflow: hidden; font-family: 'Outfit', 'Inter', sans-serif;
            color: white;
        }
        .copilot-chat-header {
            background: rgba(15, 23, 42, 0.9); padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
            display: flex; justify-content: space-between; align-items: center; color: white; font-weight: 600;
        }
        .copilot-chat-header .title-area {
            display: flex; align-items: center; gap: 8px; font-size: 15px;
        }
        .copilot-chat-header .close-btn {
            background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; transition: color 0.2s; padding: 4px;
        }
        .copilot-chat-header .close-btn:hover { color: #f1f5f9; }

        .copilot-chat-settings-bar {
            padding: 8px 12px; background: #0f172a; border-bottom: 1px solid rgba(255,255,255,0.1);
            display: flex; flex-direction: column; gap: 8px; font-size: 12px;
        }
        .copilot-chat-settings-row {
            display: flex; align-items: center; justify-content: space-between;
        }
        .copilot-chat-settings-label {
            color: #94a3b8; font-weight: 700;
        }
        .copilot-chat-provider-select {
            background: #1e293b; color: white; border: 1px solid #475569; padding: 2px 4px; border-radius: 4px; outline: none; font-size: 12px;
        }
        .copilot-chat-voice-row {
            display: flex; align-items: center; justify-content: flex-end; gap: 6px;
        }
        .copilot-chat-voice-label {
            color: #94a3b8; cursor: pointer; user-select: none;
        }
        .copilot-chat-voice-checkbox {
            cursor: pointer; accent-color: #3b82f6;
        }

        .copilot-chat-body {
            flex-grow: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
            background: rgba(30, 41, 59, 0.5);
        }
        .copilot-chat-input-area {
            padding: 12px; background: #0f172a; border-top: 1px solid rgba(255,255,255,0.05);
            display: flex; gap: 8px; align-items: center;
        }
        .copilot-chat-input-container {
            position: relative; flex-grow: 1; display: flex;
        }
        .copilot-chat-input {
            width: 100%; background: #1e293b; border: 1px solid rgba(255,255,255,0.1);
            color: white; border-radius: 6px; padding: 8px 40px 8px 12px; outline: none; font-size: 14px;
        }
        .copilot-chat-mic-btn {
            position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
            background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px;
            padding: 5px; outline: none; z-index: 10; display: flex; align-items: center; justify-content: center;
        }
        .copilot-chat-send {
            background: #FF9900; color: black; border: none; border-radius: 6px; height: 38px; width: 38px;
            display: flex; align-items: center; justify-content: center; cursor: pointer; font-weight: bold;
            transition: background-color 0.2s; outline: none; font-size: 14px;
        }
        .copilot-chat-send:hover {
            background: #e68a00;
        }
        .msg-bot {
            background: #334155; padding: 10px 14px; border-radius: 8px 8px 8px 0; max-width: 85%;
            align-self: flex-start; color: #e2e8f0; font-size: 13px; text-align: left; line-height: 1.4;
        }
        .msg-user {
            background: #FF9900; color: black; padding: 10px 14px; border-radius: 8px 8px 0 8px; max-width: 85%;
            align-self: flex-end; font-size: 13px; font-weight: 500; text-align: left; line-height: 1.4;
        }
        .msg-bot pre {
            background: #0f172a; padding: 8px; border-radius: 4px; font-size: 11px; font-family: monospace;
            margin: 8px 0; overflow-x: auto; text-align: left; color: #38bdf8;
        }
        .msg-bot code {
            background: #0f172a; padding: 2px 4px; border-radius: 4px; font-size: 11px; font-family: monospace;
            color: #f472b6;
        }
        .msg-bot strong {
            font-weight: bold; color: white;
        }
    `;

    // --- 2. TELEMETRY STATE & RECOVERY SYSTEM ---
    const assistantTelemetry = {
        aws: { resources: [], logins: [], spending: null },
        github: { repos: [], prs: [], issues: [] },
        gitlab: { repos: [], mrs: [], issues: [] },
        k8s: { context: 'k3d-review-cluster', nodes: [], deployments: [], pods: [] }
    };

    // Load initial cached telemetry from localStorage to have it instantly
    function loadCachedTelemetry() {
        try {
            assistantTelemetry.aws.resources = JSON.parse(localStorage.getItem('aws_active_resources') || '[]');
            assistantTelemetry.aws.logins = JSON.parse(localStorage.getItem('aws_active_logins') || '[]');
            assistantTelemetry.aws.spending = JSON.parse(localStorage.getItem('aws_active_spending') || 'null');
            
            assistantTelemetry.github.repos = JSON.parse(localStorage.getItem('gh_active_repos') || '[]');
            assistantTelemetry.github.prs = JSON.parse(localStorage.getItem('gh_active_prs') || '[]');
            assistantTelemetry.github.issues = JSON.parse(localStorage.getItem('gh_active_issues') || '[]');
            
            assistantTelemetry.gitlab.repos = JSON.parse(localStorage.getItem('gl_active_repos') || '[]');
            assistantTelemetry.gitlab.mrs = JSON.parse(localStorage.getItem('gl_active_mrs') || '[]');
            assistantTelemetry.gitlab.issues = JSON.parse(localStorage.getItem('gl_active_issues') || '[]');

            assistantTelemetry.k8s.nodes = JSON.parse(localStorage.getItem('k8s_nodes') || '[]');
            assistantTelemetry.k8s.deployments = JSON.parse(localStorage.getItem('k8s_deployments') || '[]');
            assistantTelemetry.k8s.pods = JSON.parse(localStorage.getItem('k8s_pods') || '[]');
        } catch (e) {
            console.error("Error loading cached telemetry:", e);
        }
    }

    // Refresh telemetry in background
    async function updateTelemetryFromAPIs() {
        // 1. AWS API
        try {
            const [resRes, loginsRes, spendingRes] = await Promise.all([
                fetch('/api/resources').then(r => r.json()).catch(() => null),
                fetch('/api/logins').then(r => r.json()).catch(() => null),
                fetch('/api/spending').then(r => r.json()).catch(() => null)
            ]);
            if (resRes && resRes.instances) {
                assistantTelemetry.aws.resources = resRes.instances;
                localStorage.setItem('aws_active_resources', JSON.stringify(resRes.instances));
            }
            if (loginsRes && loginsRes.logins) {
                assistantTelemetry.aws.logins = loginsRes.logins;
                localStorage.setItem('aws_active_logins', JSON.stringify(loginsRes.logins));
            }
            if (spendingRes && spendingRes.success) {
                assistantTelemetry.aws.spending = spendingRes;
                localStorage.setItem('aws_active_spending', JSON.stringify(spendingRes));
            }
        } catch (e) {
            console.warn("Error background-fetching AWS telemetry:", e);
        }

        // Load tokens
        let ghToken = localStorage.getItem('gh_pat');
        let glToken = localStorage.getItem('gl_pat');
        let glUrl = localStorage.getItem('gl_instance_url') || 'https://gitlab.com';
        
        try {
            const tokensRes = await fetch('/api/config/tokens');
            const tokens = await tokensRes.json();
            if (tokens.github) {
                ghToken = tokens.github;
                localStorage.setItem('gh_pat', ghToken);
            }
            if (tokens.gitlab) {
                glToken = tokens.gitlab;
                localStorage.setItem('gl_pat', glToken);
            }
            if (tokens.instance_url) {
                glUrl = tokens.instance_url;
                localStorage.setItem('gl_instance_url', glUrl);
            }
        } catch (e) {
            console.warn("Failed to fetch tokens from API:", e);
        }

        // 2. GitHub API (if token exists)
        if (ghToken) {
            try {
                const headers = { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' };
                const user = await fetch('https://api.github.com/user', { headers }).then(r => r.json()).catch(() => null);
                if (user && user.login) {
                    const username = user.login;
                    // Fetch top 10 repos
                    const repos = await fetch('https://api.github.com/user/repos?sort=updated&per_page=10', { headers }).then(r => r.json()).catch(() => []);
                    // Fetch user's open PRs (top 10)
                    const prsRes = await fetch(`https://api.github.com/search/issues?q=is:open+is:pr+author:${username}&per_page=10`, { headers }).then(r => r.json()).catch(() => null);
                    const prs = prsRes ? prsRes.items : [];
                    // Fetch user's open Issues (top 10)
                    const issuesRes = await fetch(`https://api.github.com/search/issues?q=is:open+is:issue+author:${username}&per_page=10`, { headers }).then(r => r.json()).catch(() => null);
                    const issues = issuesRes ? issuesRes.items : [];
                    
                    assistantTelemetry.github.repos = repos;
                    assistantTelemetry.github.prs = prs;
                    assistantTelemetry.github.issues = issues;
                    
                    localStorage.setItem('gh_active_repos', JSON.stringify(repos));
                    localStorage.setItem('gh_active_prs', JSON.stringify(prs));
                    localStorage.setItem('gh_active_issues', JSON.stringify(issues));
                }
            } catch (e) {
                console.warn("Failed background-fetching GitHub telemetry:", e);
            }
        }

        // 3. GitLab API (if token exists)
        if (glToken) {
            try {
                const headers = { 'Authorization': `Bearer ${glToken}` };
                const user = await fetch(`${glUrl}/api/v4/user`, { headers }).then(r => r.json()).catch(() => null);
                if (user && user.id) {
                    // Fetch top 10 projects
                    const projects = await fetch(`${glUrl}/api/v4/projects?membership=true&simple=true&per_page=10&order_by=updated_at`, { headers }).then(r => r.json()).catch(() => []);
                    // Fetch open MRs (top 10)
                    const mrs = await fetch(`${glUrl}/api/v4/merge_requests?state=opened&scope=created_by_me&per_page=10`, { headers }).then(r => r.json()).catch(() => []);
                    // Fetch open Issues (top 10)
                    const issues = await fetch(`${glUrl}/api/v4/issues?state=opened&scope=created_by_me&per_page=10`, { headers }).then(r => r.json()).catch(() => []);
                    
                    assistantTelemetry.gitlab.repos = projects;
                    assistantTelemetry.gitlab.mrs = mrs;
                    assistantTelemetry.gitlab.issues = issues;
                    
                    localStorage.setItem('gl_active_repos', JSON.stringify(projects));
                    localStorage.setItem('gl_active_mrs', JSON.stringify(mrs));
                    localStorage.setItem('gl_active_issues', JSON.stringify(issues));
                }
            } catch (e) {
                console.warn("Failed background-fetching GitLab telemetry:", e);
            }
        }

        // 4. Kubernetes API Status
        try {
            const k8sRes = await fetch('/api/k8s/status').then(r => r.json()).catch(() => null);
            if (k8sRes && k8sRes.success) {
                assistantTelemetry.k8s.nodes = k8sRes.nodes;
                assistantTelemetry.k8s.deployments = k8sRes.deployments;
                assistantTelemetry.k8s.pods = k8sRes.pods;
                
                localStorage.setItem('k8s_nodes', JSON.stringify(k8sRes.nodes));
                localStorage.setItem('k8s_deployments', JSON.stringify(k8sRes.deployments));
                localStorage.setItem('k8s_pods', JSON.stringify(k8sRes.pods));
            }
        } catch (e) {
            console.warn("Error background-fetching Kubernetes telemetry:", e);
        }
    }

    // --- 3. SYSTEM PROMPT CONSTRUCT ---
    function getAssistantSystemMessage(providerName) {
        const awsResources = assistantTelemetry.aws.resources || [];
        const awsLogins = assistantTelemetry.aws.logins || [];
        const awsSpending = assistantTelemetry.aws.spending || null;
        
        const ghRepos = assistantTelemetry.github.repos || [];
        const ghPrs = assistantTelemetry.github.prs || [];
        const ghIssues = assistantTelemetry.github.issues || [];
        
        const glRepos = assistantTelemetry.gitlab.repos || [];
        const glMrs = assistantTelemetry.gitlab.mrs || [];
        const glIssues = assistantTelemetry.gitlab.issues || [];

        const k8sNodes = assistantTelemetry.k8s.nodes || [];
        const k8sDeps = assistantTelemetry.k8s.deployments || [];
        const k8sPods = assistantTelemetry.k8s.pods || [];
        
        // AWS formatting
        const awsInstSummary = awsResources.map(inst => {
            return `- ${inst.name || 'Unnamed'} (${inst.id}): Type=${inst.type || 'N/A'}, PublicIP=${inst.publicIp || 'None'}, State=running`;
        }).join('\n');
        
        const awsLoginSummary = awsLogins.map(l => {
            return `- User ${l.username} (${l.userType}) from IP ${l.sourceIp} at ${new Date(l.time).toLocaleString()}`;
        }).join('\n');
        
        let awsSpendSummary = 'None';
        if (awsSpending && awsSpending.cost) {
            awsSpendSummary = `- Month-to-date Spending: ${awsSpending.cost.amount} ${awsSpending.cost.currency}`;
            if (awsSpending.budget) {
                awsSpendSummary += `\n- Budget: ${awsSpending.budget.name} | Limit: ${awsSpending.budget.limit} ${awsSpending.budget.currency} | Spent: ${awsSpending.budget.spent} ${awsSpending.budget.currency}`;
            }
        }

        // GitHub formatting
        const ghRepoSummary = ghRepos.slice(0, 5).map(r => `- ${r.full_name} (Stars: ${r.stargazers_count || 0}, Updated: ${r.updated_at})`).join('\n');
        const ghPrSummary = ghPrs.slice(0, 5).map(pr => `- #${pr.number}: "${pr.title}"`).join('\n');
        const ghIssueSummary = ghIssues.slice(0, 5).map(iss => `- #${iss.number}: "${iss.title}"`).join('\n');

        // GitLab formatting
        const glRepoSummary = glRepos.slice(0, 5).map(p => `- ${p.path_with_namespace} (Stars: ${p.star_count || 0}, Updated: ${p.last_activity_at || p.updated_at})`).join('\n');
        const glMrSummary = glMrs.slice(0, 5).map(mr => `- !${mr.iid}: "${mr.title}"`).join('\n');
        const glIssueSummary = glIssues.slice(0, 5).map(iss => `- #${iss.iid}: "${iss.title}"`).join('\n');

        // Kubernetes formatting
        const k8sNodeSummary = k8sNodes.map(n => {
            const statusObj = n.status || {};
            const conds = statusObj.conditions || [];
            const readyCond = conds.find(c => c.type === 'Ready') || {};
            return `- Node ${n.metadata.name}: Ready=${readyCond.status || 'Unknown'}, Version=${statusObj.nodeInfo ? statusObj.nodeInfo.kubeletVersion : 'N/A'}`;
        }).join('\n');
        
        const k8sDepSummary = k8sDeps.map(d => {
            const statusObj = d.status || {};
            return `- Deployment ${d.metadata.name} in "${d.metadata.namespace}": Replicas=${statusObj.replicas || 0}, ReadyReplicas=${statusObj.readyReplicas || 0}`;
        }).join('\n');
        
        const k8sPodSummary = k8sPods.map(p => {
            const statusObj = p.status || {};
            return `- Pod ${p.metadata.name} in "${p.metadata.namespace}": Status=${statusObj.phase || 'Unknown'}, IP=${statusObj.podIP || 'None'}`;
        }).join('\n');

        return `You are ${providerName}, an AI Assistant integrated into Olaf's AWS & DevOps Management Dashboard.
You are helping Olaf Krasicki-Freund manage his cloud infrastructure, software repositories, and Kubernetes deployments.
Here is the current live state of the entire portal (AWS, GitHub, GitLab, and local Kubernetes):

AWS Environment:
- Active EC2 Instances (${awsResources.length} total):
${awsInstSummary || 'None'}
- Recent Console Logins (${awsLogins.length} total):
${awsLoginSummary || 'None'}
- AWS Spending and Budgets:
${awsSpendSummary}

GitHub Environment:
- Repositories:
${ghRepoSummary || 'None'}
- Open Pull Requests:
${ghPrSummary || 'None'}
- Open Issues:
${ghIssueSummary || 'None'}

GitLab Environment:
- Projects:
${glRepoSummary || 'None'}
- Open Merge Requests:
${glMrSummary || 'None'}
- Open Issues:
${glIssueSummary || 'None'}

Kubernetes Environment (Context: k3d-review-cluster):
- Nodes:
${k8sNodeSummary || 'None'}
- Deployments:
${k8sDepSummary || 'None'}
- Pods:
${k8sPodSummary || 'None'}

Please answer Olaf's questions about any of these resources, pull requests, merge requests, issues, logins, spending/budgets, Kubernetes status/deployments, or general DevOps questions, keeping in mind your role as ${providerName}. Keep your responses helpful, concise, and formatted in Markdown.`;
    }

    // --- 4. OLLAMA MODEL MATCHING ---
    async function getBestOllamaModel(providerVal, url) {
        try {
            const res = await fetch(`${url}/api/tags`);
            if (!res.ok) return null;
            const data = await res.json();
            const models = data.models || [];
            if (models.length === 0) return null;
            
            // Filter out embedding models
            const activeModels = models.filter(m => {
                const capabilities = m.capabilities || [];
                const details = m.details || {};
                const name = m.name.toLowerCase();
                return !name.includes('embedding') && (capabilities.includes('completion') || !details.family || details.family !== 'bert');
            });
            
            if (activeModels.length === 0) return models[0].name;

            // Try to match by brand
            let brandKeywords = [];
            if (providerVal === 'gemini') {
                brandKeywords = ['gemma', 'gemini'];
            } else if (providerVal === 'claude') {
                brandKeywords = ['qwen', 'claude', 'llama'];
            }

            // 1st pass: search for brand keyword match
            for (const kw of brandKeywords) {
                const match = activeModels.find(m => m.name.toLowerCase().includes(kw));
                if (match) return match.name;
            }

            // 2nd pass: search for qwen or llama if brand match didn't find anything
            const fallbackKeywords = ['qwen', 'llama', 'gemma', 'mistral', 'phi'];
            for (const kw of fallbackKeywords) {
                const match = activeModels.find(m => m.name.toLowerCase().includes(kw));
                if (match) return match.name;
            }

            // 3rd pass: default to first active model
            return activeModels[0].name;
        } catch (err) {
            console.warn("Failed to query Ollama tags endpoint:", err);
            return null;
        }
    }

    // --- 5. CHAT TEXT MARKDOWN PARSER ---
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function parseMarkdown(text) {
        let html = escapeHtml(text);
        html = html.replace(/```[a-zA-Z0-9]*\n([\s\S]+?)```/g, '<pre>$1</pre>');
        html = html.replace(/```([\s\S]+?)```/g, '<pre>$1</pre>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    // --- 6. CORE WIDGET INITIALIZATION & LOGIC ---
    function initAssistantUI() {
        const chatBtn = document.getElementById('copilot-chat-btn');
        const chatPopup = document.getElementById('copilot-chat-popup');
        const closeBtn = document.getElementById('copilot-close-btn');
        const sendBtn = document.getElementById('copilot-send-btn');
        const chatInput = document.getElementById('copilot-chat-input');
        const chatBody = document.getElementById('copilot-chat-body');
        const providerSelect = document.getElementById('llm-provider-select');
        const voiceFeedbackCheck = document.getElementById('enable-voice-feedback');
        const micBtn = document.getElementById('copilot-mic-btn');

        if (!chatBtn || !chatPopup) return;

        // Load saved provider & voice feedback settings
        let savedProvider = localStorage.getItem('copilot_provider') || 'github-copilot';
        if (savedProvider === 'github') savedProvider = 'github-copilot';
        if (savedProvider === 'gitlab') savedProvider = 'gitlab-duo';
        providerSelect.value = savedProvider;

        const voiceChecked = localStorage.getItem('copilot_voice_feedback') === 'true';
        voiceFeedbackCheck.checked = voiceChecked;

        // Toggle chat
        chatBtn.addEventListener('click', () => {
            const isHidden = chatPopup.style.display === 'none' || !chatPopup.style.display;
            chatPopup.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                chatBody.scrollTop = chatBody.scrollHeight;
                // Update telemetry when opening the chat
                updateTelemetryFromAPIs();
            }
        });

        closeBtn.addEventListener('click', () => {
            chatPopup.style.display = 'none';
        });

        // Save LLM provider changes
        providerSelect.addEventListener('change', function () {
            localStorage.setItem('copilot_provider', this.value);
        });

        // Save voice checkbox changes
        voiceFeedbackCheck.addEventListener('change', function () {
            localStorage.setItem('copilot_voice_feedback', this.checked);
        });

        // Helper to append message
        function addMessage(text, isUser) {
            const msgDiv = document.createElement('div');
            msgDiv.className = isUser ? 'msg-user' : 'msg-bot';
            if (isUser) {
                msgDiv.innerText = text;
            } else {
                msgDiv.innerHTML = parseMarkdown(text);
            }
            chatBody.appendChild(msgDiv);
            chatBody.scrollTop = chatBody.scrollHeight;
        }

        // Send message handler
        async function handleSend() {
            const text = chatInput.value.trim();
            if (!text) return;
            
            addMessage(text, true);
            chatInput.value = '';
            
            // Show typing indicator
            const typingDiv = document.createElement('div');
            typingDiv.className = 'msg-bot';
            typingDiv.style.color = '#94a3b8';
            typingDiv.style.fontStyle = 'italic';
            typingDiv.innerText = 'Thinking...';
            chatBody.appendChild(typingDiv);
            chatBody.scrollTop = chatBody.scrollHeight;
            
            const providerVal = providerSelect.value;
            const providerText = providerSelect.options[providerSelect.selectedIndex].text;
            
            const isStaticDemo = window.location.hostname.endsWith('github.io') || 
                                 window.location.hostname.endsWith('githubusercontent.com') ||
                                 window.location.protocol === 'file:';

            try {
                let answer = '';
                if (providerVal === 'ollama') {
                    const url = localStorage.getItem('copilot_ollama_url') || 'http://localhost:11434';
                    const model = await getBestOllamaModel('ollama', url) || 'llama3';
                    const systemMessage = getAssistantSystemMessage(providerText);
                    
                    const res = await fetch(`${url}/api/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: model,
                            system: systemMessage,
                            prompt: text,
                            stream: false
                        })
                    });
                    
                    if (!res.ok) throw new Error('Ollama returned status ' + res.status);
                    const data = await res.json();
                    answer = data.response || 'No response content';
                } else if (providerVal === 'gemini' || providerVal === 'claude') {
                    const systemMessage = getAssistantSystemMessage(providerText);
                    let handled = false;
                    
                    // 1. Try browser-native window.ai
                    if (window.ai) {
                        try {
                            if (window.ai.languageModel && typeof window.ai.languageModel.create === 'function') {
                                const capabilities = await window.ai.languageModel.capabilities();
                                if (capabilities && capabilities.available !== 'no') {
                                    const session = await window.ai.languageModel.create({
                                        systemPrompt: systemMessage
                                    });
                                    answer = await session.prompt(text);
                                    handled = true;
                                }
                            } else if (window.ai.assistant && typeof window.ai.assistant.create === 'function') {
                                const capabilities = await window.ai.assistant.capabilities();
                                if (capabilities && capabilities.available !== 'no') {
                                    const session = await window.ai.assistant.create({
                                        systemPrompt: systemMessage
                                    });
                                    answer = await session.prompt(text);
                                    handled = true;
                                }
                            } else if (typeof window.ai.createTextSession === 'function') {
                                const session = await window.ai.createTextSession({
                                    systemPrompt: systemMessage
                                });
                                answer = await session.prompt(text);
                                handled = true;
                            } else if (typeof window.ai.generateText === 'function') {
                                const res = await window.ai.generateText({
                                    prompt: text,
                                    systemPrompt: systemMessage
                                });
                                answer = res.text || res.output || res;
                                handled = true;
                            }
                        } catch (aiErr) {
                            console.warn("Attempt to use window.ai failed, falling back to local Ollama client...", aiErr);
                        }
                    }
                    
                    // 2. Fall back to local Ollama client
                    if (!handled) {
                        const url = localStorage.getItem('copilot_ollama_url') || 'http://localhost:11434';
                        const model = await getBestOllamaModel(providerVal, url) || (providerVal === 'gemini' ? 'gemma2' : 'llama3');
                        try {
                            const res = await fetch(`${url}/api/generate`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    model: model,
                                    system: systemMessage,
                                    prompt: text,
                                    stream: false
                                })
                            });
                            
                            if (res.ok) {
                                const data = await res.json();
                                answer = data.response || 'No response content';
                                handled = true;
                            } else {
                                throw new Error('Ollama returned status ' + res.status);
                            }
                        } catch (ollamaErr) {
                            throw new Error(`Local LLM client not found. (Ollama connection error: ${ollamaErr.message}). Please ensure your local Ollama server is running on ${url} with the model '${model}' installed, or that your browser supports native window.ai.`);
                        }
                    }
                } else {
                    // GitHub Models or Copilot Cloud fallback
                    let token = localStorage.getItem('gh_pat');
                    if (!token) {
                        try {
                            const tokenRes = await fetch('/api/config/tokens');
                            const tokenData = await tokenRes.json();
                            if (tokenData.github) {
                                token = tokenData.github;
                                localStorage.setItem('gh_pat', token);
                            }
                        } catch (e) {
                            console.error("Auto-fetch GitHub token failed", e);
                        }
                    }
                    
                    if (!token) {
                        if (isStaticDemo) {
                            setTimeout(() => {
                                const lowerText = text.toLowerCase();
                                let responseText = "I'm running in **GitHub Pages Demo Mode**. To use a live LLM, please save a GitHub Token in Settings.\n\nHere is a simulated response:\n\n";
                                if (lowerText.includes("instance") || lowerText.includes("ec2") || lowerText.includes("running")) {
                                    responseText += "AWS EC2 instances: **SARC-Production-App** (running) and **SARC-Jenkins-CI** (running).";
                                } else if (lowerText.includes("login") || lowerText.includes("logged")) {
                                    responseText += "Recent login: **olafkfreund** from 86.12.34.112 (1 hour ago).";
                                } else {
                                    responseText += "Please configure settings for full integration.";
                                }
                                chatBody.removeChild(typingDiv);
                                addMessage(responseText, false);
                            }, 1000);
                            return;
                        }
                        throw new Error('No GitHub Personal Access Token found. Please save your GitHub PAT in Settings to authenticate.');
                    }
                    
                    const systemMessage = getAssistantSystemMessage(providerText);
                    
                    const res = await fetch('https://models.github.ai/inference/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: 'gpt-4o',
                            messages: [
                                { role: 'system', content: systemMessage },
                                { role: 'user', content: text }
                            ],
                            temperature: 0.2
                        })
                    });
                    
                    if (res.status === 403) {
                        throw new Error('Access denied. Please check if your GitHub Token has Copilot access or permissions for GitHub Models in Settings.');
                    } else if (!res.ok) {
                        throw new Error('API returned status ' + res.status);
                    }
                    
                    const data = await res.json();
                    answer = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : 'No response content';
                }
                
                chatBody.removeChild(typingDiv);
                addMessage(answer, false);
                
                // Spoken feedback
                if (voiceFeedbackCheck.checked && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(answer);
                    window.speechSynthesis.speak(utterance);
                }
            } catch (err) {
                console.error(err);
                if (chatBody.contains(typingDiv)) {
                    chatBody.removeChild(typingDiv);
                }
                addMessage(`Error: ${err.message}`, false);
            }
        }

        // Voice speech recognition
        let recognition = null;
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            
            recognition.onstart = function() {
                micBtn.style.color = '#ef4444';
            };
            
            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript;
                chatInput.value = transcript;
                handleSend();
            };
            
            recognition.onerror = function() { micBtn.style.color = '#94a3b8'; };
            recognition.onend = function() { micBtn.style.color = '#94a3b8'; };
        }
        
        micBtn.addEventListener('click', () => {
            if (recognition) recognition.start();
            else alert('Speech recognition not supported in this browser.');
        });

        sendBtn.addEventListener('click', handleSend);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSend();
        });
    }

    // --- 7. LOAD AND KICKSTART ---
    loadCachedTelemetry();
    
    // Perform background API fetch after a small delay
    setTimeout(() => {
        updateTelemetryFromAPIs();
    }, 1500);

    // Inject DOM elements on load
    const styleEl = document.createElement('style');
    styleEl.textContent = assistantStyles;
    document.head.appendChild(styleEl);

    // Inject FontAwesome if missing
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const fa = document.createElement('link');
        fa.rel = 'stylesheet';
        fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(fa);
    }

    // Dynamic HTML rendering
    const container = document.createElement('div');
    container.id = 'shared-assistant-container';
    container.innerHTML = `
        <!-- Floating Assistant Button -->
        <button class="copilot-badge-btn" id="copilot-chat-btn" title="Ask Multi-Env Assistant">
            <i class="fa-solid fa-robot"></i>
        </button>

        <!-- Assistant Chat Popup -->
        <div class="copilot-chat-popup" id="copilot-chat-popup">
            <div class="copilot-chat-header">
                <div class="title-area"><i class="fa-solid fa-robot"></i> Multi-Env Assistant</div>
                <button id="copilot-close-btn" class="close-btn"><i class="fa-solid fa-minus"></i></button>
            </div>
            <div class="copilot-chat-settings-bar">
                <div class="copilot-chat-settings-row">
                    <span class="copilot-chat-settings-label">LLM Provider:</span>
                    <select id="llm-provider-select" class="copilot-chat-provider-select">
                        <option value="github-copilot">GitHub Copilot</option>
                        <option value="aws-q">AWS Q (Cloud)</option>
                        <option value="gitlab-duo">GitLab Duo</option>
                        <option value="ollama">Ollama (Local LLM)</option>
                        <option value="gemini">Gemini</option>
                        <option value="claude">Claude</option>
                    </select>
                </div>
                <div class="copilot-chat-voice-row">
                    <label for="enable-voice-feedback" class="copilot-chat-voice-label">Spoken Feedback</label>
                    <input type="checkbox" id="enable-voice-feedback" class="copilot-chat-voice-checkbox">
                </div>
            </div>
            <div class="copilot-chat-body" id="copilot-chat-body">
                <div class="msg-bot">
                    Hello! I am your Multi-Environment Assistant. I can help you with AWS, GitHub, and GitLab. How can I assist you today?
                </div>
            </div>
            <div class="copilot-chat-input-area">
                <div class="copilot-chat-input-container">
                    <input type="text" class="copilot-chat-input" id="copilot-chat-input" placeholder="Ask about instances, PRs, pipelines...">
                    <button id="copilot-mic-btn" class="copilot-chat-mic-btn">
                        <i class="fa-solid fa-microphone"></i>
                    </button>
                </div>
                <button class="copilot-chat-send" id="copilot-send-btn"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
        </div>
    `;

    // Append to body when loaded
    if (document.body) {
        document.body.appendChild(container);
        initAssistantUI();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.appendChild(container);
            initAssistantUI();
        });
    }
})();
