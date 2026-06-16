// Muninn - JavaScript Application Controller
// Interacts with the GitHub API client-side and registers WebMCP tools.

(function () {
  'use strict';

  // Application State
  const state = {
    token: localStorage.getItem('gh_pat') || '',
    user: null,
    repos: [],
    prs: [],
    issues: [],
    workflowRuns: {},
    securityAlerts: [],
    totalStars: 0,
    theme: localStorage.getItem('theme') || 'dark',
    refreshInterval: parseInt(localStorage.getItem('refresh_interval') || '300', 10),
    timerId: null,
    mcpController: null,
    bridgeSocket: null,
    bridgeReconnectTimer: null,
    projects: [],
    currentProject: null,
    bridgeUrl: 'ws://localhost:8765',
    oauthClientId: '',
    isInitialFetch: true,
    notifiedIssueIds: new Set(),
    notifiedPrIds: new Set(),
    notifiedRunIds: new Set(),
    notifiedSecurityAlertIds: new Set(),
    trackedOpenPrs: [],
    metricsLoaded: false,
    closedItems: [],
    closedTotalCount: 0,
    mergedPrs: [],
    followedRepos: []
  };

  // DOM Elements
  const el = {};

  function initializeDOMElements() {
    el.themeToggle = document.getElementById('theme-toggle');
    el.navItems = document.querySelectorAll('.nav-item');
    el.viewSections = document.querySelectorAll('.view-section');
    el.currentViewTitle = document.getElementById('current-view-title');
    el.btnRefresh = document.getElementById('btn-refresh');
    
    // Header/Auth
    el.userProfileHeader = document.getElementById('user-profile-header');
    el.userDisplayName = document.getElementById('user-display-name');
    el.userLogin = document.getElementById('user-login');
    el.userAvatarImg = document.getElementById('user-avatar-img');
    el.btnLogoutHeader = document.getElementById('btn-logout-header');
    el.viewSetup = document.getElementById('view-setup');
    el.authForm = document.getElementById('auth-form');
    el.patInput = document.getElementById('pat-input');
    el.authErrorMsg = document.getElementById('auth-error-msg');
    el.oauthLoginContainer = document.getElementById('oauth-login-container');
    el.btnOauthLogin = document.getElementById('btn-oauth-login');
    
    // Overview
    el.statRunningWorkflows = document.getElementById('stat-running-workflows');
    el.statActivePrs = document.getElementById('stat-active-prs');
    el.statOpenIssues = document.getElementById('stat-open-issues');
    el.statSecurityAlerts = document.getElementById('stat-security-alerts');
    el.statTotalStars = document.getElementById('stat-total-stars');
    el.overviewWorkflowsTbody = document.getElementById('overview-workflows-tbody');
    
    // Workflows View
    el.workflowsRepoSelect = document.getElementById('workflows-repo-select');
    el.workflowsRunsTbody = document.getElementById('workflows-runs-tbody');
    
    // PR View
    el.prsTbody = document.getElementById('prs-tbody');
    
    // Issues View
    el.issuesListContainer = document.getElementById('issues-list-container');
    el.btnCreateIssueModal = document.getElementById('btn-create-issue-modal');
    el.modalCreateIssue = document.getElementById('modal-create-issue');
    el.btnCloseIssueModal = document.getElementById('btn-close-issue-modal');
    el.btnCancelIssue = document.getElementById('btn-cancel-issue');
    el.createIssueForm = document.getElementById('create-issue-form');
    el.issueRepoSelect = document.getElementById('issue-repo-select');
    el.issueTitleInput = document.getElementById('issue-title-input');
    el.issueBodyTextarea = document.getElementById('issue-body-textarea');
    
    // Security View
    el.securityAlertsTbody = document.getElementById('security-alerts-tbody');
    
    // Stars View
    el.starsTbody = document.getElementById('stars-tbody');

    // Followed View
    el.followedReposGrid = document.getElementById('followed-repos-grid');

    // Projects View
    el.projectSelect = document.getElementById('project-select');
    el.btnRefreshProjects = document.getElementById('btn-refresh-projects');
    el.projectInfoCard = document.getElementById('project-info-card');
    el.projectTitleHeader = document.getElementById('project-title-header');
    el.projectDescHeader = document.getElementById('project-desc-header');
    el.projectItemsContainer = document.getElementById('project-items-container');
    el.projectItemsTbody = document.getElementById('project-items-tbody');
    el.projectLoadingIndicator = document.getElementById('project-loading-indicator');
    
    // Metrics View
    el.metricLeadTime = document.getElementById('metric-lead-time');
    el.metricCycleTime = document.getElementById('metric-cycle-time');
    el.metricTestCoverage = document.getElementById('metric-test-coverage');
    el.metricItemAge = document.getElementById('metric-item-age');
    el.metricPredictability = document.getElementById('metric-predictability');
    el.metricBlockedTime = document.getElementById('metric-blocked-time');
    el.metricDefectEscape = document.getElementById('metric-defect-escape');
    el.metricDefectRoot = document.getElementById('metric-defect-root');
    el.metricAvgVelocity = document.getElementById('metric-avg-velocity');
    el.metricChangeFailure = document.getElementById('metric-change-failure');
    
    el.inputTestCoverage = document.getElementById('input-test-coverage');
    el.inputDefectEscape = document.getElementById('input-defect-escape');
    el.inputAvgVelocity = document.getElementById('input-avg-velocity');
    el.btnRefreshMetrics = document.getElementById('btn-refresh-metrics');
    
    // Settings View
    el.btnDisconnectToken = document.getElementById('btn-disconnect-token');
    el.settingsTokenBadge = document.getElementById('settings-token-badge');
    el.settingsTokenPreview = document.getElementById('settings-token-preview');
    el.selectRefreshRate = document.getElementById('select-refresh-rate');
    
    // WebMCP Status
    el.agentStatusDot = document.getElementById('agent-status-dot');
    el.agentStatusText = document.getElementById('agent-status-text');
    
    // Ollama Agent
    el.ollamaUrl = document.getElementById('ollama-url');
    el.btnConnectOllama = document.getElementById('btn-connect-ollama');
    el.ollamaModelSelect = document.getElementById('ollama-model-select');
    el.ollamaTerminalInterface = document.getElementById('ollama-terminal-interface');
    el.ollamaChatHistory = document.getElementById('ollama-chat-history');
    el.ollamaChatInput = document.getElementById('ollama-chat-input');
    el.btnSendOllama = document.getElementById('btn-send-ollama');
    el.ollamaCorsError = document.getElementById('ollama-cors-error');

    // Global Search
    el.globalSearchContainer = document.getElementById('global-search-container');
    el.globalSearchInput = document.getElementById('global-search-input');
    el.btnClearSearch = document.getElementById('btn-clear-search');
    el.searchQueryDisplay = document.getElementById('search-query-display');
    el.searchNoResults = document.getElementById('search-no-results');
    el.searchSectionRepos = document.getElementById('search-section-repos');
    el.searchReposTbody = document.getElementById('search-repos-tbody');
    el.searchSectionPrs = document.getElementById('search-section-prs');
    el.searchPrsTbody = document.getElementById('search-prs-tbody');
    el.searchSectionIssues = document.getElementById('search-section-issues');
    el.searchIssuesTbody = document.getElementById('search-issues-tbody');
    el.searchSectionWorkflows = document.getElementById('search-section-workflows');
    el.searchWorkflowsTbody = document.getElementById('search-workflows-tbody');

    // Copilot Assistant
    el.copilotChatBtn = document.getElementById('copilot-chat-btn');
    el.copilotChatPopup = document.getElementById('copilot-chat-popup');
    el.copilotChatBody = document.getElementById('copilot-chat-body');
    el.copilotChatInput = document.getElementById('copilot-chat-input');
    el.copilotSendBtn = document.getElementById('copilot-send-btn');
    el.copilotClearBtn = document.getElementById('copilot-clear-btn');
    el.copilotCloseBtn = document.getElementById('copilot-close-btn');
    el.copilotStatusIndicator = document.getElementById('copilot-status-indicator');
    
    // New Copilot settings and provider select elements
    el.copilotProviderSelect = document.getElementById('copilot-provider-select');
    el.copilotSettingsBtn = document.getElementById('copilot-settings-btn');
    el.copilotChatSettings = document.getElementById('copilot-chat-settings');
    el.copilotPatInput = document.getElementById('copilot-pat-input');
    el.copilotOllamaUrl = document.getElementById('copilot-ollama-url');
    el.copilotOllamaModel = document.getElementById('copilot-ollama-model');
    el.copilotSaveSettingsBtn = document.getElementById('copilot-save-settings-btn');
    el.copilotSettingsStatus = document.getElementById('copilot-settings-status');

    // Settings Tab Assistant Config Elements
    el.settingsCopilotProvider = document.getElementById('settings-copilot-provider');
    el.settingsCopilotPat = document.getElementById('settings-copilot-pat');
    el.settingsCopilotOllamaUrl = document.getElementById('settings-copilot-ollama-url');
    el.settingsCopilotOllamaModel = document.getElementById('settings-copilot-ollama-model');
    el.btnSaveSettingsCopilot = document.getElementById('btn-save-settings-copilot');
    el.settingsCopilotStatus = document.getElementById('settings-copilot-status');
  }

  // --- INITIALIZATION ---
  
  async function init() {
    // [INJECTED] Fetch tokens from backend proxy securely
    try {
        const res = await fetch('/api/config/tokens');
        const data = await res.json();
        if (data.github) localStorage.setItem('gh_pat', data.github.replace(/[\r\n]/g, '').trim());
        if (data.gitlab) {
            localStorage.setItem('gl_pat', data.gitlab.replace(/[\r\n]/g, '').trim());
            localStorage.setItem('gl_instance_url', (data.instance_url || 'https://gitlab.com').replace(/[\r\n]/g, '').trim());
        }
    } catch(e) { console.error('Auto-fetch token failed', e); }
    
    // Update state to use freshly fetched tokens
    state.token = localStorage.getItem('gh_pat');
    if (state.token) {
        state.token = state.token.replace(/[\r\n]/g, '').trim();
    }

    try {
      const stored = localStorage.getItem('gh_followed_repos');
      state.followedRepos = stored ? JSON.parse(stored) : [];
    } catch(e) {
      state.followedRepos = [];
    }

    initializeDOMElements();
    setupTheme();
    setupNavigation();
    setupEventListeners();
    setupAutoRefresh();

    // Check if redirect contains OAuth code
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      // Clear code query param from address bar
      window.history.replaceState({}, document.title, window.location.pathname);
      showView('setup');
      if (el.authErrorMsg) {
        el.authErrorMsg.textContent = 'Exchanging authorization code...';
        el.authErrorMsg.className = 'badge badge-info';
        el.authErrorMsg.style.display = 'block';
      }
      
      try {
        const res = await fetch('http://localhost:8765/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code })
        });
        
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        
        if (data.access_token) {
          validateAndConnect(data.access_token, true);
        }
      } catch (err) {
        if (el.authErrorMsg) {
          el.authErrorMsg.textContent = `OAuth connection failed: ${err.message}. Make sure node mcp-bridge.js is running.`;
          el.authErrorMsg.className = 'badge badge-danger';
        }
      }
    } else if (state.token) {
      validateAndConnect(state.token, false);
    } else {
      showView('setup');
      checkOauthBridgeAvailability();
    }

    checkWebMcpSupport();
  }

  async function checkOauthBridgeAvailability() {
    try {
      const res = await fetch('http://localhost:8765/config');
      const data = await res.json();
      if (data.client_id) {
        state.oauthClientId = data.client_id;
        if (el.oauthLoginContainer) {
          el.oauthLoginContainer.style.display = 'block';
        }
      }
    } catch (err) {
      if (el.oauthLoginContainer) {
        el.oauthLoginContainer.style.display = 'none';
      }
    }
  }

  // --- THEME MANAGEMENT ---
  function setupTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    if (el.themeToggle) {
      el.themeToggle.checked = (state.theme === 'light');
    }
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  // --- NAVIGATION & VIEWS ---
  function setupNavigation() {
    // Check initial hash
    const hash = window.location.hash.replace('#', '') || 'overview';
    if (state.token) {
      showView(hash);
    }

    window.addEventListener('hashchange', function () {
      const activeHash = window.location.hash.replace('#', '') || 'overview';
      if (state.token) {
        showView(activeHash);
      }
    });
  }

  function showView(viewId) {
    if (!state.token && viewId !== 'setup') {
      viewId = 'setup';
    }

    // Clear search when navigating away
    if (viewId !== 'search-results' && el.globalSearchInput) {
      el.globalSearchInput.value = '';
      if (el.btnClearSearch) el.btnClearSearch.style.display = 'none';
    }

    el.viewSections.forEach(section => {
      section.classList.remove('active');
    });

    const targetSection = document.getElementById(`view-${viewId}`);
    if (targetSection) {
      targetSection.classList.add('active');
      
      // Update Title
      const titleMap = {
        'setup': 'Connect to GitHub',
        'overview': 'Overview',
        'workflows': 'Actions & Workflow Runs',
        'prs': 'Pull Requests',
        'issues': 'Issues Management',
        'security': 'Security Alerts',
        'stars': 'Project Stars & Analytics',
        'automation': 'Automations & Agents',
        'settings': 'Settings',
        'search-results': 'Search Results',
        'projects': 'GitHub Projects',
        'metrics': 'Metrics & KPI Dashboard',
        'followed': 'My Projects'
      };
      el.currentViewTitle.textContent = titleMap[viewId] || 'Muninn';

      // Update Sidebar Nav State
      el.navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-view') === viewId) {
          item.classList.add('active');
        }
      });

      if (viewId === 'projects') {
        loadProjectsView();
      } else if (viewId === 'metrics') {
        calculateMetrics();
      } else if (viewId === 'followed') {
        renderFollowedRepos();
      } else if (viewId === 'settings') {
        loadAssistantSettings();
      }
    }
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    if (el.themeToggle) {
      el.themeToggle.addEventListener('change', toggleTheme);
    }

    if (el.authForm) {
      el.authForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const inputToken = el.patInput.value.trim();
        if (inputToken) {
          validateAndConnect(inputToken, true);
        }
      });
    }
    if (el.btnOauthLogin) {
      el.btnOauthLogin.addEventListener('click', function () {
        if (!state.oauthClientId) return;
        const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${state.oauthClientId}&scope=repo,workflow,security_events&redirect_uri=${redirectUri}`;
      });
    }

    if (el.btnRefresh) {
      el.btnRefresh.addEventListener('click', function () {
        refreshDashboard();
      });
    }

    if (el.btnLogoutHeader) {
      el.btnLogoutHeader.addEventListener('click', disconnectToken);
    }

    if (el.btnDisconnectToken) {
      el.btnDisconnectToken.addEventListener('click', disconnectToken);
    }

    if (el.selectRefreshRate) {
      el.selectRefreshRate.addEventListener('change', function () {
        state.refreshInterval = parseInt(this.value, 10);
        localStorage.setItem('refresh_interval', state.refreshInterval);
        setupAutoRefresh();
      });
    }

    if (el.btnSaveSettingsCopilot) {
      el.btnSaveSettingsCopilot.addEventListener('click', function() {
        if (el.settingsCopilotProvider) {
          localStorage.setItem('copilot_provider', el.settingsCopilotProvider.value);
          if (el.copilotProviderSelect) {
            el.copilotProviderSelect.value = el.settingsCopilotProvider.value;
          }
        }
        if (el.settingsCopilotPat) {
          const pat = el.settingsCopilotPat.value.trim();
          if (pat) {
            localStorage.setItem('gh_copilot_pat', pat);
          } else {
            localStorage.removeItem('gh_copilot_pat');
          }
          if (el.copilotPatInput) {
            el.copilotPatInput.value = pat;
          }
        }
        if (el.settingsCopilotOllamaUrl) {
          const url = el.settingsCopilotOllamaUrl.value.trim();
          localStorage.setItem('copilot_ollama_url', url || 'http://localhost:11434');
          if (el.copilotOllamaUrl) {
            el.copilotOllamaUrl.value = url || 'http://localhost:11434';
          }
        }
        if (el.settingsCopilotOllamaModel) {
          const model = el.settingsCopilotOllamaModel.value.trim();
          localStorage.setItem('copilot_ollama_model', model || 'llama3');
          if (el.copilotOllamaModel) {
            el.copilotOllamaModel.value = model || 'llama3';
          }
        }

        if (el.settingsCopilotStatus) {
          el.settingsCopilotStatus.textContent = 'Saved!';
          setTimeout(() => {
            el.settingsCopilotStatus.textContent = '';
          }, 2000);
        }

        initCopilotConnection();
      });
    }

    // Workflows Dropdown Change
    if (el.workflowsRepoSelect) {
      el.workflowsRepoSelect.addEventListener('change', function () {
        const repoFull = this.value;
        if (repoFull) {
          loadRepoWorkflows(repoFull);
        } else {
          el.workflowsRunsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">Select a repository above to display workflows.</td></tr>`;
        }
      });
    }

    // Projects View Listeners
    if (el.projectSelect) {
      el.projectSelect.addEventListener('change', function () {
        const projectId = this.value;
        if (projectId) {
          loadProjectDetails(projectId);
        } else {
          if (el.projectInfoCard) el.projectInfoCard.style.display = 'none';
          if (el.projectItemsContainer) el.projectItemsContainer.style.display = 'none';
        }
      });
    }

    if (el.btnRefreshProjects) {
      el.btnRefreshProjects.addEventListener('click', function () {
        loadProjectsView(true);
      });
    }

    // Issues Modal Controls
    if (el.btnCreateIssueModal) {
      el.btnCreateIssueModal.addEventListener('click', () => {
        el.modalCreateIssue.classList.add('active');
      });
    }

    const closeIssueModal = () => {
      el.modalCreateIssue.classList.remove('active');
      el.createIssueForm.reset();
    };

    if (el.btnCloseIssueModal) el.btnCloseIssueModal.addEventListener('click', closeIssueModal);
    if (el.btnCancelIssue) el.btnCancelIssue.addEventListener('click', closeIssueModal);

    if (el.createIssueForm) {
      el.createIssueForm.addEventListener('submit', function (e) {
        e.preventDefault();
        createGitHubIssue();
      });
    }
    // Ollama connection and chat listeners
    if (el.btnConnectOllama) {
      el.btnConnectOllama.addEventListener('click', async function () {
        const url = el.ollamaUrl.value.trim();
        if (!url) return;
        
        el.btnConnectOllama.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting';
        el.btnConnectOllama.disabled = true;
        
        try {
          const res = await fetch(`${url}/api/tags`);
          const data = await res.json();
          const models = data.models || [];
          
          if (models.length === 0) {
            throw new Error('No models found in your local Ollama. Run: ollama run <model>');
          }
          
          // Populate select
          el.ollamaModelSelect.innerHTML = models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
          el.ollamaModelSelect.style.display = 'block';
          el.ollamaTerminalInterface.style.display = 'block';
          el.ollamaCorsError.style.display = 'none';
          
          el.btnConnectOllama.innerHTML = '<i class="fa-solid fa-circle-check" style="color: var(--green);"></i> Connected';
          el.btnConnectOllama.style.backgroundColor = 'var(--bg-soft)';
        } catch (err) {
          console.error(err);
          el.ollamaCorsError.style.display = 'block';
          el.ollamaTerminalInterface.style.display = 'none';
          el.ollamaModelSelect.style.display = 'none';
          el.btnConnectOllama.innerHTML = '<i class="fa-solid fa-plug"></i> Connect';
          el.btnConnectOllama.disabled = false;
        }
      });
    }

    if (el.btnSendOllama) {
      const sendMessage = async () => {
        const promptText = el.ollamaChatInput.value.trim();
        if (!promptText) return;
        
        const url = el.ollamaUrl.value.trim();
        const model = el.ollamaModelSelect.value;
        
        // Append user prompt
        el.ollamaChatHistory.innerHTML += `<div style="margin-top: 8px; color: var(--fg-primary);"><strong>User:</strong> ${escapeHtml(promptText)}</div>`;
        el.ollamaChatInput.value = '';
        el.ollamaChatHistory.scrollTop = el.ollamaChatHistory.scrollHeight;
        
        // Append placeholder for response
        const responseId = 'ollama-response-' + Date.now();
        el.ollamaChatHistory.innerHTML += `<div style="margin-top: 6px; color: var(--orange);" id="${responseId}"><strong>Ollama:</strong> <i class="fa-solid fa-spinner fa-spin"></i> thinking...</div>`;
        el.ollamaChatHistory.scrollTop = el.ollamaChatHistory.scrollHeight;
        
        const responseEl = document.getElementById(responseId);
        
        try {
          const res = await fetch(`${url}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model,
              prompt: promptText,
              stream: false
            })
          });
          
          const data = await res.json();
          responseEl.innerHTML = `<strong>Ollama (${model}):</strong> ${escapeHtml(data.response)}`;
        } catch (err) {
          responseEl.innerHTML = `<strong>Ollama:</strong> <span style="color: var(--red);">Error generating response: ${err.message}</span>`;
        }
        
        el.ollamaChatHistory.scrollTop = el.ollamaChatHistory.scrollHeight;
      };
      
      el.btnSendOllama.addEventListener('click', sendMessage);
      el.ollamaChatInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') sendMessage();
      });
    }

    // Global Search listeners
    if (el.globalSearchInput) {
      el.globalSearchInput.addEventListener('input', function () {
        const query = this.value.trim();
        handleGlobalSearch(query);
      });
    }

    if (el.btnClearSearch) {
      el.btnClearSearch.addEventListener('click', function () {
        el.globalSearchInput.value = '';
        handleGlobalSearch('');
      });
    }

    // Copilot Chat listeners
    if (el.copilotChatBtn) {
      el.copilotChatBtn.addEventListener('click', toggleCopilotChat);
    }
    if (el.copilotCloseBtn) {
      el.copilotCloseBtn.addEventListener('click', () => el.copilotChatPopup.classList.remove('active'));
    }
    if (el.copilotClearBtn) {
      el.copilotClearBtn.addEventListener('click', clearCopilotChat);
    }
    if (el.copilotSendBtn) {
      el.copilotSendBtn.addEventListener('click', sendCopilotMessage);
    }
    if (el.copilotChatInput) {
      el.copilotChatInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') sendCopilotMessage();
      });
    }
    if (el.copilotSettingsBtn) {
      el.copilotSettingsBtn.addEventListener('click', function() {
        if (!el.copilotChatSettings) return;
        const isHidden = el.copilotChatSettings.style.display === 'none';
        el.copilotChatSettings.style.display = isHidden ? 'block' : 'none';
      });
    }
    if (el.copilotSaveSettingsBtn) {
      el.copilotSaveSettingsBtn.addEventListener('click', function() {
        const pat = el.copilotPatInput.value.trim();
        const ollamaUrl = el.copilotOllamaUrl.value.trim();
        const ollamaModel = el.copilotOllamaModel.value.trim();

        if (pat) {
          localStorage.setItem('gh_copilot_pat', pat);
        } else {
          localStorage.removeItem('gh_copilot_pat');
        }

        if (ollamaUrl) {
          localStorage.setItem('copilot_ollama_url', ollamaUrl);
        } else {
          localStorage.removeItem('copilot_ollama_url');
        }

        if (ollamaModel) {
          localStorage.setItem('copilot_ollama_model', ollamaModel);
        } else {
          localStorage.removeItem('copilot_ollama_model');
        }

        if (el.copilotSettingsStatus) {
          el.copilotSettingsStatus.textContent = 'Saved!';
          setTimeout(() => {
            el.copilotSettingsStatus.textContent = '';
          }, 2000);
        }

        initCopilotConnection();
      });
    }
    if (el.copilotProviderSelect) {
      el.copilotProviderSelect.addEventListener('change', function() {
        localStorage.setItem('copilot_provider', this.value);
        if (el.settingsCopilotProvider) {
          el.settingsCopilotProvider.value = this.value;
        }
        initCopilotConnection();
      });
    }

    // Metrics View Listeners
    if (el.btnRefreshMetrics) {
      el.btnRefreshMetrics.addEventListener('click', function () {
        calculateMetrics(true);
      });
    }

    if (el.inputTestCoverage) {
      // Load initial from localStorage or default
      const val = localStorage.getItem('metric_test_coverage') || '80';
      el.inputTestCoverage.value = val;
      el.metricTestCoverage.textContent = val + '%';

      el.inputTestCoverage.addEventListener('input', function () {
        el.metricTestCoverage.textContent = this.value + '%';
        localStorage.setItem('metric_test_coverage', this.value);
      });
    }

    if (el.inputDefectEscape) {
      // Load initial
      const val = localStorage.getItem('metric_defect_escape') || '15';
      el.inputDefectEscape.value = val;
      el.metricDefectEscape.textContent = val + '%';

      el.inputDefectEscape.addEventListener('input', function () {
        el.metricDefectEscape.textContent = this.value + '%';
        localStorage.setItem('metric_defect_escape', this.value);
      });
    }

    if (el.inputAvgVelocity) {
      // Load initial
      const val = localStorage.getItem('metric_avg_velocity') || '45';
      el.inputAvgVelocity.value = val;
      el.metricAvgVelocity.textContent = val + ' SP';

      el.inputAvgVelocity.addEventListener('input', function () {
        el.metricAvgVelocity.textContent = this.value + ' SP';
        localStorage.setItem('metric_avg_velocity', this.value);
      });
    }
  }

  // --- AUTO-REFRESH MANAGEMENT ---
  function setupAutoRefresh() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }

    if (state.refreshInterval > 0 && state.token) {
      state.timerId = setInterval(refreshDashboard, state.refreshInterval * 1000);
    }
  }

  // --- GITHUB API CLIENT ---
  async function ghFetch(path, options = {}) {
    const headers = {
      'Authorization': `token ${state.token}`,
      'Accept': 'application/vnd.github.v3+json',
      ...options.headers
    };

    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody.message || `API Error: ${response.status} ${response.statusText}`;
      throw new Error(errorMsg);
    }

    return response.json();
  }

  // --- AUTHENTICATION & LOGIN ---
  async function validateAndConnect(token, showSuccessAlert) {
    try {
      if (el.authErrorMsg) el.authErrorMsg.style.display = 'none';
      
      // Temporary state set
      state.token = token;
      
      // Validate token by fetching user profile
      const user = await ghFetch('/user');
      
            
      // Save state
      state.user = user;
      localStorage.setItem('gh_pat', token);
      
      // Update Headers and settings
      if (el.userProfileHeader) {
        el.userProfileHeader.style.display = 'flex';
        el.userDisplayName.textContent = user.name || user.login;
        el.userLogin.textContent = `@${user.login}`;
        el.userAvatarImg.src = user.avatar_url;
      }

      if (el.globalSearchContainer) {
        el.globalSearchContainer.style.display = 'block';
      }

      if (el.settingsTokenBadge) {
        el.settingsTokenBadge.textContent = 'Connected';
        el.settingsTokenBadge.className = 'badge badge-success';
        el.settingsTokenPreview.textContent = token.substring(0, 8) + '...xxxx';
      }

      // Populate Settings selection
      if (el.selectRefreshRate) {
        el.selectRefreshRate.value = state.refreshInterval;
      }
      
      // Success transition
      const activeHash = window.location.hash.replace('#', '') || 'overview';
      showView(activeHash);
      
      // Request notification permission
      requestNotificationPermission();
      
      // Fetch data
      refreshDashboard();

      // Setup WebMCP
      registerWebMcpTools();

      setupAutoRefresh();
    } catch (err) {
      state.token = '';
      localStorage.removeItem('gh_pat');
      if (el.authErrorMsg) {
        el.authErrorMsg.textContent = `Authentication Failed: ${err.message}`;
        el.authErrorMsg.style.display = 'block';
      }
      showView('setup');
    }
  }

  function disconnectToken() {
    state.token = '';
    state.user = null;
    state.repos = [];
    state.prs = [];
    state.issues = [];
    state.workflowRuns = {};
    state.securityAlerts = [];
    state.isInitialFetch = true;
    state.notifiedIssueIds = new Set();
    state.notifiedPrIds = new Set();
    state.notifiedRunIds = new Set();
    state.notifiedSecurityAlertIds = new Set();
    state.trackedOpenPrs = [];
    state.metricsLoaded = false;
    state.closedItems = [];
    state.closedTotalCount = 0;
    state.mergedPrs = [];
    
    state.followedRepos = [];
    localStorage.removeItem('gh_pat');
    localStorage.removeItem('gh_followed_repos');
    
    if (el.userProfileHeader) {
      el.userProfileHeader.style.display = 'none';
    }

    if (el.globalSearchContainer) {
      el.globalSearchContainer.style.display = 'none';
      el.globalSearchInput.value = '';
    }

    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }

    // Abort WebMCP Tools
    if (state.mcpController) {
      state.mcpController.abort();
      state.mcpController = null;
      updateWebMcpStatusCard(false, 'Inactive (Disconnected)');
    }

    showView('setup');
  }

  // --- DASHBOARD DATA LOADING ---
  async function refreshDashboard() {
    if (!state.token) return;
    state.metricsLoaded = false;

    // Show spinning refresh icon
    const refreshIcon = el.btnRefresh.querySelector('i');
    refreshIcon.classList.add('fa-spin');

    try {
      // 1. Fetch Repositories
      const repos = await ghFetch('/user/repos?sort=updated&per_page=100');
      state.repos = repos;
      
      // Calculate total stars
      state.totalStars = repos.reduce((acc, repo) => acc + (repo.stargazers_count || 0), 0);
      el.statTotalStars.textContent = state.totalStars;

      // Populate repo dropdowns
      populateRepoDropdowns(repos);

      // Compute unique owners/organizations from repositories
      const owners = [...new Set(repos.map(r => r.owner.login))].slice(0, 5);
      if (owners.length === 0 && state.user && state.user.login) {
        owners.push(state.user.login);
      }
      state.owners = owners;

      // 2. Fetch Open PRs (using Search API for efficiency across owners)
      const prsPromises = owners.map(owner => 
        ghFetch(`/search/issues?q=is:open+is:pr+user:${owner}&per_page=100`).catch(() => ({ items: [] }))
      );
      const prsResults = await Promise.all(prsPromises);
      state.prs = prsResults.flatMap(res => res.items || []);
      const totalPrsCount = prsResults.reduce((acc, res) => acc + (res.total_count || 0), 0);
      el.statActivePrs.textContent = totalPrsCount !== undefined ? totalPrsCount : state.prs.length;

      // 3. Fetch Open Issues (using Search API across owners)
      const issuesPromises = owners.map(owner => 
        ghFetch(`/search/issues?q=is:open+is:issue+user:${owner}&per_page=100`).catch(() => ({ items: [] }))
      );
      const issuesResults = await Promise.all(issuesPromises);
      state.issues = issuesResults.flatMap(res => res.items || []);
      const totalIssuesCount = issuesResults.reduce((acc, res) => acc + (res.total_count || 0), 0);
      el.statOpenIssues.textContent = totalIssuesCount !== undefined ? totalIssuesCount : state.issues.length;

      // Prioritize followed repos, falling back to top recently updated ones if followed list is small
      let monitoredRepos = repos.filter(r => state.followedRepos.includes(r.full_name));
      if (monitoredRepos.length < 5) {
        const remaining = repos.filter(r => !state.followedRepos.includes(r.full_name));
        monitoredRepos = monitoredRepos.concat(remaining.slice(0, 5 - monitoredRepos.length));
      }

      // 4. Load Recent Workflows runs for overview
      await loadRecentOverviewWorkflows(monitoredRepos.slice(0, 5));

      // 5. Load Security Scans
      await loadSecurityScans(monitoredRepos.slice(0, 5));

      // Check and notify changes
      await checkAndNotifyChanges();

      // Render all views
      renderOverview();
      renderPRs();
      renderIssues();
      renderSecurityAlerts();
      renderStars();
      renderFollowedRepos();

      // Trigger active views updates if applicable
      const activeHash = window.location.hash.replace('#', '') || 'overview';
      if (activeHash === 'workflows') {
        const activeRepo = el.workflowsRepoSelect.value;
        if (activeRepo) loadRepoWorkflows(activeRepo);
      } else if (activeHash === 'metrics') {
        calculateMetrics();
      }

    } catch (err) {
      console.error('Error refreshing dashboard:', err);
    } finally {
      // Remove spin
      setTimeout(() => {
        refreshIcon.classList.remove('fa-spin');
      }, 500);
    }
  }

  function populateRepoDropdowns(repos) {
    // Save selections
    const prevWorkflowVal = el.workflowsRepoSelect.value;
    const prevIssueVal = el.issueRepoSelect.value;

    const options = repos.map(repo => `<option value="${repo.full_name}">${repo.full_name}</option>`).join('');
    
    el.workflowsRepoSelect.innerHTML = `<option value="">Select a repository...</option>${options}`;
    el.issueRepoSelect.innerHTML = `<option value="">Select a repository...</option>${options}`;

    // Restore selections if valid
    if (prevWorkflowVal) el.workflowsRepoSelect.value = prevWorkflowVal;
    if (prevIssueVal) el.issueRepoSelect.value = prevIssueVal;
  }

  // --- COMPONENT RENDERING ---

  // Overview
  function renderOverview() {
    if (state.prs.length === 0 && Object.keys(state.workflowRuns).length === 0) return;

    // Running workflows calculations
    let runningCount = 0;
    const allRecentRuns = [];

    Object.keys(state.workflowRuns).forEach(repo => {
      const runs = state.workflowRuns[repo] || [];
      runs.forEach(run => {
        allRecentRuns.push({ repo, ...run });
        if (run.status === 'in_progress' || run.status === 'queued') {
          runningCount++;
        }
      });
    });

    el.statRunningWorkflows.textContent = runningCount;

    // Render Table
    if (allRecentRuns.length === 0) {
      el.overviewWorkflowsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">No recent runs found.</td></tr>`;
      return;
    }

    // Sort by updated_at
    allRecentRuns.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    el.overviewWorkflowsTbody.innerHTML = allRecentRuns.slice(0, 10).map(run => {
      const statusBadge = getWorkflowStatusBadge(run.status, run.conclusion);
      const repoName = run.repo.split('/')[1];
      const timeStr = formatRelativeTime(run.updated_at);
      
      const cancelBtn = (run.status === 'in_progress' || run.status === 'queued')
        ? `<button class="btn btn-sm badge-danger" onclick="cancelWorkflowRun('${run.repo}', ${run.id})">Cancel</button>`
        : `<button class="btn btn-sm btn-primary" onclick="reRunWorkflow('${run.repo}', ${run.id})">Re-run</button>`;

      return `
        <tr>
          <td><strong><a href="https://github.com/${run.repo}" target="_blank">${repoName}</a></strong></td>
          <td><a href="${run.html_url}" target="_blank">${run.name} (#${run.run_number})</a></td>
          <td>${run.triggering_actor ? run.triggering_actor.login : 'system'}</td>
          <td><code>${run.event}</code></td>
          <td>${statusBadge}</td>
          <td>
            <div class="flex-align">
              ${cancelBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // PRs View
  function renderPRs() {
    if (state.prs.length === 0) {
      el.prsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">No open pull requests found.</td></tr>`;
      return;
    }

    el.prsTbody.innerHTML = state.prs.map(pr => {
      // Extract repo name from repository_url
      const repoParts = pr.repository_url.split('/repos/');
      const repoName = repoParts[1] || 'Repo';
      const repoShort = repoName.split('/')[1] || repoName;
      
      // Build reviewer badges
      const reviewers = pr.requested_reviewers || [];
      const reviewerLabels = reviewers.map(r => `<span class="badge badge-neutral" style="padding: 2px 4px; font-size: 10px;">@${r.login}</span>`).join(' ');

      return `
        <tr>
          <td><strong><a href="https://github.com/${repoName}" target="_blank">${repoShort}</a></strong></td>
          <td>
            <a href="${pr.html_url}" target="_blank" style="font-weight: 700;">${pr.title}</a>
            <div class="card-desc">#${pr.number} opened ${formatRelativeTime(pr.created_at)}</div>
          </td>
          <td>
            <div class="flex-align">
              <img src="${pr.user.avatar_url}" style="width: 20px; height: 20px; border-radius: 50%;">
              <span>@${pr.user.login}</span>
            </div>
          </td>
          <td>
            ${reviewerLabels || '<span class="card-desc">None</span>'}
          </td>
          <td>
            ${pr.draft ? '<span class="badge badge-neutral">Draft</span>' : '<span class="badge badge-info">Open</span>'}
          </td>
          <td>
            <div class="flex-align">
              <button class="btn btn-sm btn-primary" onclick="mergePR('${repoName}', ${pr.number})"><i class="fa-solid fa-code-merge"></i> Merge</button>
              <button class="btn btn-sm" onclick="closePR('${repoName}', ${pr.number})">Close</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Issues View
  function renderIssues() {
    if (state.issues.length === 0) {
      el.issuesListContainer.innerHTML = `<div class="card" style="text-align: center; color: var(--fg-secondary);">No open issues assigned or found.</div>`;
      return;
    }

    // Group issues by Repository
    const grouped = {};
    state.issues.forEach(issue => {
      const repoParts = issue.repository_url.split('/repos/');
      const repoName = repoParts[1] || 'Other Repositories';
      if (!grouped[repoName]) {
        grouped[repoName] = [];
      }
      grouped[repoName].push(issue);
    });

    el.issuesListContainer.innerHTML = Object.keys(grouped).map(repoName => {
      const repoShort = repoName.split('/')[1] || repoName;
      const issues = grouped[repoName];
      
      const issueRows = issues.map(issue => {
        const labels = issue.labels.map(l => `<span class="badge" style="background-color: #${l.color}25; color: #${l.color}; border-color: #${l.color}; font-size: 10px; padding: 2px 6px; margin-right: 4px;">${l.name}</span>`).join('');
        
        return `
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div class="flex-align" style="margin-bottom: 4px;">
                <a href="${issue.html_url}" target="_blank" style="font-weight: 700;">${issue.title}</a>
                <span class="card-desc">#${issue.number}</span>
              </div>
              <div class="flex-align">
                <span class="card-desc">Opened ${formatRelativeTime(issue.created_at)} by @${issue.user.login}</span>
                <div style="display: inline-flex; flex-wrap: wrap;">${labels}</div>
              </div>
            </div>
            <div class="flex-align">
              <button class="btn btn-sm" onclick="closeIssue('${repoName}', ${issue.number})">Close</button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="table-container" style="margin-bottom: 24px;">
          <div style="padding: 16px 20px; background-color: var(--bg-soft); border-bottom: 2px solid var(--border-color); font-weight: 700; font-family: var(--font-mono); font-size: 14px;">
            <i class="fa-solid fa-folder"></i> ${repoName} (${issues.length})
          </div>
          <div style="background-color: var(--bg-hard);">
            ${issueRows}
          </div>
        </div>
      `;
    }).join('');
  }

  // Security View
  function renderSecurityAlerts() {
    if (state.securityAlerts.length === 0) {
      el.securityAlertsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">No security scan alerts found. Scans are healthy.</td></tr>`;
      el.statSecurityAlerts.textContent = 0;
      return;
    }

    el.statSecurityAlerts.textContent = state.securityAlerts.length;

    el.securityAlertsTbody.innerHTML = state.securityAlerts.map(alert => {
      const severityClass = `scan-severity-${alert.severity}`;
      const timeStr = formatRelativeTime(alert.created_at || alert.updated_at);
      const pkg = alert.package || alert.security_advisory?.package?.name || alert.rule?.id || 'General';
      const desc = alert.security_advisory?.summary || alert.description || 'Code scanning warning';
      const htmlUrl = alert.html_url || `https://github.com/${alert.repo}/security/alerts`;

      return `
        <tr>
          <td><strong>${alert.repo.split('/')[1]}</strong></td>
          <td>
            <a href="${htmlUrl}" target="_blank" style="font-weight:700;">${desc}</a>
            <div class="card-desc">ID: ${alert.number || alert.id}</div>
          </td>
          <td><span class="badge ${severityClass === 'scan-severity-critical' || severityClass === 'scan-severity-high' ? 'badge-danger' : 'badge-warning'}">${alert.severity.toUpperCase()}</span></td>
          <td><code>${pkg}</code></td>
          <td>${timeStr}</td>
          <td>
            <a href="${htmlUrl}" target="_blank" class="btn btn-sm">Fix Alert</a>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Stars View
  function renderStars() {
    if (state.repos.length === 0) {
      el.starsTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--fg-secondary);">Connect account to load stars analytics.</td></tr>`;
      return;
    }

    // Sort repositories by star count descending
    const sortedRepos = [...state.repos].sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));

    el.starsTbody.innerHTML = sortedRepos.map(repo => {
      const isFollowed = state.followedRepos.includes(repo.full_name);
      const followIcon = isFollowed ? 'fa-solid fa-bell' : 'fa-regular fa-bell';
      const followColor = isFollowed ? 'color: var(--yellow);' : 'color: var(--fg-secondary);';
      const followTitle = isFollowed ? 'Stop tracking this project' : 'Track and get notifications for this project';

      return `
        <tr>
          <td><strong><a href="${repo.html_url}" target="_blank">${repo.name}</a></strong></td>
          <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${repo.description || 'No description'}">
            <span class="card-desc">${repo.description || 'No description provided.'}</span>
          </td>
          <td><span class="badge badge-neutral">${repo.language || 'N/A'}</span></td>
          <td><i class="fa-solid fa-code-fork"></i> ${repo.forks_count}</td>
          <td>${formatRelativeTime(repo.updated_at)}</td>
          <td>
            <div class="flex-align" style="font-weight: 700; color: var(--yellow);">
              <i class="fa-solid fa-star"></i> ${repo.stargazers_count}
            </div>
          </td>
          <td style="text-align: center;">
            <button class="btn btn-sm btn-icon" onclick="toggleFollowRepo('${repo.full_name}')" style="margin: 0; padding: 4px 8px; ${followColor}" title="${followTitle}">
              <i class="${followIcon}"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- ACTIONS & OPERATIONS ---

  // Load Workflows for specific Repository
  async function loadRepoWorkflows(repoFull) {
    el.workflowsRunsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center;"><i class="fa-solid fa-rotate fa-spin"></i> Loading workflows...</td></tr>`;

    try {
      // Fetch workflows
      const workflowsData = await ghFetch(`/repos/${repoFull}/actions/workflows`);
      const workflows = workflowsData.workflows || [];
      
      // Fetch latest runs
      const runsData = await ghFetch(`/repos/${repoFull}/actions/runs?per_page=30`);
      const runs = runsData.workflow_runs || [];

      // Save runs state
      state.workflowRuns[repoFull] = runs;

      if (runs.length === 0) {
        el.workflowsRunsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">No workflow runs found.</td></tr>`;
        return;
      }

      el.workflowsRunsTbody.innerHTML = runs.map(run => {
        const statusBadge = getWorkflowStatusBadge(run.status, run.conclusion);
        const timeStr = formatRelativeTime(run.updated_at);

        const cancelBtn = (run.status === 'in_progress' || run.status === 'queued')
          ? `<button class="btn btn-sm badge-danger" onclick="cancelWorkflowRun('${repoFull}', ${run.id})">Cancel</button>`
          : `<button class="btn btn-sm btn-primary" onclick="reRunWorkflow('${repoFull}', ${run.id})">Re-run</button>`;

        // Find match workflow dispatch capability
        const matchingWorkflow = workflows.find(w => w.id === run.workflow_id);
        const dispatchBtn = (matchingWorkflow && run.event === 'workflow_dispatch')
          ? `<button class="btn btn-sm" onclick="dispatchWorkflow('${repoFull}', ${run.workflow_id}, '${run.head_branch}')" title="Trigger dispatch run"><i class="fa-solid fa-rocket"></i> Dispatch</button>`
          : '';

        return `
          <tr>
            <td>
              <a href="${run.html_url}" target="_blank" style="font-weight:700;">${run.name} (#${run.run_number})</a>
              <div class="card-desc">SHA: <code>${run.head_sha.substring(0, 7)}</code></div>
            </td>
            <td><code>${run.head_branch}</code></td>
            <td><code>${run.event}</code></td>
            <td>${statusBadge}</td>
            <td>${timeStr}</td>
            <td>
              <div class="flex-align">
                ${cancelBtn}
                ${dispatchBtn}
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      el.workflowsRunsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--red);">Error loading workflows: ${err.message}</td></tr>`;
    }
  }

  // Fetch recent workflows across active repos
  async function loadRecentOverviewWorkflows(topRepos) {
    const promises = topRepos.map(async (repo) => {
      try {
        const data = await ghFetch(`/repos/${repo.full_name}/actions/runs?per_page=5`);
        state.workflowRuns[repo.full_name] = data.workflow_runs || [];
      } catch (err) {
        // Fail silently for repositories without Action privileges
        state.workflowRuns[repo.full_name] = [];
      }
    });
    await Promise.all(promises);
  }

  // Load Security alerts for main repositories
  async function loadSecurityScans(topRepos) {
    let allAlerts = [];
    const promises = topRepos.map(async (repo) => {
      try {
        // Fetch Dependabot Alerts
        const dependabotAlerts = await ghFetch(`/repos/${repo.full_name}/dependabot/alerts?state=open&per_page=10`).catch(() => []);
        const formatted = dependabotAlerts.map(alert => ({
          repo: repo.full_name,
          id: alert.number,
          number: alert.number,
          severity: alert.security_vulnerability?.severity || 'medium',
          security_advisory: alert.security_advisory,
          package: alert.security_vulnerability?.package?.name || alert.dependency?.package?.name || 'Unknown',
          created_at: alert.created_at,
          html_url: alert.html_url
        }));
        allAlerts.push(...formatted);

        // Fetch Code Scanning Alerts if possible
        const codeScans = await ghFetch(`/repos/${repo.full_name}/code-scanning/alerts?state=open&per_page=10`).catch(() => []);
        const codeFormatted = codeScans.map(alert => ({
          repo: repo.full_name,
          id: alert.number,
          number: alert.number,
          severity: alert.rule?.severity === 'error' ? 'high' : (alert.rule?.severity === 'warning' ? 'medium' : 'low'),
          rule: alert.rule,
          description: alert.rule?.description || alert.description,
          created_at: alert.created_at,
          html_url: alert.html_url
        }));
        allAlerts.push(...codeFormatted);
      } catch (err) {
        // Fails silently for permission lack
      }
    });
    await Promise.all(promises);
    state.securityAlerts = allAlerts;
  }

  // Cancel running workflows
  window.cancelWorkflowRun = async function (repoFull, runId) {
    if (!confirm('Are you sure you want to cancel this workflow run?')) return;
    try {
      await ghFetch(`/repos/${repoFull}/actions/runs/${runId}/cancel`, { method: 'POST' });
      alert('Cancel command sent to GitHub!');
      setTimeout(refreshDashboard, 2000);
    } catch (err) {
      alert(`Failed to cancel workflow: ${err.message}`);
    }
  };

  // Re-run workflow
  window.reRunWorkflow = async function (repoFull, runId) {
    try {
      await ghFetch(`/repos/${repoFull}/actions/runs/${runId}/rerun`, { method: 'POST' });
      alert('Workflow re-run queued!');
      setTimeout(refreshDashboard, 2000);
    } catch (err) {
      alert(`Failed to trigger re-run: ${err.message}`);
    }
  };

  // Dispatch manual workflow dispatch run
  window.dispatchWorkflow = async function (repoFull, workflowId, branch) {
    const ref = prompt('Enter git branch or tag to run on:', branch || 'master');
    if (!ref) return;

    try {
      await ghFetch(`/repos/${repoFull}/actions/workflows/${workflowId}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: ref })
      });
      alert('Workflow run successfully dispatched!');
      setTimeout(refreshDashboard, 2000);
    } catch (err) {
      alert(`Failed to dispatch workflow: ${err.message}`);
    }
  };

  // Merge Pull Request
  window.mergePR = async function (repoFull, number) {
    if (!confirm(`Are you sure you want to MERGE Pull Request #${number}?`)) return;
    try {
      await ghFetch(`/repos/${repoFull}/pulls/${number}/merge`, {
        method: 'PUT',
        body: JSON.stringify({ commit_title: `Merged PR #${number} via Muninn` })
      });
      alert('PR merged successfully!');
      refreshDashboard();
    } catch (err) {
      alert(`Merge failed: ${err.message}`);
    }
  };

  // Close Pull Request
  window.closePR = async function (repoFull, number) {
    if (!confirm(`Are you sure you want to CLOSE Pull Request #${number}?`)) return;
    try {
      await ghFetch(`/repos/${repoFull}/pulls/${number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' })
      });
      alert('PR closed.');
      refreshDashboard();
    } catch (err) {
      alert(`Operation failed: ${err.message}`);
    }
  };

  // Close Issue
  window.closeIssue = async function (repoFull, number) {
    if (!confirm(`Are you sure you want to CLOSE issue #${number}?`)) return;
    try {
      await ghFetch(`/repos/${repoFull}/issues/${number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' })
      });
      alert('Issue closed successfully.');
      refreshDashboard();
    } catch (err) {
      alert(`Failed to close issue: ${err.message}`);
    }
  };

  // Create GitHub Issue
  async function createGitHubIssue() {
    const repoFull = el.issueRepoSelect.value;
    const title = el.issueTitleInput.value.trim();
    const body = el.issueBodyTextarea.value;

    if (!repoFull || !title) return;

    const btnSubmit = document.getElementById('btn-submit-issue');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';

    try {
      await ghFetch(`/repos/${repoFull}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title, body })
      });
      alert('Issue created successfully!');
      
      // Close Modal and reload
      el.modalCreateIssue.classList.remove('active');
      el.createIssueForm.reset();
      refreshDashboard();
    } catch (err) {
      alert(`Failed to create issue: ${err.message}`);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = 'Create Issue';
    }
  }

  // --- AUTOMATIONS PANEL ---
  window.runPRLabeler = async function () {
    alert('PR auto-labeler starting...');
    // Demo implementation
    let count = 0;
    for (const pr of state.prs) {
      const repoParts = pr.repository_url.split('/repos/');
      const repoName = repoParts[1];
      if (pr.draft && !pr.labels.some(l => l.name === 'WIP')) {
        try {
          await ghFetch(`/repos/${repoName}/issues/${pr.number}/labels`, {
            method: 'POST',
            body: JSON.stringify({ labels: ['WIP'] })
          });
          count++;
        } catch (e) {
          console.error(e);
        }
      }
    }
    alert(`Auto-labeler complete. Marked ${count} draft PRs with 'WIP' label.`);
    refreshDashboard();
  };

  window.runStaleIssueScanner = async function () {
    alert('Scanning issues for stale status (30 days inactivity)...');
    let staleCount = 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

    const staleIssues = state.issues.filter(issue => {
      const updated = new Date(issue.updated_at);
      return updated < thirtyDaysAgo;
    });

    if (staleIssues.length === 0) {
      alert('No stale issues found.');
      return;
    }

    const confirmClose = confirm(`Found ${staleIssues.length} stale issues. Would you like to close them all?`);
    if (!confirmClose) return;

    for (const issue of staleIssues) {
      const repoParts = issue.repository_url.split('/repos/');
      const repoName = repoParts[1];
      try {
        await ghFetch(`/repos/${repoName}/issues/${issue.number}`, {
          method: 'PATCH',
          body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' })
        });
        staleCount++;
      } catch (e) {
        console.error(e);
      }
    }
    alert(`Closed ${staleCount} stale issues successfully.`);
    refreshDashboard();
  };

  // Demo connection to local MCP SSE
  window.connectLocalMcp = function () {
    const url = document.getElementById('mcp-terminal-url').value.trim();
    if (!url) return;
    alert(`Attempting connection to local SSE server at: ${url}\n(Note: CORS settings on your local SSE endpoint must allow this browser origin).`);
  };

  // --- WEBMCP AGENT INTEGRATION (BROWSER NATIVE & FALLBACK BRIDGE) ---
  function checkWebMcpSupport() {
    const isSupported = ('modelContext' in navigator && 'registerTool' in navigator.modelContext);
    if (isSupported) {
      updateWebMcpStatusCard(true, 'Active (Native WebMCP)');
    } else {
      updateWebMcpStatusCard(false, 'Inactive (Connecting to Bridge...)');
      connectMcpBridge();
    }
  }

  function updateWebMcpStatusCard(active, text) {
    if (active) {
      el.agentStatusDot.classList.add('active');
    } else {
      el.agentStatusDot.classList.remove('active');
    }
    el.agentStatusText.textContent = text;
  }

  function getToolsList() {
    return [
      {
        name: 'list_loaded_repos',
        description: 'Returns the list of repositories loaded in the Muninn dashboard, including star counts and description.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true }
      },
      {
        name: 'list_pull_requests',
        description: 'Returns active GitHub pull requests displayed in Muninn.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true }
      },
      {
        name: 'list_issues',
        description: 'Returns open issues grouped by repository.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true }
      },
      {
        name: 'trigger_action_workflow',
        description: 'Triggers a manual workflow dispatch run for a repository.',
        inputSchema: {
          type: 'object',
          properties: {
            repo: { type: 'string', description: 'The full repository name, e.g., "owner/repo".' },
            workflow_id: { type: 'number', description: 'The workflow ID to trigger.' },
            ref: { type: 'string', description: 'Git branch or tag to run on.' }
          },
          required: ['repo', 'workflow_id', 'ref']
        }
      }
    ];
  }

  async function executeTool(name, args) {
    if (name === 'list_loaded_repos') {
      return state.repos.map(r => ({
        name: r.name,
        full_name: r.full_name,
        stars: r.stargazers_count,
        forks: r.forks_count,
        language: r.language,
        description: r.description
      }));
    }
    if (name === 'list_pull_requests') {
      return state.prs.map(pr => ({
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        html_url: pr.html_url,
        created_at: pr.created_at,
        draft: pr.draft
      }));
    }
    if (name === 'list_issues') {
      return state.issues.map(issue => ({
        number: issue.number,
        title: issue.title,
        author: issue.user.login,
        created_at: issue.created_at,
        labels: issue.labels.map(l => l.name)
      }));
    }
    if (name === 'trigger_action_workflow') {
      await ghFetch(`/repos/${args.repo}/actions/workflows/${args.workflow_id}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: args.ref })
      });
      refreshDashboard();
      return `Workflow ${args.workflow_id} successfully triggered on branch ${args.ref}!`;
    }
    throw new Error('Tool not found: ' + name);
  }

  function registerWebMcpTools() {
    if (!('modelContext' in navigator && 'registerTool' in navigator.modelContext)) {
      return;
    }

    if (state.mcpController) {
      state.mcpController.abort();
    }

    state.mcpController = new AbortController();
    const signal = state.mcpController.signal;

    try {
      const tools = getToolsList();
      tools.forEach(tool => {
        const toolDef = {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          async execute(args) {
            return await executeTool(tool.name, args);
          }
        };
        
        if (tool.annotations) {
          toolDef.annotations = tool.annotations;
        }

        navigator.modelContext.registerTool(toolDef, { signal });
      });

      updateWebMcpStatusCard(true, 'Active (Native WebMCP - ' + tools.length + ' Tools)');
      console.log('Muninn WebMCP Native Tools successfully registered!');
    } catch (err) {
      console.error('Failed to register WebMCP tools:', err);
      updateWebMcpStatusCard(false, 'Registration Failed');
    }
  }

  function connectMcpBridge() {
    // If bridge is already connected or native WebMCP is running, do nothing
    if (state.bridgeSocket || ('modelContext' in navigator && 'registerTool' in navigator.modelContext)) {
      return;
    }

    console.log('[MCP Bridge] Attempting connection to local bridge at ' + state.bridgeUrl);
    
    try {
      const socket = new WebSocket(state.bridgeUrl);
      state.bridgeSocket = socket;

      socket.onopen = function () {
        console.log('[MCP Bridge] Connected to local bridge!');
        updateWebMcpStatusCard(true, 'Active (via Local Bridge)');
      };

      socket.onclose = function () {
        console.log('[MCP Bridge] Connection closed.');
        state.bridgeSocket = null;
        
        const isNativeSupported = ('modelContext' in navigator && 'registerTool' in navigator.modelContext);
        if (!isNativeSupported) {
          updateWebMcpStatusCard(false, 'Inactive (Bridge disconnected)');
        }

        // Try reconnecting in 5 seconds
        if (state.bridgeReconnectTimer) clearTimeout(state.bridgeReconnectTimer);
        state.bridgeReconnectTimer = setTimeout(connectMcpBridge, 5000);
      };

      socket.onerror = function () {
        socket.close();
      };

      socket.onmessage = async function (event) {
        try {
          const req = JSON.parse(event.data);
          const { method, id, params } = req;

          if (method === 'tools/list') {
            const toolsList = getToolsList();
            socket.send(JSON.stringify({
              jsonrpc: '2.0',
              id: id,
              result: { tools: toolsList }
            }));
          } else if (method === 'tools/call') {
            const toolName = params.name;
            const args = params.arguments || {};
            
            try {
              const res = await executeTool(toolName, args);
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                id: id,
                result: {
                  content: [{
                    type: 'text',
                    text: JSON.stringify(res, null, 2)
                  }]
                }
              }));
            } catch (err) {
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                id: id,
                error: { code: -32603, message: err.message }
              }));
            }
          }
        } catch (err) {
          console.error('[MCP Bridge] Error processing bridge message:', err);
        }
      };
    } catch (e) {
      state.bridgeSocket = null;
    }
  }

  // --- NOTIFICATION ENGINE ---
  function requestNotificationPermission() {
    if (!('Notification' in window)) {
      console.warn('This browser does not support desktop notifications.');
      return;
    }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log('Desktop notifications enabled.');
        }
      });
    }
  }

  function showNotification(title, body, type = 'info', url = '') {
    // 1. In-app popup (toast)
    const container = document.getElementById('toast-container');
    if (container) {
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      
      let iconClass = 'fa-circle-info';
      if (type === 'success') iconClass = 'fa-circle-check';
      else if (type === 'danger') iconClass = 'fa-circle-xmark';
      else if (type === 'warning') iconClass = 'fa-triangle-exclamation';

      toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <div class="toast-content" ${url ? `style="cursor: pointer;" onclick="window.open('${url}', '_blank')"` : ''}>
          <div class="toast-title">${escapeHtml(title || '')}</div>
          <div class="toast-message">${escapeHtml(body || '')}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.classList.add('toast-fadeOut'); setTimeout(() => this.parentElement.remove(), 300);">&times;</button>
      `;

      container.appendChild(toast);

      // Auto-remove toast after 6 seconds
      setTimeout(() => {
        if (toast.parentElement) {
          toast.classList.add('toast-fadeOut');
          setTimeout(() => toast.remove(), 300);
        }
      }, 6000);
    }

    // 2. Desktop notification
    if ('Notification' in window && Notification.permission === 'granted') {
      const origin = window.location.origin;
      const path = window.location.pathname.replace(/\/index\.html$/, '');
      const iconUrl = `${origin}${path}/assets/images/logo.png`;
      const options = {
        body: body,
        icon: iconUrl
      };

      try {
        const notification = new Notification(title, options);
        if (url) {
          notification.onclick = function() {
            window.open(url, '_blank');
            window.focus();
          };
        }
      } catch (err) {
        console.error('Failed to display desktop notification:', err);
      }
    }
  }

  async function checkAndNotifyChanges() {
    function getRepoFromUrl(url) {
      if (!url) return '';
      const parts = url.split(url.includes('api.github.com') ? '/repos/' : 'github.com/');
      if (parts.length > 1) {
        return parts[1].split('/').slice(0, 2).join('/');
      }
      return '';
    }

    if (state.isInitialFetch) {
      state.issues.forEach(issue => {
        state.notifiedIssueIds.add(issue.id);
      });

      state.prs.forEach(pr => {
        state.notifiedPrIds.add(pr.id);
      });
      state.trackedOpenPrs = [...state.prs];

      Object.keys(state.workflowRuns).forEach(repo => {
        const runs = state.workflowRuns[repo] || [];
        runs.forEach(run => {
          if (run.status === 'completed') {
            state.notifiedRunIds.add(run.id);
          }
        });
      });

      state.securityAlerts.forEach(alert => {
        const alertId = alert.html_url || `${alert.repo}-${alert.id}`;
        state.notifiedSecurityAlertIds.add(alertId);
      });

      state.isInitialFetch = false;
      return;
    }

    // --- CHECK FOR NEW ISSUES ---
    state.issues.forEach(issue => {
      if (!state.notifiedIssueIds.has(issue.id)) {
        state.notifiedIssueIds.add(issue.id);
        const repo = getRepoFromUrl(issue.repository_url || issue.html_url);
        const repoLabel = repo ? ` in ${repo}` : '';
        showNotification(
          `New Issue Created`,
          `#${issue.number}: ${issue.title} by @${issue.user.login}${repoLabel}`,
          'info',
          issue.html_url
        );
      }
    });

    // --- CHECK FOR NEW PULL REQUESTS ---
    state.prs.forEach(pr => {
      if (!state.notifiedPrIds.has(pr.id)) {
        state.notifiedPrIds.add(pr.id);
        const repo = getRepoFromUrl(pr.repository_url || pr.html_url);
        const repoLabel = repo ? ` in ${repo}` : '';
        showNotification(
          `New Pull Request`,
          `#${pr.number}: ${pr.title} by @${pr.user.login}${repoLabel}`,
          'info',
          pr.html_url
        );
      }
    });

    // --- CHECK FOR MERGED PULL REQUESTS ---
    const newPrIds = new Set(state.prs.map(pr => pr.id));
    for (const oldPr of state.trackedOpenPrs) {
      if (!newPrIds.has(oldPr.id)) {
        const repo = getRepoFromUrl(oldPr.repository_url || oldPr.html_url);
        if (repo) {
          try {
            const prDetails = await ghFetch(`/repos/${repo}/pulls/${oldPr.number}`);
            if (prDetails && prDetails.merged) {
              const mergedBy = prDetails.merged_by ? ` by @${prDetails.merged_by.login}` : '';
              showNotification(
                `Pull Request Merged`,
                `#${oldPr.number}: ${oldPr.title}${mergedBy} in ${repo}`,
                'success',
                oldPr.html_url
              );
            }
          } catch (err) {
            console.error(`Error checking merge status for PR #${oldPr.number}:`, err);
          }
        }
      }
    }
    state.trackedOpenPrs = [...state.prs];

    // --- CHECK FOR COMPLETED PIPELINES (WORKFLOW RUNS) ---
    Object.keys(state.workflowRuns).forEach(repo => {
      const runs = state.workflowRuns[repo] || [];
      runs.forEach(run => {
        if (run.status === 'completed' && !state.notifiedRunIds.has(run.id)) {
          state.notifiedRunIds.add(run.id);
          const isSuccess = run.conclusion === 'success';
          const title = isSuccess ? 'Pipeline Succeeded' : 'Pipeline Failed';
          const type = isSuccess ? 'success' : 'danger';
          showNotification(
            title,
            `${run.name} (#${run.run_number}) for branch ${run.head_branch} in ${repo}`,
            type,
            run.html_url
          );
        }
      });
    });

    // --- CHECK FOR NEW SECURITY SCANS ALERTS ---
    state.securityAlerts.forEach(alert => {
      const alertId = alert.html_url || `${alert.repo}-${alert.id}`;
      if (!state.notifiedSecurityAlertIds.has(alertId)) {
        state.notifiedSecurityAlertIds.add(alertId);
        
        let alertDesc = '';
        if (alert.security_advisory && alert.security_advisory.summary) {
          alertDesc = alert.security_advisory.summary;
        } else if (alert.description) {
          alertDesc = alert.description;
        } else if (alert.rule && alert.rule.description) {
          alertDesc = alert.rule.description;
        } else {
          alertDesc = 'Vulnerability found';
        }

        showNotification(
          `Security Alert found (${alert.severity.toUpperCase()})`,
          `${alertDesc} in ${alert.repo}`,
          'warning',
          alert.html_url
        );
      }
    });
  }

  // --- HELPERS ---
  function getWorkflowStatusBadge(status, conclusion) {
    if (status === 'in_progress') {
      return '<span class="badge badge-warning"><i class="fa-solid fa-spinner fa-spin"></i> Running</span>';
    }
    if (status === 'queued') {
      return '<span class="badge badge-neutral"><i class="fa-solid fa-hourglass-start"></i> Queued</span>';
    }
    if (conclusion === 'success') {
      return '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Success</span>';
    }
    if (conclusion === 'failure') {
      return '<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> Failed</span>';
    }
    if (conclusion === 'cancelled') {
      return '<span class="badge badge-neutral"><i class="fa-solid fa-ban"></i> Cancelled</span>';
    }
    return `<span class="badge badge-neutral">${conclusion || status}</span>`;
  }

  function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  }

  let previousViewBeforeSearch = 'overview';

  function handleGlobalSearch(query) {
    if (!el.globalSearchInput || !el.btnClearSearch) return;

    if (query.length < 2) {
      el.btnClearSearch.style.display = 'none';
      
      // If we are currently showing search results, switch back to the previous view
      const activeSection = document.querySelector('.view-section.active');
      if (activeSection && activeSection.id === 'view-search-results') {
        showView(previousViewBeforeSearch);
      }
      return;
    }

    el.btnClearSearch.style.display = 'block';

    // Capture the current view if we aren't already on the search results view
    const activeSection = document.querySelector('.view-section.active');
    if (activeSection && activeSection.id !== 'view-search-results') {
      previousViewBeforeSearch = activeSection.id.replace('view-', '');
    }

    // Switch view to search results
    el.viewSections.forEach(section => {
      section.classList.remove('active');
    });
    
    const searchView = document.getElementById('view-search-results');
    if (searchView) {
      searchView.classList.add('active');
    }
    
    if (el.currentViewTitle) {
      el.currentViewTitle.textContent = 'Search Results';
    }
    
    if (el.searchQueryDisplay) {
      el.searchQueryDisplay.textContent = `"${query}"`;
    }

    // Perform Search
    const lowerQuery = query.toLowerCase();
    let totalMatches = 0;

    // 1. Search Repositories
    const matchingRepos = state.repos.filter(r => 
      (r.name && r.name.toLowerCase().includes(lowerQuery)) ||
      (r.full_name && r.full_name.toLowerCase().includes(lowerQuery)) ||
      (r.description && r.description.toLowerCase().includes(lowerQuery)) ||
      (r.language && r.language.toLowerCase().includes(lowerQuery))
    );
    
    if (matchingRepos.length > 0) {
      el.searchSectionRepos.style.display = 'block';
      el.searchReposTbody.innerHTML = matchingRepos.map(r => `
        <tr>
          <td><a href="${r.html_url}" target="_blank" class="repo-link" style="font-weight: 700;">${escapeHtml(r.name)}</a></td>
          <td style="font-size: 13px;">${escapeHtml(r.description || 'No description')}</td>
          <td><span class="badge badge-info">${escapeHtml(r.language || 'Plain Text')}</span></td>
          <td class="mono-text"><i class="fa-solid fa-star" style="color: var(--yellow);"></i> ${r.stargazers_count}</td>
        </tr>
      `).join('');
      totalMatches += matchingRepos.length;
    } else {
      el.searchSectionRepos.style.display = 'none';
      el.searchReposTbody.innerHTML = '';
    }

    // 2. Search Pull Requests
    const matchingPRs = state.prs.filter(pr => 
      (pr.title && pr.title.toLowerCase().includes(lowerQuery)) ||
      (pr.number && pr.number.toString().includes(lowerQuery)) ||
      (pr.body && pr.body.toLowerCase().includes(lowerQuery)) ||
      (pr.user && pr.user.login.toLowerCase().includes(lowerQuery)) ||
      (pr.repository_url && pr.repository_url.toLowerCase().includes(lowerQuery))
    );
    
    if (matchingPRs.length > 0) {
      el.searchSectionPrs.style.display = 'block';
      el.searchPrsTbody.innerHTML = matchingPRs.map(pr => {
        const repoName = pr.repository_url.split('/repos/')[1] || '';
        return `
          <tr>
            <td>
              <a href="${pr.html_url}" target="_blank" style="font-weight: 700;">#${pr.number} ${escapeHtml(pr.title)}</a>
              ${pr.draft ? '<span class="badge badge-secondary" style="margin-left: 6px;">Draft</span>' : ''}
            </td>
            <td class="mono-text">${escapeHtml(repoName)}</td>
            <td><img src="${pr.user.avatar_url}" style="width: 18px; height: 18px; border-radius: 50%; vertical-align: middle; margin-right: 6px;"> ${escapeHtml(pr.user.login)}</td>
            <td><span class="badge ${pr.state === 'open' ? 'badge-success' : 'badge-danger'}">${pr.state.toUpperCase()}</span></td>
            <td style="font-size: 12px; color: var(--fg-secondary);">${new Date(pr.created_at).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('');
      totalMatches += matchingPRs.length;
    } else {
      el.searchSectionPrs.style.display = 'none';
      el.searchPrsTbody.innerHTML = '';
    }

    // 3. Search Issues
    const matchingIssues = state.issues.filter(issue => 
      (issue.title && issue.title.toLowerCase().includes(lowerQuery)) ||
      (issue.number && issue.number.toString().includes(lowerQuery)) ||
      (issue.body && issue.body.toLowerCase().includes(lowerQuery)) ||
      (issue.user && issue.user.login.toLowerCase().includes(lowerQuery)) ||
      (issue.repository_url && issue.repository_url.toLowerCase().includes(lowerQuery))
    );
    
    if (matchingIssues.length > 0) {
      el.searchSectionIssues.style.display = 'block';
      el.searchIssuesTbody.innerHTML = matchingIssues.map(issue => {
        const repoName = issue.repository_url.split('/repos/')[1] || '';
        return `
          <tr>
            <td>
              <a href="${issue.html_url}" target="_blank" style="font-weight: 700;">#${issue.number} ${escapeHtml(issue.title)}</a>
            </td>
            <td class="mono-text">${escapeHtml(repoName)}</td>
            <td><span class="badge ${issue.state === 'open' ? 'badge-warning' : 'badge-success'}">${issue.state.toUpperCase()}</span></td>
            <td>${escapeHtml(issue.user.login)}</td>
            <td style="font-size: 12px; color: var(--fg-secondary);">${new Date(issue.created_at).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('');
      totalMatches += matchingIssues.length;
    } else {
      el.searchSectionIssues.style.display = 'none';
      el.searchIssuesTbody.innerHTML = '';
    }

    // 4. Search Workflow Runs (Pipelines)
    let allRuns = [];
    for (const repo in state.workflowRuns) {
      if (Array.isArray(state.workflowRuns[repo])) {
        allRuns = allRuns.concat(state.workflowRuns[repo]);
      }
    }
    
    const matchingRuns = allRuns.filter(run => 
      (run.name && run.name.toLowerCase().includes(lowerQuery)) ||
      (run.head_commit && run.head_commit.message && run.head_commit.message.toLowerCase().includes(lowerQuery)) ||
      (run.head_branch && run.head_branch.toLowerCase().includes(lowerQuery)) ||
      (run.repository && run.repository.name && run.repository.name.toLowerCase().includes(lowerQuery)) ||
      (run.status && run.status.toLowerCase().includes(lowerQuery))
    );
    
    if (matchingRuns.length > 0) {
      el.searchSectionWorkflows.style.display = 'block';
      el.searchWorkflowsTbody.innerHTML = matchingRuns.map(run => {
        let statusBadge = 'badge-secondary';
        if (run.status === 'completed') {
          statusBadge = run.conclusion === 'success' ? 'badge-success' : 'badge-danger';
        } else if (run.status === 'in_progress' || run.status === 'queued') {
          statusBadge = 'badge-info';
        }
        
        return `
          <tr>
            <td>
              <a href="${run.html_url}" target="_blank" style="font-weight: 700;">${escapeHtml(run.name)}</a>
              <div style="font-size: 11px; color: var(--fg-secondary); margin-top: 2px;">${escapeHtml(run.head_commit ? run.head_commit.message : '')}</div>
            </td>
            <td class="mono-text">${escapeHtml(run.repository ? run.repository.name : '')}</td>
            <td class="mono-text"><i class="fa-solid fa-code-branch" style="font-size: 11px;"></i> ${escapeHtml(run.head_branch)}</td>
            <td><span class="badge ${statusBadge}">${(run.conclusion || run.status).toUpperCase()}</span></td>
            <td>${escapeHtml(run.triggering_actor ? run.triggering_actor.login : 'system')}</td>
            <td style="font-size: 12px; color: var(--fg-secondary);">${new Date(run.created_at).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('');
      totalMatches += matchingRuns.length;
    } else {
      el.searchSectionWorkflows.style.display = 'none';
      el.searchWorkflowsTbody.innerHTML = '';
    }

    // Toggle "No Results" message
    if (totalMatches === 0) {
      el.searchNoResults.style.display = 'block';
    } else {
      el.searchNoResults.style.display = 'none';
    }
  }

  // --- COPILOT CHAT ASSISTANT FLOW ---
  function toggleCopilotChat() {
    if (!el.copilotChatPopup) return;
    
    const isOpening = !el.copilotChatPopup.classList.contains('active');
    el.copilotChatPopup.classList.toggle('active', isOpening);
    
    if (isOpening) {
      el.copilotChatInput.focus();
      initCopilotConnection();
    }
  }

  function loadAssistantSettings() {
    if (el.settingsCopilotProvider) {
      el.settingsCopilotProvider.value = localStorage.getItem('copilot_provider') || 'github-copilot';
    }
    if (el.settingsCopilotPat) {
      el.settingsCopilotPat.value = localStorage.getItem('gh_copilot_pat') || '';
    }
    if (el.settingsCopilotOllamaUrl) {
      el.settingsCopilotOllamaUrl.value = localStorage.getItem('copilot_ollama_url') || 'http://localhost:11434';
    }
    if (el.settingsCopilotOllamaModel) {
      el.settingsCopilotOllamaModel.value = localStorage.getItem('copilot_ollama_model') || 'llama3';
    }
  }

  async function initCopilotConnection() {
    if (!el.copilotStatusIndicator) return;
    
    // Set provider selection from local storage
    const provider = localStorage.getItem('copilot_provider') || 'github-copilot';
    if (el.copilotProviderSelect) {
      el.copilotProviderSelect.value = provider;
    }

    // Set settings values from local storage
    if (el.copilotPatInput) {
      el.copilotPatInput.value = localStorage.getItem('gh_copilot_pat') || '';
    }
    if (el.copilotOllamaUrl) {
      el.copilotOllamaUrl.value = localStorage.getItem('copilot_ollama_url') || 'http://localhost:11434';
    }
    if (el.copilotOllamaModel) {
      el.copilotOllamaModel.value = localStorage.getItem('copilot_ollama_model') || 'llama3';
    }

    if (provider === 'github') {
      const copilotToken = localStorage.getItem('gh_copilot_pat') || state.token;
      if (!copilotToken) {
        updateCopilotStatus('disconnected', 'Disconnected');
        return;
      }
      updateCopilotStatus('connected', 'Connected (GitHub Models)');
    } else if (provider === 'github-copilot') {
      const copilotToken = localStorage.getItem('gh_copilot_pat') || state.token;
      if (!copilotToken) {
        updateCopilotStatus('disconnected', 'Disconnected');
        return;
      }
      updateCopilotStatus('connected', 'Connected (GitHub Copilot)');
    } else if (provider === 'gitlab-duo') {
      updateCopilotStatus('connected', 'Connected (GitLab Duo)');
    } else if (provider === 'aws-q') {
      updateCopilotStatus('connected', 'Connected (AWS Q)');
    } else if (provider === 'ollama') {
      const url = localStorage.getItem('copilot_ollama_url') || 'http://localhost:11434';
      const model = localStorage.getItem('copilot_ollama_model') || 'llama3';
      try {
        updateCopilotStatus('loading', 'Checking Ollama...');
        const res = await fetch(`${url}/api/tags`);
        if (res.ok) {
          updateCopilotStatus('connected', `Ollama: ${model}`);
        } else {
          throw new Error('Ollama not responding');
        }
      } catch (err) {
        updateCopilotStatus('disconnected', 'Ollama Offline');
      }
    }
  }

  function updateCopilotStatus(status, text) {
    if (!el.copilotStatusIndicator) return;
    el.copilotStatusIndicator.className = 'copilot-status-indicator ' + status;
    el.copilotStatusIndicator.title = `Status: ${text}`;
  }

  function getCopilotSystemMessage() {
    const reposSummary = state.repos.slice(0, 10).map(r => `${r.full_name} (${r.stargazers_count} stars)`).join(', ');
    const prsSummary = state.prs.map(p => `#${p.number}: ${p.title} by @${p.user.login} (${p.draft ? 'Draft' : 'Open'})`).join('\n');
    const issuesSummary = state.issues.map(i => `#${i.number}: ${i.title} by @${i.user.login}`).join('\n');
    
    let runsSummary = [];
    Object.keys(state.workflowRuns).forEach(repo => {
      const runs = state.workflowRuns[repo] || [];
      runs.slice(0, 5).forEach(run => {
        runsSummary.push(`[${repo}] ${run.name} #${run.run_number} (${run.status}/${run.conclusion || 'running'})`);
      });
    });
    
    return `You are GitHub Copilot / Models Assistant integrated into Muninn, a developer dashboard.
You help Olaf manage his GitHub repositories, issues, PRs, and workflow runs.
Here is the current live state of the dashboard:
- Owner: @olafkfreund (Olaf Krasicki-Freund)
- Repositories loaded: ${reposSummary}
- Active Pull Requests (${state.prs.length} total):
${prsSummary || 'None'}
- Open Issues (${state.issues.length} total):
${issuesSummary || 'None'}
- Recent Workflow Runs/Jobs:
${runsSummary.slice(0, 10).join('\n') || 'None'}

Use this information to answer user questions about tasks, pull requests, issues, pipeline runs, and general repository status. Keep your responses helpful, concise, and formatted in Markdown.`;
  }

  async function sendCopilotMessage() {
    if (!el.copilotChatInput) return;
    const promptText = el.copilotChatInput.value.trim();
    if (!promptText) return;
    
    el.copilotChatInput.value = '';
    
    appendUserMessage(promptText);
    
    const responseId = 'copilot-response-' + Date.now();
    appendPlaceholderMessage(responseId);
    
    const provider = localStorage.getItem('copilot_provider') || 'github-copilot';
    
    if (provider === 'github') {
      try {
        updateCopilotStatus('loading', 'Thinking...');
        const systemMessage = getCopilotSystemMessage();
        const copilotToken = localStorage.getItem('gh_copilot_pat') || state.token;

        if (!copilotToken) {
          throw new Error('No GitHub token found. Please set a Personal Access Token in the dashboard or Copilot settings.');
        }
        
        const res = await fetch('https://models.github.ai/inference/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${copilotToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemMessage },
              { role: 'user', content: promptText }
            ],
            temperature: 0.2
          })
        });
        
        if (res.status === 403) {
          throw new Error('GitHub Models API returned status 403 Forbidden. Your token might not have permissions for GitHub Models. If you logged in via OAuth, please click the gear icon to set a dedicated classic Personal Access Token (PAT) with "repo" and "copilot" scopes.');
        } else if (!res.ok) {
          throw new Error('GitHub Models API returned status ' + res.status);
        }
        
        const data = await res.json();
        const answer = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : 'No response content';
        
        const placeholder = document.getElementById(responseId);
        if (placeholder) {
          placeholder.innerHTML = parseMarkdown(answer);
        }
        
        updateCopilotStatus('connected', 'Connected (GitHub Models)');
      } catch (err) {
        console.error(err);
        const placeholder = document.getElementById(responseId);
        if (placeholder) {
          placeholder.innerHTML = `<span style="color: var(--red);">${escapeHtml(err.message)}</span>`;
        }
        updateCopilotStatus('disconnected', 'Connection Error');
      }
    } else if (provider === 'github-copilot') {
      try {
        updateCopilotStatus('loading', 'Thinking (Copilot)...');
        const systemMessage = getCopilotSystemMessage();
        const githubToken = localStorage.getItem('gh_copilot_pat') || state.token;

        if (!githubToken) {
          throw new Error('No GitHub token found. Please set a Personal Access Token in Settings.');
        }

        // 1. Get Copilot short-lived token
        let copilotToken;
        try {
          const tokenRes = await fetch('https://api.github.com/copilot_internal/v2/token', {
            headers: {
              'Authorization': `token ${githubToken}`,
              'Accept': 'application/json'
            }
          });
          if (!tokenRes.ok) {
            throw new Error(`Status ${tokenRes.status}`);
          }
          const tokenData = await tokenRes.json();
          copilotToken = tokenData.token;
        } catch (tokenErr) {
          throw new Error('Failed to retrieve GitHub Copilot token. Make sure your account/organization has an active Copilot subscription. Details: ' + tokenErr.message);
        }

        // 2. Call Copilot Chat endpoint
        const completionsRes = await fetch('https://api.githubcopilot.com/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${copilotToken}`,
            'Content-Type': 'application/json',
            'Editor-Version': 'vscode/1.80.0'
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemMessage },
              { role: 'user', content: promptText }
            ],
            model: 'gpt-4o'
          })
        });

        if (!completionsRes.ok) {
          throw new Error(`Copilot Chat API returned status ${completionsRes.status}`);
        }

        const data = await completionsRes.json();
        const answer = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : 'No response content';

        const placeholder = document.getElementById(responseId);
        if (placeholder) {
          placeholder.innerHTML = parseMarkdown(answer);
        }
        updateCopilotStatus('connected', 'Connected (GitHub Copilot)');
      } catch (err) {
        console.error(err);
        const placeholder = document.getElementById(responseId);
        if (placeholder) {
          placeholder.innerHTML = `<span style="color: var(--red);">${escapeHtml(err.message)}</span>`;
        }
        updateCopilotStatus('disconnected', 'Copilot Error');
      }
    } else if (provider === 'gitlab-duo') {
      const placeholder = document.getElementById(responseId);
      if (placeholder) {
        placeholder.innerHTML = parseMarkdown(`Hello! I am your **GitLab Duo Assistant**.\n\nCurrently, direct integration with the GitLab Duo API is pending credential configuration. However, you can use **Ollama (Local LLM)** or **GitHub Copilot** to chat with your dashboard data!`);
      }
      updateCopilotStatus('connected', 'Connected (GitLab Duo)');
    } else if (provider === 'aws-q') {
      const placeholder = document.getElementById(responseId);
      if (placeholder) {
        placeholder.innerHTML = parseMarkdown(`Hello! I am your **AWS Q Assistant**.\n\nAWS Q integration is active via WebMCP. Since you are running locally, AWS Q commands utilize your local profile credentials.`);
      }
      updateCopilotStatus('connected', 'Connected (AWS Q)');
    } else if (provider === 'ollama') {
      try {
        updateCopilotStatus('loading', 'Ollama thinking...');
        const url = localStorage.getItem('copilot_ollama_url') || 'http://localhost:11434';
        const model = localStorage.getItem('copilot_ollama_model') || 'llama3';
        const systemMessage = getCopilotSystemMessage();
        
        const res = await fetch(`${url}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model,
            system: systemMessage,
            prompt: promptText,
            stream: false
          })
        });
        
        if (!res.ok) {
          throw new Error('Ollama returned status ' + res.status);
        }
        
        const data = await res.json();
        const answer = data.response || 'No response content';
        
        const placeholder = document.getElementById(responseId);
        if (placeholder) {
          placeholder.innerHTML = parseMarkdown(answer);
        }
        
        updateCopilotStatus('connected', `Ollama: ${model}`);
      } catch (err) {
        console.error(err);
        const placeholder = document.getElementById(responseId);
        if (placeholder) {
          placeholder.innerHTML = `<span style="color: var(--red);">Ollama Error: ${escapeHtml(err.message)}</span>`;
        }
        updateCopilotStatus('disconnected', 'Ollama Error');
      }
    }
    
    if (el.copilotChatBody) {
      el.copilotChatBody.scrollTop = el.copilotChatBody.scrollHeight;
    }
  }

  function appendUserMessage(text) {
    if (!el.copilotChatBody) return;
    const msg = document.createElement('div');
    msg.className = 'copilot-chat-msg copilot-chat-msg-user';
    msg.textContent = text;
    el.copilotChatBody.appendChild(msg);
    el.copilotChatBody.scrollTop = el.copilotChatBody.scrollHeight;
  }

  function appendBotMessage(text) {
    if (!el.copilotChatBody) return;
    const msg = document.createElement('div');
    msg.className = 'copilot-chat-msg copilot-chat-msg-bot';
    msg.innerHTML = parseMarkdown(text);
    el.copilotChatBody.appendChild(msg);
    el.copilotChatBody.scrollTop = el.copilotChatBody.scrollHeight;
  }

  function appendPlaceholderMessage(id) {
    if (!el.copilotChatBody) return;
    const msg = document.createElement('div');
    msg.className = 'copilot-chat-msg copilot-chat-msg-bot';
    msg.id = id;
    msg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Copilot is thinking...`;
    el.copilotChatBody.appendChild(msg);
    el.copilotChatBody.scrollTop = el.copilotChatBody.scrollHeight;
  }

  function clearCopilotChat() {
    if (!el.copilotChatBody) return;
    el.copilotChatBody.innerHTML = `
      <div class="copilot-chat-msg copilot-chat-msg-bot">
        <p>Hello! I am your GitHub Copilot Assistant.</p>
        <p>I have live access to your dashboard. Ask me about your repositories, open pull requests, issues, or failing workflows!</p>
      </div>
    `;
    initCopilotConnection();
  }

  function parseMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/```[a-zA-Z0-9]*\n([\s\S]+?)```/g, '<pre>$1</pre>');
    html = html.replace(/```([\s\S]+?)```/g, '<pre>$1</pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\s*[\*\-]\s+(.+)$/gm, '• $1');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
  }

  // --- GITHUB PROJECTS VIEW ---
  async function ghGraphQL(query, variables = {}) {
    const copilotToken = localStorage.getItem('gh_copilot_pat') || state.token;
    if (!copilotToken) {
      throw new Error('No GitHub token configured.');
    }
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });
    
    const result = await response.json();
    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL Error: ${result.errors.map(e => e.message).join(', ')}`);
    }
    return result.data;
  }

  async function loadProjectsView(forceRefresh = false) {
    const copilotToken = localStorage.getItem('gh_copilot_pat') || state.token;
    if (!copilotToken) {
      if (el.projectLoadingIndicator) {
        el.projectLoadingIndicator.style.display = 'block';
        el.projectLoadingIndicator.innerHTML = `
          <i class="fa-solid fa-key fa-2xl" style="color: var(--orange);"></i>
          <p style="margin-top: 12px;">Please connect your GitHub account to load projects.</p>
        `;
      }
      return;
    }

    if (state.projects && state.projects.length > 0 && !forceRefresh) {
      populateProjectsSelect();
      return;
    }

    if (el.projectLoadingIndicator) {
      el.projectLoadingIndicator.style.display = 'block';
      el.projectLoadingIndicator.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin fa-2xl" style="color: var(--blue);"></i>
        <p style="margin-top: 12px;">Fetching projects from your GitHub account...</p>
      `;
    }
    if (el.projectItemsContainer) el.projectItemsContainer.style.display = 'none';
    if (el.projectInfoCard) el.projectInfoCard.style.display = 'none';

    try {
      // 1. Fetch user personal projects
      const personalData = await ghGraphQL(`
        query {
          viewer {
            projectsV2(first: 50) {
              nodes {
                id
                title
                number
                shortDescription
                closed
              }
            }
          }
        }
      `);
      
      let allProjects = [];
      if (personalData && personalData.viewer && personalData.viewer.projectsV2) {
        allProjects = personalData.viewer.projectsV2.nodes.filter(p => !p.closed) || [];
      }

      // 2. Fetch organization-level projects if applicable
      const uniqueOrgs = new Set();
      if (state.repos) {
        state.repos.forEach(repo => {
          if (repo.owner && repo.owner.type === 'Organization') {
            uniqueOrgs.add(repo.owner.login);
          }
        });
      }

      for (const org of uniqueOrgs) {
        try {
          const orgData = await ghGraphQL(`
            query($orgLogin: String!) {
              organization(login: $orgLogin) {
                projectsV2(first: 50) {
                  nodes {
                    id
                    title
                    number
                    shortDescription
                    closed
                  }
                }
              }
            }
          `, { orgLogin: org });
          if (orgData && orgData.organization && orgData.organization.projectsV2) {
            const orgProjects = orgData.organization.projectsV2.nodes.filter(p => !p.closed) || [];
            allProjects = allProjects.concat(orgProjects);
          }
        } catch (orgErr) {
          console.warn(`Could not fetch projects for organization ${org}:`, orgErr);
        }
      }

      // Deduplicate by ID
      const seenIds = new Set();
      state.projects = allProjects.filter(p => {
        if (seenIds.has(p.id)) return false;
        seenIds.add(p.id);
        return true;
      });

      if (el.projectLoadingIndicator) el.projectLoadingIndicator.style.display = 'none';
      populateProjectsSelect();

    } catch (err) {
      console.error('Error loading projects:', err);
      if (el.projectLoadingIndicator) {
        el.projectLoadingIndicator.innerHTML = `
          <i class="fa-solid fa-circle-exclamation fa-2xl" style="color: var(--red);"></i>
          <p style="margin-top: 12px; color: var(--red);">Failed to load projects: ${escapeHtml(err.message)}</p>
          <p style="font-size: 11px; color: var(--fg-secondary);">Make sure your GitHub Token has the <code>project</code> scope enabled.</p>
        `;
      }
    }
  }

  function populateProjectsSelect() {
    if (!el.projectSelect) return;

    if (!state.projects || state.projects.length === 0) {
      el.projectSelect.innerHTML = '<option value="">No projects found</option>';
      if (el.projectLoadingIndicator) {
        el.projectLoadingIndicator.style.display = 'block';
        el.projectLoadingIndicator.innerHTML = `
          <i class="fa-solid fa-folder-open fa-2xl" style="color: var(--fg-secondary);"></i>
          <p style="margin-top: 12px;">No open Projects v2 found in your account.</p>
        `;
      }
      return;
    }

    const prevSelection = el.projectSelect.value;
    const options = state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.title)} (#${p.number})</option>`).join('');
    el.projectSelect.innerHTML = `<option value="">Select a project...</option>${options}`;

    if (prevSelection && state.projects.some(p => p.id === prevSelection)) {
      el.projectSelect.value = prevSelection;
      loadProjectDetails(prevSelection);
    }
  }

  async function loadProjectDetails(projectId) {
    if (el.projectLoadingIndicator) {
      el.projectLoadingIndicator.style.display = 'block';
      el.projectLoadingIndicator.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin fa-2xl" style="color: var(--blue);"></i>
        <p style="margin-top: 12px;">Loading project tasks...</p>
      `;
    }
    if (el.projectItemsContainer) el.projectItemsContainer.style.display = 'none';
    if (el.projectInfoCard) el.projectInfoCard.style.display = 'none';

    try {
      const data = await ghGraphQL(`
        query($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              title
              shortDescription
              fields(first: 50) {
                nodes {
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                    options {
                      id
                      name
                    }
                  }
                  ... on ProjectV2FieldCommon {
                    id
                    name
                    dataType
                  }
                }
              }
              items(first: 100) {
                nodes {
                  id
                  type
                  content {
                    ... on DraftIssue {
                      id
                      title
                      body
                    }
                    ... on Issue {
                      id
                      number
                      title
                      url
                      state
                      repository {
                        name
                        nameWithOwner
                      }
                    }
                    ... on PullRequest {
                      id
                      number
                      title
                      url
                      state
                      repository {
                        name
                        nameWithOwner
                      }
                    }
                  }
                  fieldValues(first: 20) {
                    nodes {
                      ... on ProjectV2ItemFieldTextValue {
                        text
                        field {
                          ... on ProjectV2FieldCommon {
                            id
                          }
                        }
                      }
                      ... on ProjectV2ItemFieldDateValue {
                        date
                        field {
                          ... on ProjectV2FieldCommon {
                            id
                          }
                        }
                      }
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        optionId
                        name
                        field {
                          ... on ProjectV2FieldCommon {
                            id
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `, { projectId });

      if (el.projectLoadingIndicator) el.projectLoadingIndicator.style.display = 'none';

      if (!data || !data.node) {
        throw new Error('Project not found or access denied.');
      }

      state.currentProject = data.node;
      renderProjectItems(projectId);

    } catch (err) {
      console.error('Error loading project details:', err);
      if (el.projectLoadingIndicator) {
        el.projectLoadingIndicator.innerHTML = `
          <i class="fa-solid fa-circle-exclamation fa-2xl" style="color: var(--red);"></i>
          <p style="margin-top: 12px; color: var(--red);">Failed to load project details: ${escapeHtml(err.message)}</p>
        `;
      }
    }
  }

  function renderProjectItems(projectId) {
    const project = state.currentProject;
    if (!project) return;

    if (el.projectInfoCard) {
      el.projectInfoCard.style.display = 'block';
      el.projectTitleHeader.textContent = project.title;
      el.projectDescHeader.textContent = project.shortDescription || 'No description provided.';
    }

    if (el.projectItemsContainer) {
      el.projectItemsContainer.style.display = 'block';
    }

    const statusField = project.fields.nodes.find(f => f.name === 'Status');
    const statusFieldId = statusField ? statusField.id : null;
    const statusOptions = statusField ? statusField.options || [] : [];

    if (!el.projectItemsTbody) return;

    if (!project.items.nodes || project.items.nodes.length === 0) {
      el.projectItemsTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--fg-secondary);">No items found in this project.</td>
        </tr>
      `;
      return;
    }

    el.projectItemsTbody.innerHTML = project.items.nodes.map(item => {
      const content = item.content || {};
      const type = item.type;
      
      let typeIcon = '';
      if (type === 'ISSUE') {
        typeIcon = '<i class="fa-solid fa-circle-dot" style="color: var(--green);" title="Issue"></i>';
      } else if (type === 'PULL_REQUEST') {
        typeIcon = '<i class="fa-solid fa-code-pull-request" style="color: var(--blue);" title="Pull Request"></i>';
      } else if (type === 'DRAFT_ISSUE') {
        typeIcon = '<i class="fa-solid fa-pen-to-square" style="color: var(--orange);" title="Draft Issue"></i>';
      }

      const title = content.title || 'Untitled';
      const url = content.url || '#';
      const repo = content.repository ? content.repository.nameWithOwner : (type === 'DRAFT_ISSUE' ? 'Draft' : 'N/A');

      let stateBadge = '';
      if (content.state) {
        const stateStr = content.state.toLowerCase();
        let badgeClass = 'badge-info';
        if (stateStr === 'open') badgeClass = 'badge-success';
        if (stateStr === 'closed') badgeClass = 'badge-danger';
        if (stateStr === 'merged') badgeClass = 'badge-primary';
        stateBadge = `<span class="badge ${badgeClass}">${content.state}</span>`;
      } else {
        stateBadge = `<span class="badge badge-warning">Draft</span>`;
      }

      let currentStatusValue = '';
      if (statusFieldId && item.fieldValues && item.fieldValues.nodes) {
        const statusVal = item.fieldValues.nodes.find(v => v.field && v.field.id === statusFieldId);
        if (statusVal) {
          currentStatusValue = statusVal.optionId || '';
        }
      }

      let statusSelector = '';
      if (statusFieldId && statusOptions.length > 0) {
        const optionsHtml = statusOptions.map(opt => 
          `<option value="${opt.id}" ${opt.id === currentStatusValue ? 'selected' : ''}>${escapeHtml(opt.name)}</option>`
        ).join('');
        statusSelector = `
          <select class="form-control project-status-select" 
                  data-item-id="${item.id}" 
                  data-field-id="${statusFieldId}"
                  style="margin: 0; padding: 4px 8px; font-size: 12px; height: auto; border: 2px solid var(--border-color); border-radius: 4px; outline: none; background-color: var(--bg-hard); color: var(--fg-primary);">
            <option value="">No Status</option>
            ${optionsHtml}
          </select>
        `;
      } else {
        statusSelector = `<span style="color: var(--fg-secondary); font-style: italic;">No status field</span>`;
      }

      return `
        <tr>
          <td style="text-align: center; width: 50px; font-size: 16px;">${typeIcon}</td>
          <td>
            <a href="${url}" target="_blank" class="repo-link" style="font-weight: bold; color: var(--fg-primary);">
              ${escapeHtml(title)}
            </a>
          </td>
          <td class="mono-text" style="font-size: 12px; color: var(--fg-secondary);">${escapeHtml(repo)}</td>
          <td>${stateBadge}</td>
          <td>${statusSelector}</td>
        </tr>
      `;
    }).join('');

    const selects = el.projectItemsTbody.querySelectorAll('.project-status-select');
    selects.forEach(select => {
      select.addEventListener('change', async function () {
        const itemId = this.getAttribute('data-item-id');
        const fieldId = this.getAttribute('data-field-id');
        const optionId = this.value;
        const itemName = this.closest('tr').querySelector('.repo-link').textContent.trim();
        const selectedText = this.options[this.selectedIndex].text;

        try {
          this.disabled = true;
          await updateProjectItemStatus(projectId, itemId, fieldId, optionId, itemName, selectedText);
        } catch (err) {
          showNotification('Project Update Error', `Failed to update status: ${err.message}`, 'danger');
          loadProjectDetails(projectId);
        } finally {
          this.disabled = false;
        }
      });
    });
  }

  async function updateProjectItemStatus(projectId, itemId, fieldId, optionId, itemName, optionName) {
    showNotification('Updating Task Status', `Moving '${itemName}' to '${optionName}'...`, 'info');
    
    await ghGraphQL(`
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: {
            singleSelectOptionId: $optionId
          }
        }) {
          projectV2Item {
            id
          }
        }
      }
    `, { projectId, itemId, fieldId, optionId });

    showNotification('Task Status Updated', `Successfully moved '${itemName}' to '${optionName}'!`, 'success');
  }

  // --- METRICS CALCULATION AND RENDERING ---
  async function calculateMetrics(forceRefresh = false) {
    if (!state.token) return;

    const needsFetch = forceRefresh || !state.metricsLoaded;
    if (needsFetch) {
      if (el.btnRefreshMetrics) {
        const icon = el.btnRefreshMetrics.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
      }
      if (el.metricLeadTime) el.metricLeadTime.innerHTML = '<i class="fa-solid fa-spinner fa-spin fa-xs"></i>';
      if (el.metricCycleTime) el.metricCycleTime.innerHTML = '<i class="fa-solid fa-spinner fa-spin fa-xs"></i>';
      if (el.metricPredictability) el.metricPredictability.innerHTML = '<i class="fa-solid fa-spinner fa-spin fa-xs"></i>';
    }

    try {
      if (needsFetch) {
        const owners = state.owners && state.owners.length > 0 ? state.owners : [state.user?.login || ''];
        
        // Fetch recently closed issues/PRs (Lead Time) across owners
        const closedPromises = owners.map(owner => 
          ghFetch(`/search/issues?q=is:closed+user:${owner}&per_page=50`).catch(() => ({ items: [] }))
        );
        const closedResults = await Promise.all(closedPromises);
        state.closedItems = closedResults.flatMap(res => res.items || []);
        state.closedTotalCount = closedResults.reduce((acc, res) => acc + (res.total_count || 0), 0);

        // Fetch recently merged PRs (Cycle Time) across owners
        const mergedPromises = owners.map(owner => 
          ghFetch(`/search/issues?q=is:pr+is:merged+user:${owner}&per_page=50`).catch(() => ({ items: [] }))
        );
        const mergedResults = await Promise.all(mergedPromises);
        state.mergedPrs = mergedResults.flatMap(res => res.items || []);

        state.metricsLoaded = true;
      }

      // 1. Lead Time Calculation
      let leadTimeStr = '0.0d';
      if (state.closedItems && state.closedItems.length > 0) {
        let totalMs = 0;
        let count = 0;
        state.closedItems.forEach(item => {
          if (item.closed_at && item.created_at) {
            const closed = Date.parse(item.closed_at);
            const created = Date.parse(item.created_at);
            if (closed >= created) {
              totalMs += (closed - created);
              count++;
            }
          }
        });
        if (count > 0) {
          const avgDays = totalMs / (1000 * 60 * 60 * 24 * count);
          leadTimeStr = avgDays.toFixed(1) + 'd';
        }
      }
      if (el.metricLeadTime) el.metricLeadTime.textContent = leadTimeStr;

      // 2. Cycle Time Calculation
      let cycleTimeStr = '0.0d';
      if (state.mergedPrs && state.mergedPrs.length > 0) {
        let totalMs = 0;
        let count = 0;
        state.mergedPrs.forEach(item => {
          if (item.closed_at && item.created_at) {
            const closed = Date.parse(item.closed_at);
            const created = Date.parse(item.created_at);
            if (closed >= created) {
              totalMs += (closed - created);
              count++;
            }
          }
        });
        if (count > 0) {
          const avgDays = totalMs / (1000 * 60 * 60 * 24 * count);
          cycleTimeStr = avgDays.toFixed(1) + 'd';
        }
      }
      if (el.metricCycleTime) el.metricCycleTime.textContent = cycleTimeStr;

      // 3. Test Automation Coverage (from slider/localStorage)
      const testCoverage = localStorage.getItem('metric_test_coverage') || '80';
      if (el.metricTestCoverage) el.metricTestCoverage.textContent = testCoverage + '%';

      // 4. Work Item Age Calculation
      let ageStr = '0.0d';
      const openItems = [...(state.prs || []), ...(state.issues || [])];
      if (openItems.length > 0) {
        let totalMs = 0;
        const now = Date.now();
        openItems.forEach(item => {
          const created = Date.parse(item.created_at);
          if (now >= created) {
            totalMs += (now - created);
          }
        });
        const avgDays = totalMs / (1000 * 60 * 60 * 24 * openItems.length);
        ageStr = avgDays.toFixed(1) + 'd';
      }
      if (el.metricItemAge) el.metricItemAge.textContent = ageStr;

      // 5. Delivery Predictability Calculation
      let predictabilityStr = '100%';
      const openCount = (state.prs ? state.prs.length : 0) + (state.issues ? state.issues.length : 0);
      const closedCount = state.closedTotalCount || 0;
      const totalCount = openCount + closedCount;
      if (totalCount > 0) {
        const ratio = (closedCount / totalCount) * 100;
        predictabilityStr = ratio.toFixed(0) + '%';
      }
      if (el.metricPredictability) el.metricPredictability.textContent = predictabilityStr;

      // 6. Blocked Time Calculation
      let blockedStr = '0%';
      if (openItems.length > 0) {
        let blockedCount = 0;
        openItems.forEach(item => {
          const hasBlockedLabel = item.labels && item.labels.some(label => {
            const name = label.name.toLowerCase();
            return name.includes('blocked') || name.includes('hold') || name.includes('wait') || name.includes('pending');
          });
          if (hasBlockedLabel) {
            blockedCount++;
          }
        });
        const ratio = (blockedCount / openItems.length) * 100;
        blockedStr = ratio.toFixed(0) + '%';
      }
      if (el.metricBlockedTime) el.metricBlockedTime.textContent = blockedStr;

      // 7. Defect Escape Rate
      const defectEscape = localStorage.getItem('metric_defect_escape') || '15';
      if (el.metricDefectEscape) el.metricDefectEscape.textContent = defectEscape + '%';

      // 8. Defect Root Cause Calculation
      let defectRootCount = 0;
      if (state.issues && state.issues.length > 0) {
        state.issues.forEach(issue => {
          const isBug = issue.labels && issue.labels.some(label => {
            const name = label.name.toLowerCase();
            return name.includes('bug') || name.includes('defect') || name.includes('error');
          });
          if (isBug) {
            defectRootCount++;
          }
        });
      }
      if (el.metricDefectRoot) el.metricDefectRoot.textContent = defectRootCount;

      // 9. Average Velocity
      const avgVelocity = localStorage.getItem('metric_avg_velocity') || '45';
      if (el.metricAvgVelocity) el.metricAvgVelocity.textContent = avgVelocity + ' SP';

      // 10. Change Failure Rate Calculation
      let failureRateStr = '0.0%';
      let totalRuns = 0;
      let failedRuns = 0;
      Object.keys(state.workflowRuns).forEach(repo => {
        const runs = state.workflowRuns[repo] || [];
        runs.forEach(run => {
          if (run.status === 'completed') {
            totalRuns++;
            if (run.conclusion === 'failure') {
              failedRuns++;
            }
          }
        });
      });
      if (totalRuns > 0) {
        const ratio = (failedRuns / totalRuns) * 100;
        failureRateStr = ratio.toFixed(1) + '%';
      }
      if (el.metricChangeFailure) el.metricChangeFailure.textContent = failureRateStr;

    } catch (err) {
      console.error('Error calculating metrics:', err);
    } finally {
      if (needsFetch && el.btnRefreshMetrics) {
        const icon = el.btnRefreshMetrics.querySelector('i');
        if (icon) {
          setTimeout(() => {
            icon.classList.remove('fa-spin');
          }, 500);
        }
      }
    }
  }

  // Toggle follow status for repository
  window.toggleFollowRepo = function(repoFullName) {
    const idx = state.followedRepos.indexOf(repoFullName);
    if (idx > -1) {
      state.followedRepos.splice(idx, 1);
      showNotification('Project Unfollowed', `Stopped tracking ${repoFullName}`, 'info');
    } else {
      state.followedRepos.push(repoFullName);
      showNotification('Project Tracked', `Now tracking ${repoFullName} for changes!`, 'success');
    }
    localStorage.setItem('gh_followed_repos', JSON.stringify(state.followedRepos));
    
    // Rerender
    renderStars();
    renderFollowedRepos();
    
    // Refresh to update monitored repos in background
    refreshDashboard();
  };

  // Render followed repos
  function renderFollowedRepos() {
    if (!el.followedReposGrid) return;
    
    const followedList = state.repos.filter(r => state.followedRepos.includes(r.full_name));
    
    if (followedList.length === 0) {
      el.followedReposGrid.style.display = 'none';
      const emptyState = document.getElementById('followed-empty-state');
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    
    const emptyState = document.getElementById('followed-empty-state');
    if (emptyState) emptyState.style.display = 'none';
    el.followedReposGrid.style.display = 'grid';
    
    el.followedReposGrid.innerHTML = followedList.map(repo => {
      // Find open PRs for this repo
      const repoPrsCount = state.prs.filter(pr => pr.repository_url?.endsWith(`/repos/${repo.full_name}`)).length;
      // Find open issues for this repo
      const repoIssuesCount = state.issues.filter(i => i.repository_url?.endsWith(`/repos/${repo.full_name}`)).length;
      
      // Find latest workflow run status
      const runs = state.workflowRuns[repo.full_name] || [];
      const latestRun = runs[0];
      let statusHtml = '<span class="badge badge-neutral">No Runs</span>';
      if (latestRun) {
        statusHtml = getWorkflowStatusBadge(latestRun.status, latestRun.conclusion);
      }
      
      return `
        <div class="card card-accent-blue" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 180px;">
          <div>
            <div class="flex-align" style="justify-content: space-between; margin-bottom: 8px;">
              <strong style="font-size: 15px;"><a href="${repo.html_url}" target="_blank">${repo.name}</a></strong>
              <button class="btn btn-sm btn-icon" onclick="toggleFollowRepo('${repo.full_name}')" style="color: var(--yellow);" title="Unfollow Project">
                <i class="fa-solid fa-bell"></i>
              </button>
            </div>
            <p class="card-desc" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 32px; margin-bottom: 12px;" title="${repo.description || 'No description'}">
              ${repo.description || 'No description provided.'}
            </p>
          </div>
          
          <div style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: auto;">
            <div class="flex-align" style="justify-content: space-between; font-size: 12px; color: var(--fg-secondary); margin-bottom: 8px;">
              <span>Language:</span>
              <span class="badge badge-neutral">${repo.language || 'N/A'}</span>
            </div>
            <div class="flex-align" style="justify-content: space-between; font-size: 12px; color: var(--fg-secondary); margin-bottom: 8px;">
              <span>Open PRs / Issues:</span>
              <span><strong>${repoPrsCount}</strong> PRs / <strong>${repoIssuesCount}</strong> Issues</span>
            </div>
            <div class="flex-align" style="justify-content: space-between; font-size: 12px; color: var(--fg-secondary);">
              <span>Latest Action Status:</span>
              ${statusHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Kickstart App
  document.addEventListener('DOMContentLoaded', init);
})();
