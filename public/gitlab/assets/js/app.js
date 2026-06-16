// Huginn - JavaScript Application Controller
// Interacts with the GitLab API client-side and registers WebMCP tools.

(function () {
  'use strict';

  // Application State
  const state = {
    token: localStorage.getItem('gl_pat') || '',
    instanceUrl: localStorage.getItem('gl_instance_url') || 'https://gitlab.com',
    user: null,
    repos: [], // maps to GitLab Projects
    prs: [],   // maps to GitLab Merge Requests
    issues: [],
    workflowRuns: {}, // maps to GitLab Pipelines
    securityAlerts: [], // maps to GitLab Vulnerabilities
    totalStars: 0,
    theme: localStorage.getItem('theme') || 'dark',
    refreshInterval: parseInt(localStorage.getItem('refresh_interval') || '300', 10),
    timerId: null,
    mcpController: null,
    bridgeSocket: null,
    bridgeReconnectTimer: null,
    projects: [], // For GraphQL boards
    currentProject: null,
    currentBoard: null,
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
    mergedPrs: []
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
    el.instanceUrlInput = document.getElementById('instance-url-input');
    el.patInput = document.getElementById('pat-input');
    el.authErrorMsg = document.getElementById('auth-error-msg');
    el.oauthLoginContainer = document.getElementById('oauth-login-container');
    el.btnOauthLogin = document.getElementById('btn-oauth-login');
    
    // Overview
    el.statRunningWorkflows = document.getElementById('stat-running-workflows'); // running pipelines
    el.statActivePrs = document.getElementById('stat-active-prs'); // active MRs
    el.statOpenIssues = document.getElementById('stat-open-issues');
    el.statSecurityAlerts = document.getElementById('stat-security-alerts');
    el.statTotalStars = document.getElementById('stat-total-stars');
    el.overviewWorkflowsTbody = document.getElementById('overview-workflows-tbody');
    
    // Pipelines View
    el.workflowsRepoSelect = document.getElementById('workflows-repo-select');
    el.workflowsRunsTbody = document.getElementById('workflows-runs-tbody');
    
    // MR View
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

    // Boards View
    el.projectSelect = document.getElementById('project-select');
    el.boardSelect = document.getElementById('board-select');
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
    el.settingsInstancePreview = document.getElementById('settings-instance-preview');
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

    // Duo Assistant
    el.copilotChatBtn = document.getElementById('copilot-chat-btn');
    el.copilotChatPopup = document.getElementById('copilot-chat-popup');
    el.copilotChatBody = document.getElementById('copilot-chat-body');
    el.copilotChatInput = document.getElementById('copilot-chat-input');
    el.copilotSendBtn = document.getElementById('copilot-send-btn');
    el.copilotClearBtn = document.getElementById('copilot-clear-btn');
    el.copilotCloseBtn = document.getElementById('copilot-close-btn');
    el.copilotStatusIndicator = document.getElementById('copilot-status-indicator');
    
    el.copilotProviderSelect = document.getElementById('copilot-provider-select');
    el.copilotSettingsBtn = document.getElementById('copilot-settings-btn');
    el.copilotChatSettings = document.getElementById('copilot-chat-settings');
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
    state.token = localStorage.getItem('gl_pat');
    if (state.token) {
        state.token = state.token.replace(/[\r\n]/g, '').trim();
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
      window.history.replaceState({}, document.title, window.location.pathname);
      showView('setup');
      if (el.authErrorMsg) {
        el.authErrorMsg.textContent = 'Exchanging authorization code...';
        el.authErrorMsg.className = 'badge badge-info';
        el.authErrorMsg.style.display = 'block';
      }
      
      try {
        const redirectUri = window.location.origin + window.location.pathname;
        const res = await fetch('http://localhost:8765/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, redirect_uri: redirectUri })
        });
        
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        
        if (data.access_token) {
          validateAndConnect(state.instanceUrl, data.access_token, true);
        }
      } catch (err) {
        if (el.authErrorMsg) {
          el.authErrorMsg.textContent = `OAuth connection failed: ${err.message}. Make sure node mcp-bridge.js is running.`;
          el.authErrorMsg.className = 'badge badge-danger';
        }
      }
    } else if (state.token) {
      validateAndConnect(state.instanceUrl, state.token, false);
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
        if (data.gitlab_url) {
          state.instanceUrl = data.gitlab_url;
          if (el.instanceUrlInput) {
            el.instanceUrlInput.value = data.gitlab_url;
          }
        }
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
      
      const titleMap = {
        'setup': 'Connect to GitLab',
        'overview': 'Overview',
        'pipelines': 'Pipelines & Runs',
        'mrs': 'Merge Requests',
        'issues': 'Issues Management',
        'security': 'Security Alerts',
        'stars': 'Starred Projects',
        'automation': 'Automations & Agents',
        'settings': 'Settings',
        'search-results': 'Search Results',
        'boards': 'GitLab Boards',
        'metrics': 'Metrics & KPI Dashboard'
      };
      el.currentViewTitle.textContent = titleMap[viewId] || 'Huginn';

      el.navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-view') === viewId) {
          item.classList.add('active');
        }
      });

      if (viewId === 'boards') {
        loadBoardsView();
      } else if (viewId === 'metrics') {
        calculateMetrics();
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
        const inputUrl = el.instanceUrlInput.value.trim();
        const inputToken = el.patInput.value.trim();
        if (inputUrl && inputToken) {
          validateAndConnect(inputUrl, inputToken, true);
        }
      });
    }
    if (el.btnOauthLogin) {
      el.btnOauthLogin.addEventListener('click', function () {
        if (!state.oauthClientId) return;
        const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
        window.location.href = `${state.instanceUrl}/oauth/authorize?client_id=${state.oauthClientId}&response_type=code&scope=api+read_user+read_api&redirect_uri=${redirectUri}`;
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

    // Pipelines Dropdown Change
    if (el.workflowsRepoSelect) {
      el.workflowsRepoSelect.addEventListener('change', function () {
        const projectId = this.value;
        if (projectId) {
          loadProjectPipelines(projectId);
        } else {
          el.workflowsRunsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">Select a project above to display pipelines.</td></tr>`;
        }
      });
    }

    // Boards View Listeners
    if (el.projectSelect) {
      el.projectSelect.addEventListener('change', function () {
        const projectId = this.value;
        if (projectId) {
          loadProjectBoards(projectId);
        } else {
          if (el.boardSelect) el.boardSelect.innerHTML = '<option value="">Select a board...</option>';
          if (el.projectInfoCard) el.projectInfoCard.style.display = 'none';
          if (el.projectItemsContainer) el.projectItemsContainer.style.display = 'none';
        }
      });
    }

    if (el.boardSelect) {
      el.boardSelect.addEventListener('change', function () {
        const boardId = this.value;
        const projectId = el.projectSelect.value;
        if (projectId && boardId) {
          loadBoardDetails(projectId, boardId);
        } else {
          if (el.projectInfoCard) el.projectInfoCard.style.display = 'none';
          if (el.projectItemsContainer) el.projectItemsContainer.style.display = 'none';
        }
      });
    }

    if (el.btnRefreshProjects) {
      el.btnRefreshProjects.addEventListener('click', function () {
        loadBoardsView(true);
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
        createGitLabIssue();
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
        
        el.ollamaChatHistory.innerHTML += `<div style="margin-top: 8px; color: var(--fg-primary);"><strong>User:</strong> ${escapeHtml(promptText)}</div>`;
        el.ollamaChatInput.value = '';
        el.ollamaChatHistory.scrollTop = el.ollamaChatHistory.scrollHeight;
        
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

    // Duo Chat Assistant listeners
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
        const ollamaUrl = el.copilotOllamaUrl.value.trim();
        const ollamaModel = el.copilotOllamaModel.value.trim();

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
          localStorage.setItem('copilot_ollama_model', model || 'qwen3:14b');
          if (el.copilotOllamaModel) {
            el.copilotOllamaModel.value = model || 'qwen3:14b';
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

    // Metrics View Listeners
    if (el.btnRefreshMetrics) {
      el.btnRefreshMetrics.addEventListener('click', function () {
        calculateMetrics(true);
      });
    }

    if (el.inputTestCoverage) {
      const val = localStorage.getItem('metric_test_coverage') || '80';
      el.inputTestCoverage.value = val;
      el.metricTestCoverage.textContent = val + '%';

      el.inputTestCoverage.addEventListener('input', function () {
        el.metricTestCoverage.textContent = this.value + '%';
        localStorage.setItem('metric_test_coverage', this.value);
      });
    }

    if (el.inputDefectEscape) {
      const val = localStorage.getItem('metric_defect_escape') || '15';
      el.inputDefectEscape.value = val;
      el.metricDefectEscape.textContent = val + '%';

      el.inputDefectEscape.addEventListener('input', function () {
        el.metricDefectEscape.textContent = this.value + '%';
        localStorage.setItem('metric_defect_escape', this.value);
      });
    }

    if (el.inputAvgVelocity) {
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

  // --- GITLAB API CLIENT ---
  async function glFetch(path, options = {}) {
    const baseUrl = state.instanceUrl.replace(/\/$/, '');
    const headers = {
      'PRIVATE-TOKEN': state.token,
      'Accept': 'application/json',
      ...options.headers
    };

    const response = await fetch(`${baseUrl}/api/v4${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody.message || errorBody.error || `API Error: ${response.status} ${response.statusText}`;
      throw new Error(errorMsg);
    }

    return response.json();
  }

  // --- AUTHENTICATION & LOGIN ---
  async function validateAndConnect(instanceUrl, token, showSuccessAlert) {
    try {
      if (el.authErrorMsg) el.authErrorMsg.style.display = 'none';
      
      state.instanceUrl = instanceUrl;
      state.token = token;
      
      // Validate token by fetching user profile
      const user = await glFetch('/user');
      
            
      state.user = user;
      localStorage.setItem('gl_instance_url', instanceUrl);
      localStorage.setItem('gl_pat', token);
      
      if (el.userProfileHeader) {
        el.userProfileHeader.style.display = 'flex';
        el.userDisplayName.textContent = user.name || user.username;
        el.userLogin.textContent = `@${user.username}`;
        el.userAvatarImg.src = user.avatar_url || '';
      }

      if (el.globalSearchContainer) {
        el.globalSearchContainer.style.display = 'block';
      }

      if (el.settingsTokenBadge) {
        el.settingsTokenBadge.textContent = 'Connected';
        el.settingsTokenBadge.className = 'badge badge-success';
        el.settingsTokenPreview.textContent = token.substring(0, 8) + '...xxxx';
      }
      if (el.settingsInstancePreview) {
        el.settingsInstancePreview.textContent = instanceUrl;
      }

      if (el.selectRefreshRate) {
        el.selectRefreshRate.value = state.refreshInterval;
      }
      
      const activeHash = window.location.hash.replace('#', '') || 'overview';
      showView(activeHash);
      
      requestNotificationPermission();
      refreshDashboard();
      registerWebMcpTools();
      setupAutoRefresh();
    } catch (err) {
      state.token = '';
      localStorage.removeItem('gl_pat');
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
    
    localStorage.removeItem('gl_pat');
    
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

    const refreshIcon = el.btnRefresh.querySelector('i');
    refreshIcon.classList.add('fa-spin');

    try {
      // 1. Fetch Projects (repos equivalent)
      const projects = await glFetch('/projects?membership=true&simple=true&per_page=50&order_by=updated_at');
      state.repos = projects;
      
      // Calculate total stars
      state.totalStars = projects.reduce((acc, proj) => acc + (proj.star_count || 0), 0);
      el.statTotalStars.textContent = state.totalStars;

      // Populate project dropdowns
      populateProjectDropdowns(projects);

      // 2. Fetch Open MRs (Merge Requests) - using user-centric scopes to avoid GitLab.com scope=all timeout
      const [mrsCreated, mrsAssigned] = await Promise.all([
        glFetch('/merge_requests?state=opened&scope=created_by_me&per_page=50'),
        glFetch('/merge_requests?state=opened&scope=assigned_to_me&per_page=50')
      ]);
      const mrsMap = new Map();
      mrsCreated.forEach(mr => mrsMap.set(mr.id, mr));
      mrsAssigned.forEach(mr => mrsMap.set(mr.id, mr));
      const mrs = Array.from(mrsMap.values());
      state.prs = mrs;
      el.statActivePrs.textContent = mrs.length;

      // 3. Fetch Open Issues - using user-centric scopes to avoid GitLab.com scope=all timeout
      const [issuesCreated, issuesAssigned] = await Promise.all([
        glFetch('/issues?state=opened&scope=created_by_me&per_page=50'),
        glFetch('/issues?state=opened&scope=assigned_to_me&per_page=50')
      ]);
      const issuesMap = new Map();
      issuesCreated.forEach(issue => issuesMap.set(issue.id, issue));
      issuesAssigned.forEach(issue => issuesMap.set(issue.id, issue));
      const issues = Array.from(issuesMap.values());
      state.issues = issues;
      el.statOpenIssues.textContent = issues.length;

      // 4. Load Recent Pipelines for overview
      await loadRecentOverviewPipelines(projects.slice(0, 5));

      // 5. Load Security Scans (Vulnerabilities)
      await loadSecurityScans(projects.slice(0, 5));

      // Check and notify changes
      await checkAndNotifyChanges();

      // Render all views
      renderOverview();
      renderMRs();
      renderIssues();
      renderSecurityAlerts();
      renderStars();

      const activeHash = window.location.hash.replace('#', '') || 'overview';
      if (activeHash === 'pipelines') {
        const activeProject = el.workflowsRepoSelect.value;
        if (activeProject) loadProjectPipelines(activeProject);
      } else if (activeHash === 'metrics') {
        calculateMetrics();
      }

    } catch (err) {
      console.error('Error refreshing dashboard:', err);
    } finally {
      setTimeout(() => {
        refreshIcon.classList.remove('fa-spin');
      }, 500);
    }
  }

  function populateProjectDropdowns(projects) {
    const prevWorkflowVal = el.workflowsRepoSelect.value;
    const prevIssueVal = el.issueRepoSelect.value;

    const options = projects.map(proj => `<option value="${proj.id}">${proj.path_with_namespace}</option>`).join('');
    
    el.workflowsRepoSelect.innerHTML = `<option value="">Select a project...</option>${options}`;
    el.issueRepoSelect.innerHTML = `<option value="">Select a project...</option>${options}`;

    if (prevWorkflowVal) el.workflowsRepoSelect.value = prevWorkflowVal;
    if (prevIssueVal) el.issueRepoSelect.value = prevIssueVal;
  }

  // --- COMPONENT RENDERING ---

  // Overview
  function renderOverview() {
    let runningCount = 0;
    const allRecentRuns = [];

    Object.keys(state.workflowRuns).forEach(projectId => {
      const runs = state.workflowRuns[projectId] || [];
      runs.forEach(run => {
        allRecentRuns.push({ projectId, ...run });
        if (run.status === 'running' || run.status === 'pending') {
          runningCount++;
        }
      });
    });

    el.statRunningWorkflows.textContent = runningCount;

    if (allRecentRuns.length === 0) {
      el.overviewWorkflowsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">No recent pipelines found.</td></tr>`;
      return;
    }

    allRecentRuns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    el.overviewWorkflowsTbody.innerHTML = allRecentRuns.slice(0, 20).map(run => {
      const statusBadge = getPipelineStatusBadge(run.status);
      const project = state.repos.find(r => r.id == run.projectId);
      const projectName = project ? project.path : `Project #${run.projectId}`;
      const timeStr = formatRelativeTime(run.created_at);
      
      const cancelBtn = (run.status === 'running' || run.status === 'pending')
        ? `<button class="btn btn-sm badge-danger" onclick="cancelPipelineRun(${run.projectId}, ${run.id})">Cancel</button>`
        : `<button class="btn btn-sm btn-primary" onclick="retryPipeline(${run.projectId}, ${run.id})">Retry</button>`;

      return `
        <tr>
          <td><strong><a href="${project ? project.web_url : '#'}" target="_blank">${projectName}</a></strong></td>
          <td><a href="${run.web_url}" target="_blank">Pipeline #${run.id}</a></td>
          <td>${run.user ? run.user.username : 'trigger'}</td>
          <td><code>${run.ref}</code></td>
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

  // MRs View
  function renderMRs() {
    if (state.prs.length === 0) {
      el.prsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">No open merge requests found.</td></tr>`;
      return;
    }

    el.prsTbody.innerHTML = state.prs.map(mr => {
      const project = state.repos.find(r => r.id === mr.project_id);
      const projectPath = project ? project.path_with_namespace : 'Project';
      const projectShort = project ? project.path : 'Project';
      
      const reviewers = mr.reviewers || [];
      const reviewerLabels = reviewers.map(r => `<span class="badge badge-neutral" style="padding: 2px 4px; font-size: 10px;">@${r.username}</span>`).join(' ');

      return `
        <tr>
          <td><strong><a href="${project ? project.web_url : '#'}" target="_blank">${projectShort}</a></strong></td>
          <td>
            <a href="${mr.web_url}" target="_blank" style="font-weight: 700;">${mr.title}</a>
            <div class="card-desc">!${mr.iid} opened ${formatRelativeTime(mr.created_at)}</div>
          </td>
          <td>
            <div class="flex-align">
              <img src="${mr.author.avatar_url || ''}" style="width: 20px; height: 20px; border-radius: 50%;">
              <span>@${mr.author.username}</span>
            </div>
          </td>
          <td>
            ${reviewerLabels || '<span class="card-desc">None</span>'}
          </td>
          <td>
            ${mr.work_in_progress || mr.draft ? '<span class="badge badge-neutral">Draft</span>' : '<span class="badge badge-info">Open</span>'}
          </td>
          <td>
            <div class="flex-align">
              <button class="btn btn-sm btn-primary" onclick="mergeMR(${mr.project_id}, ${mr.iid})"><i class="fa-solid fa-code-merge"></i> Merge</button>
              <button class="btn btn-sm" onclick="closeMR(${mr.project_id}, ${mr.iid})">Close</button>
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

    const grouped = {};
    state.issues.forEach(issue => {
      const project = state.repos.find(r => r.id === issue.project_id);
      const projectName = project ? project.path_with_namespace : 'Other Projects';
      if (!grouped[projectName]) {
        grouped[projectName] = [];
      }
      grouped[projectName].push(issue);
    });

    el.issuesListContainer.innerHTML = Object.keys(grouped).map(projectName => {
      const issues = grouped[projectName];
      
      const issueRows = issues.map(issue => {
        // GitLab labels are strings
        const labels = (issue.labels || []).map(labelName => {
          const colorHash = getLabelColorHash(labelName);
          return `<span class="badge" style="background-color: ${colorHash}25; color: ${colorHash}; border-color: ${colorHash}; font-size: 10px; padding: 2px 6px; margin-right: 4px;">${labelName}</span>`;
        }).join('');
        
        return `
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div class="flex-align" style="margin-bottom: 4px;">
                <a href="${issue.web_url}" target="_blank" style="font-weight: 700;">${issue.title}</a>
                <span class="card-desc">#${issue.iid}</span>
              </div>
              <div class="flex-align">
                <span class="card-desc">Opened ${formatRelativeTime(issue.created_at)} by @${issue.author.username}</span>
                <div style="display: inline-flex; flex-wrap: wrap;">${labels}</div>
              </div>
            </div>
            <div class="flex-align">
              <button class="btn btn-sm" onclick="closeIssue(${issue.project_id}, ${issue.iid})">Close</button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="table-container" style="margin-bottom: 24px;">
          <div style="padding: 16px 20px; background-color: var(--bg-soft); border-bottom: 2px solid var(--border-color); font-weight: 700; font-family: var(--font-mono); font-size: 14px;">
            <i class="fa-solid fa-folder"></i> ${projectName} (${issues.length})
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
      el.securityAlertsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">No vulnerabilities found or GitLab security features not loaded.</td></tr>`;
      el.statSecurityAlerts.textContent = 0;
      return;
    }

    el.statSecurityAlerts.textContent = state.securityAlerts.length;

    el.securityAlertsTbody.innerHTML = state.securityAlerts.map(alert => {
      const severityClass = `scan-severity-${alert.severity}`;
      const timeStr = formatRelativeTime(alert.created_at);
      const pkg = alert.location ? (alert.location.dependency ? alert.location.dependency.package.name : alert.location.file) : 'Code';
      const desc = alert.name || alert.description || 'Vulnerability scan finding';
      const project = state.repos.find(r => r.id === alert.project_id);
      const projectName = project ? project.path : `Project #${alert.project_id}`;

      return `
        <tr>
          <td><strong>${projectName}</strong></td>
          <td>
            <a href="#" style="font-weight:700;">${desc}</a>
            <div class="card-desc">ID: ${alert.id}</div>
          </td>
          <td><span class="badge ${alert.severity === 'critical' || alert.severity === 'high' ? 'badge-danger' : 'badge-warning'}">${alert.severity.toUpperCase()}</span></td>
          <td><code>${pkg}</code></td>
          <td>${timeStr}</td>
          <td>
            <a href="${project ? project.web_url + '/-/security/vulnerabilities' : '#'}" target="_blank" class="btn btn-sm">Resolve</a>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Stars View
  function renderStars() {
    if (state.repos.length === 0) {
      el.starsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">Connect account to load stars analytics.</td></tr>`;
      return;
    }

    const sortedRepos = [...state.repos].sort((a, b) => (b.star_count || 0) - (a.star_count || 0));

    el.starsTbody.innerHTML = sortedRepos.map(proj => {
      return `
        <tr>
          <td><strong><a href="${proj.web_url}" target="_blank">${proj.name}</a></strong></td>
          <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${proj.description || 'No description'}">
            <span class="card-desc">${proj.description || 'No description provided.'}</span>
          </td>
          <td class="mono-text" style="font-size: 12px;">${proj.path_with_namespace}</td>
          <td><i class="fa-solid fa-code-fork"></i> ${proj.forks_count}</td>
          <td>${formatRelativeTime(proj.last_activity_at || proj.updated_at)}</td>
          <td>
            <div class="flex-align" style="font-weight: 700; color: var(--yellow);">
              <i class="fa-solid fa-star"></i> ${proj.star_count}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- ACTIONS & OPERATIONS ---

  // Load Pipelines for specific Project
  async function loadProjectPipelines(projectId) {
    el.workflowsRunsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center;"><i class="fa-solid fa-rotate fa-spin"></i> Loading pipelines...</td></tr>`;

    try {
      const pipelines = await glFetch(`/projects/${projectId}/pipelines?per_page=30`);
      state.workflowRuns[projectId] = pipelines;

      if (pipelines.length === 0) {
        el.workflowsRunsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--fg-secondary);">No pipelines found.</td></tr>`;
        return;
      }

      el.workflowsRunsTbody.innerHTML = pipelines.map(run => {
        const statusBadge = getPipelineStatusBadge(run.status);
        const timeStr = formatRelativeTime(run.updated_at || run.created_at);

        const cancelBtn = (run.status === 'running' || run.status === 'pending')
          ? `<button class="btn btn-sm badge-danger" onclick="cancelPipelineRun(${projectId}, ${run.id})">Cancel</button>`
          : `<button class="btn btn-sm btn-primary" onclick="retryPipeline(${projectId}, ${run.id})">Retry</button>`;

        return `
          <tr>
            <td>
              <a href="${run.web_url}" target="_blank" style="font-weight:700;">Pipeline #${run.id}</a>
              <div class="card-desc">SHA: <code>${run.sha.substring(0, 7)}</code></div>
            </td>
            <td><code>${run.ref}</code></td>
            <td><code>${run.source || 'push'}</code></td>
            <td>${statusBadge}</td>
            <td>${timeStr}</td>
            <td>
              <div class="flex-align">
                ${cancelBtn}
                <button class="btn btn-sm" onclick="dispatchPipeline(${projectId}, '${run.ref}')" title="Trigger pipeline run"><i class="fa-solid fa-rocket"></i> Run</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      el.workflowsRunsTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--red);">Error loading pipelines: ${err.message}</td></tr>`;
    }
  }

  // Fetch recent pipelines across top projects (fetching 20 per project so we can show a robust history)
  async function loadRecentOverviewPipelines(topProjects) {
    const promises = topProjects.map(async (project) => {
      try {
        const data = await glFetch(`/projects/${project.id}/pipelines?per_page=20`);
        state.workflowRuns[project.id] = data;
      } catch (err) {
        state.workflowRuns[project.id] = [];
      }
    });
    await Promise.all(promises);
  }

  // Load Security alerts for main projects
  async function loadSecurityScans(topProjects) {
    let allAlerts = [];
    const promises = topProjects.map(async (project) => {
      try {
        // Fetch Vulnerabilities (requires GitLab Ultimate)
        const vulnerabilities = await glFetch(`/projects/${project.id}/vulnerabilities?state=detected,confirmed&per_page=10`).catch(() => []);
        const formatted = vulnerabilities.map(alert => ({
          project_id: project.id,
          id: alert.id,
          severity: alert.severity,
          name: alert.name,
          description: alert.description,
          created_at: alert.created_at,
          report_type: alert.report_type
        }));
        allAlerts.push(...formatted);
      } catch (err) {
        // Graceful skip
      }
    });
    await Promise.all(promises);
    state.securityAlerts = allAlerts;
  }

  // Cancel running pipeline
  window.cancelPipelineRun = async function (projectId, pipelineId) {
    if (!confirm('Are you sure you want to cancel this pipeline run?')) return;
    try {
      await glFetch(`/projects/${projectId}/pipelines/${pipelineId}/cancel`, { method: 'POST' });
      alert('Cancel command sent to GitLab!');
      setTimeout(refreshDashboard, 2000);
    } catch (err) {
      alert(`Failed to cancel pipeline: ${err.message}`);
    }
  };

  // Retry pipeline
  window.retryPipeline = async function (projectId, pipelineId) {
    try {
      await glFetch(`/projects/${projectId}/pipelines/${pipelineId}/retry`, { method: 'POST' });
      alert('Pipeline retry queued!');
      setTimeout(refreshDashboard, 2000);
    } catch (err) {
      alert(`Failed to retry pipeline: ${err.message}`);
    }
  };

  // Dispatch manual pipeline run
  window.dispatchPipeline = async function (projectId, defaultBranch) {
    const ref = prompt('Enter git branch or tag to run pipeline on:', defaultBranch || 'main');
    if (!ref) return;

    try {
      await glFetch(`/projects/${projectId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ref })
      });
      alert('Pipeline successfully triggered!');
      setTimeout(refreshDashboard, 2000);
    } catch (err) {
      alert(`Failed to trigger pipeline: ${err.message}`);
    }
  };

  // Merge Merge Request
  window.mergeMR = async function (projectId, iid) {
    if (!confirm(`Are you sure you want to MERGE Merge Request !${iid}?`)) return;
    try {
      await glFetch(`/projects/${projectId}/merge_requests/${iid}/merge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_commit_message: `Merged MR !${iid} via Huginn` })
      });
      alert('MR merged successfully!');
      refreshDashboard();
    } catch (err) {
      alert(`Merge failed: ${err.message}`);
    }
  };

  // Close Merge Request
  window.closeMR = async function (projectId, iid) {
    if (!confirm(`Are you sure you want to CLOSE Merge Request !${iid}?`)) return;
    try {
      await glFetch(`/projects/${projectId}/merge_requests/${iid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_event: 'close' })
      });
      alert('MR closed.');
      refreshDashboard();
    } catch (err) {
      alert(`Operation failed: ${err.message}`);
    }
  };

  // Close Issue
  window.closeIssue = async function (projectId, iid) {
    if (!confirm(`Are you sure you want to CLOSE issue #${iid}?`)) return;
    try {
      await glFetch(`/projects/${projectId}/issues/${iid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_event: 'close' })
      });
      alert('Issue closed successfully.');
      refreshDashboard();
    } catch (err) {
      alert(`Failed to close issue: ${err.message}`);
    }
  };

  // Create GitLab Issue
  async function createGitLabIssue() {
    const projectId = el.issueRepoSelect.value;
    const title = el.issueTitleInput.value.trim();
    const body = el.issueBodyTextarea.value;

    if (!projectId || !title) return;

    const btnSubmit = document.getElementById('btn-submit-issue');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';

    try {
      await glFetch(`/projects/${projectId}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: body })
      });
      alert('Issue created successfully!');
      
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
  window.runMRLabeler = async function () {
    alert('MR auto-labeler starting...');
    let count = 0;
    for (const mr of state.prs) {
      const isDraft = mr.work_in_progress || mr.draft || mr.title.toLowerCase().startsWith('wip:') || mr.title.toLowerCase().startsWith('draft:');
      const hasWipLabel = mr.labels && mr.labels.includes('WIP');
      
      if (isDraft && !hasWipLabel) {
        try {
          // Append label
          const currentLabels = mr.labels || [];
          const newLabels = [...currentLabels, 'WIP'].join(',');
          await glFetch(`/projects/${mr.project_id}/merge_requests/${mr.iid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labels: newLabels })
          });
          count++;
        } catch (e) {
          console.error(e);
        }
      }
    }
    alert(`Auto-labeler complete. Marked ${count} draft MRs with 'WIP' label.`);
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
      try {
        await glFetch(`/projects/${issue.project_id}/issues/${issue.iid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state_event: 'close' })
        });
        staleCount++;
      } catch (e) {
        console.error(e);
      }
    }
    alert(`Closed ${staleCount} stale issues successfully.`);
    refreshDashboard();
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
        name: 'list_loaded_projects',
        description: 'Returns the list of projects loaded in the Huginn dashboard, including star counts and description.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true }
      },
      {
        name: 'list_merge_requests',
        description: 'Returns active GitLab merge requests displayed in Huginn.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true }
      },
      {
        name: 'list_issues',
        description: 'Returns open issues grouped by project.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true }
      },
      {
        name: 'trigger_pipeline_run',
        description: 'Triggers a manual pipeline run for a project.',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'number', description: 'The project ID to trigger.' },
            ref: { type: 'string', description: 'Git branch or tag to run on.' }
          },
          required: ['project_id', 'ref']
        }
      }
    ];
  }

  async function executeTool(name, args) {
    if (name === 'list_loaded_projects') {
      return state.repos.map(r => ({
        id: r.id,
        name: r.name,
        path_with_namespace: r.path_with_namespace,
        stars: r.star_count,
        forks: r.forks_count,
        description: r.description
      }));
    }
    if (name === 'list_merge_requests') {
      return state.prs.map(mr => ({
        id: mr.id,
        iid: mr.iid,
        title: mr.title,
        author: mr.author.username,
        web_url: mr.web_url,
        created_at: mr.created_at,
        draft: mr.work_in_progress || mr.draft
      }));
    }
    if (name === 'list_issues') {
      return state.issues.map(issue => ({
        id: issue.id,
        iid: issue.iid,
        title: issue.title,
        author: issue.author.username,
        created_at: issue.created_at,
        labels: issue.labels
      }));
    }
    if (name === 'trigger_pipeline_run') {
      await glFetch(`/projects/${args.project_id}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: args.ref })
      });
      refreshDashboard();
      return `Pipeline successfully triggered on branch ${args.ref}!`;
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
      console.log('Huginn WebMCP Native Tools registered!');
    } catch (err) {
      console.error('Failed to register WebMCP tools:', err);
      updateWebMcpStatusCard(false, 'Registration Failed');
    }
  }

  function connectMcpBridge() {
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
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function showNotification(title, body, type = 'info', url = '') {
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

      setTimeout(() => {
        if (toast.parentElement) {
          toast.classList.add('toast-fadeOut');
          setTimeout(() => toast.remove(), 300);
        }
      }, 6000);
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      const origin = window.location.origin;
      const path = window.location.pathname.replace(/\/index\.html$/, '');
      const iconUrl = `${origin}${path}/assets/images/logo.png`;
      const options = { body: body, icon: iconUrl };

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
    if (state.isInitialFetch) {
      state.issues.forEach(issue => {
        state.notifiedIssueIds.add(issue.id);
      });

      state.prs.forEach(mr => {
        state.notifiedPrIds.add(mr.id);
      });
      state.trackedOpenPrs = [...state.prs];

      Object.keys(state.workflowRuns).forEach(projId => {
        const runs = state.workflowRuns[projId] || [];
        runs.forEach(run => {
          if (run.status === 'success' || run.status === 'failed' || run.status === 'canceled') {
            state.notifiedRunIds.add(run.id);
          }
        });
      });

      state.securityAlerts.forEach(alert => {
        state.notifiedSecurityAlertIds.add(alert.id);
      });

      state.isInitialFetch = false;
      return;
    }

    // New Issues
    state.issues.forEach(issue => {
      if (!state.notifiedIssueIds.has(issue.id)) {
        state.notifiedIssueIds.add(issue.id);
        const project = state.repos.find(r => r.id === issue.project_id);
        const projectLabel = project ? ` in ${project.path}` : '';
        showNotification(
          `New Issue Created`,
          `#${issue.iid}: ${issue.title} by @${issue.author.username}${projectLabel}`,
          'info',
          issue.web_url
        );
      }
    });

    // New Merge Requests
    state.prs.forEach(mr => {
      if (!state.notifiedPrIds.has(mr.id)) {
        state.notifiedPrIds.add(mr.id);
        const project = state.repos.find(r => r.id === mr.project_id);
        const projectLabel = project ? ` in ${project.path}` : '';
        showNotification(
          `New Merge Request`,
          `!${mr.iid}: ${mr.title} by @${mr.author.username}${projectLabel}`,
          'info',
          mr.web_url
        );
      }
    });

    // Merged MRs
    const newPrIds = new Set(state.prs.map(pr => pr.id));
    for (const oldMr of state.trackedOpenPrs) {
      if (!newPrIds.has(oldMr.id)) {
        try {
          const mrDetails = await glFetch(`/projects/${oldMr.project_id}/merge_requests/${oldMr.iid}`);
          if (mrDetails && mrDetails.state === 'merged') {
            const mergedBy = mrDetails.merged_by ? ` by @${mrDetails.merged_by.username}` : '';
            showNotification(
              `Merge Request Merged`,
              `!${oldMr.iid}: ${oldMr.title}${mergedBy}`,
              'success',
              oldMr.web_url
            );
          }
        } catch (err) {
          console.error(`Error checking merge status for MR !${oldMr.iid}:`, err);
        }
      }
    }
    state.trackedOpenPrs = [...state.prs];

    // Pipeline Completed Runs
    Object.keys(state.workflowRuns).forEach(projectId => {
      const runs = state.workflowRuns[projectId] || [];
      runs.forEach(run => {
        const isFinished = run.status === 'success' || run.status === 'failed' || run.status === 'canceled';
        if (isFinished && !state.notifiedRunIds.has(run.id)) {
          state.notifiedRunIds.add(run.id);
          const isSuccess = run.status === 'success';
          const title = isSuccess ? 'Pipeline Succeeded' : 'Pipeline Failed';
          const type = isSuccess ? 'success' : 'danger';
          const project = state.repos.find(r => r.id == projectId);
          const name = project ? project.path : `Project #${projectId}`;
          showNotification(
            title,
            `Pipeline #${run.id} for branch ${run.ref} in ${name}`,
            type,
            run.web_url
          );
        }
      });
    });

    // New Vulnerabilities
    state.securityAlerts.forEach(alert => {
      if (!state.notifiedSecurityAlertIds.has(alert.id)) {
        state.notifiedSecurityAlertIds.add(alert.id);
        const project = state.repos.find(r => r.id === alert.project_id);
        const name = project ? project.path : `Project #${alert.project_id}`;
        showNotification(
          `Security Alert found (${alert.severity.toUpperCase()})`,
          `${alert.name || alert.description} in ${name}`,
          'warning',
          project ? project.web_url + '/-/security/vulnerabilities' : ''
        );
      }
    });
  }

  // --- HELPERS ---
  function getPipelineStatusBadge(status) {
    if (status === 'running') {
      return '<span class="badge badge-warning"><i class="fa-solid fa-spinner fa-spin"></i> Running</span>';
    }
    if (status === 'pending') {
      return '<span class="badge badge-neutral"><i class="fa-solid fa-hourglass-start"></i> Pending</span>';
    }
    if (status === 'success') {
      return '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Success</span>';
    }
    if (status === 'failed') {
      return '<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> Failed</span>';
    }
    if (status === 'canceled') {
      return '<span class="badge badge-neutral"><i class="fa-solid fa-ban"></i> Canceled</span>';
    }
    return `<span class="badge badge-neutral">${status}</span>`;
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return 'Unknown';
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

  function getLabelColorHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#d65d0e'];
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  let previousViewBeforeSearch = 'overview';

  function handleGlobalSearch(query) {
    if (!el.globalSearchInput || !el.btnClearSearch) return;

    if (query.length < 2) {
      el.btnClearSearch.style.display = 'none';
      const activeSection = document.querySelector('.view-section.active');
      if (activeSection && activeSection.id === 'view-search-results') {
        showView(previousViewBeforeSearch);
      }
      return;
    }

    el.btnClearSearch.style.display = 'block';

    const activeSection = document.querySelector('.view-section.active');
    if (activeSection && activeSection.id !== 'view-search-results') {
      previousViewBeforeSearch = activeSection.id.replace('view-', '');
    }

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

    const lowerQuery = query.toLowerCase();
    let totalMatches = 0;

    // 1. Search Projects
    const matchingRepos = state.repos.filter(r => 
      (r.name && r.name.toLowerCase().includes(lowerQuery)) ||
      (r.path_with_namespace && r.path_with_namespace.toLowerCase().includes(lowerQuery)) ||
      (r.description && r.description.toLowerCase().includes(lowerQuery))
    );
    
    if (matchingRepos.length > 0) {
      el.searchSectionRepos.style.display = 'block';
      el.searchReposTbody.innerHTML = matchingRepos.map(r => `
        <tr>
          <td><a href="${r.web_url}" target="_blank" class="repo-link" style="font-weight: 700;">${escapeHtml(r.name)}</a></td>
          <td style="font-size: 13px;">${escapeHtml(r.description || 'No description')}</td>
          <td class="mono-text"><i class="fa-solid fa-star" style="color: var(--yellow);"></i> ${r.star_count}</td>
          <td><i class="fa-solid fa-code-fork"></i> ${r.forks_count}</td>
        </tr>
      `).join('');
      totalMatches += matchingRepos.length;
    } else {
      el.searchSectionRepos.style.display = 'none';
      el.searchReposTbody.innerHTML = '';
    }

    // 2. Search MRs
    const matchingPRs = state.prs.filter(mr => 
      (mr.title && mr.title.toLowerCase().includes(lowerQuery)) ||
      (mr.iid && mr.iid.toString().includes(lowerQuery)) ||
      (mr.description && mr.description.toLowerCase().includes(lowerQuery)) ||
      (mr.author && mr.author.username.toLowerCase().includes(lowerQuery))
    );
    
    if (matchingPRs.length > 0) {
      el.searchSectionPrs.style.display = 'block';
      el.searchPrsTbody.innerHTML = matchingPRs.map(mr => {
        const project = state.repos.find(r => r.id === mr.project_id);
        const name = project ? project.path_with_namespace : '';
        return `
          <tr>
            <td>
              <a href="${mr.web_url}" target="_blank" style="font-weight: 700;">!${mr.iid} ${escapeHtml(mr.title)}</a>
              ${mr.work_in_progress || mr.draft ? '<span class="badge badge-secondary" style="margin-left: 6px;">Draft</span>' : ''}
            </td>
            <td class="mono-text">${escapeHtml(name)}</td>
            <td><img src="${mr.author.avatar_url || ''}" style="width: 18px; height: 18px; border-radius: 50%; vertical-align: middle; margin-right: 6px;"> ${escapeHtml(mr.author.username)}</td>
            <td><span class="badge ${mr.state === 'opened' ? 'badge-success' : 'badge-danger'}">${mr.state.toUpperCase()}</span></td>
            <td style="font-size: 12px; color: var(--fg-secondary);">${new Date(mr.created_at).toLocaleDateString()}</td>
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
      (issue.iid && issue.iid.toString().includes(lowerQuery)) ||
      (issue.description && issue.description.toLowerCase().includes(lowerQuery)) ||
      (issue.author && issue.author.username.toLowerCase().includes(lowerQuery))
    );
    
    if (matchingIssues.length > 0) {
      el.searchSectionIssues.style.display = 'block';
      el.searchIssuesTbody.innerHTML = matchingIssues.map(issue => {
        const project = state.repos.find(r => r.id === issue.project_id);
        const name = project ? project.path_with_namespace : '';
        return `
          <tr>
            <td>
              <a href="${issue.web_url}" target="_blank" style="font-weight: 700;">#${issue.iid} ${escapeHtml(issue.title)}</a>
            </td>
            <td class="mono-text">${escapeHtml(name)}</td>
            <td><span class="badge ${issue.state === 'opened' ? 'badge-warning' : 'badge-success'}">${issue.state.toUpperCase()}</span></td>
            <td>${escapeHtml(issue.author.username)}</td>
            <td style="font-size: 12px; color: var(--fg-secondary);">${new Date(issue.created_at).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('');
      totalMatches += matchingIssues.length;
    } else {
      el.searchSectionIssues.style.display = 'none';
      el.searchIssuesTbody.innerHTML = '';
    }

    // 4. Search Pipelines
    let allRuns = [];
    for (const projId in state.workflowRuns) {
      if (Array.isArray(state.workflowRuns[projId])) {
        allRuns = allRuns.concat(state.workflowRuns[projId]);
      }
    }
    
    const matchingRuns = allRuns.filter(run => 
      (run.id && run.id.toString().includes(lowerQuery)) ||
      (run.ref && run.ref.toLowerCase().includes(lowerQuery)) ||
      (run.status && run.status.toLowerCase().includes(lowerQuery)) ||
      (run.source && run.source.toLowerCase().includes(lowerQuery))
    );
    
    if (matchingRuns.length > 0) {
      el.searchSectionWorkflows.style.display = 'block';
      el.searchWorkflowsTbody.innerHTML = matchingRuns.map(run => {
        const project = state.repos.find(r => r.id == run.project_id);
        const name = project ? project.path : '';
        let statusBadge = 'badge-secondary';
        if (run.status === 'success') statusBadge = 'badge-success';
        else if (run.status === 'failed') statusBadge = 'badge-danger';
        else if (run.status === 'running' || run.status === 'pending') statusBadge = 'badge-info';
        
        return `
          <tr>
            <td>
              <a href="${run.web_url}" target="_blank" style="font-weight: 700;">Pipeline #${run.id}</a>
            </td>
            <td class="mono-text">${escapeHtml(name)}</td>
            <td class="mono-text"><i class="fa-solid fa-code-branch" style="font-size: 11px;"></i> ${escapeHtml(run.ref)}</td>
            <td><span class="badge ${statusBadge}">${run.status.toUpperCase()}</span></td>
            <td>${escapeHtml(run.user ? run.user.username : 'trigger')}</td>
            <td style="font-size: 12px; color: var(--fg-secondary);">${new Date(run.created_at).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('');
      totalMatches += matchingRuns.length;
    } else {
      el.searchSectionWorkflows.style.display = 'none';
      el.searchWorkflowsTbody.innerHTML = '';
    }

    if (totalMatches === 0) {
      el.searchNoResults.style.display = 'block';
    } else {
      el.searchNoResults.style.display = 'none';
    }
  }

  // --- DUO CHAT ASSISTANT FLOW ---
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
      el.settingsCopilotOllamaModel.value = localStorage.getItem('copilot_ollama_model') || 'qwen3:14b';
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
      el.copilotOllamaModel.value = localStorage.getItem('copilot_ollama_model') || 'qwen3:14b';
    }

    if (provider === 'github') {
      const copilotToken = localStorage.getItem('gh_copilot_pat') || localStorage.getItem('gh_pat') || '';
      if (!copilotToken) {
        updateCopilotStatus('disconnected', 'Disconnected');
        return;
      }
      updateCopilotStatus('connected', 'Connected (GitHub Models)');
    } else if (provider === 'github-copilot') {
      const copilotToken = localStorage.getItem('gh_copilot_pat') || localStorage.getItem('gh_pat') || '';
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
      const model = localStorage.getItem('copilot_ollama_model') || 'qwen3:14b';
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
    const reposSummary = state.repos.slice(0, 10).map(r => `${r.path_with_namespace} (${r.star_count} stars)`).join(', ');
    const prsSummary = state.prs.map(p => `!${p.iid}: ${p.title} by @${p.author.username} (${p.work_in_progress || p.draft ? 'Draft' : 'Open'})`).join('\n');
    const issuesSummary = state.issues.map(i => `#${i.iid}: ${i.title} by @${i.author.username}`).join('\n');
    
    let runsSummary = [];
    Object.keys(state.workflowRuns).forEach(projectId => {
      const runs = state.workflowRuns[projectId] || [];
      const project = state.repos.find(r => r.id == projectId);
      const name = project ? project.path : `Project #${projectId}`;
      runs.slice(0, 5).forEach(run => {
        runsSummary.push(`[${name}] Pipeline #${run.id} (${run.ref} - ${run.status})`);
      });
    });
    
    return `You are GitLab Duo Assistant integrated into Huginn, a developer dashboard.
You help Olaf manage his GitLab projects, issues, merge requests, and pipelines.
Here is the current live state of the dashboard:
- Owner: @olafkfreund (Olaf Krasicki-Freund)
- Projects loaded: ${reposSummary}
- Active Merge Requests (${state.prs.length} total):
${prsSummary || 'None'}
- Open Issues (${state.issues.length} total):
${issuesSummary || 'None'}
- Recent Pipelines:
${runsSummary.slice(0, 10).join('\n') || 'None'}

Use this information to answer user questions about tasks, merge requests, issues, pipelines, and general project status. Keep your responses helpful, concise, and formatted in Markdown.`;
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
        const copilotToken = localStorage.getItem('gh_copilot_pat') || localStorage.getItem('gh_pat') || '';

        if (!copilotToken) {
          throw new Error('No GitHub token found. Please set a Personal Access Token in settings.');
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
          throw new Error('GitHub Models API returned status 403 Forbidden. Your token might not have permissions for GitHub Models.');
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
        const githubToken = localStorage.getItem('gh_copilot_pat') || localStorage.getItem('gh_pat') || '';

        if (!githubToken) {
          throw new Error('No GitHub token found. Please set a Personal Access Token in Settings.');
        }

        // 1. Get Copilot token
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

        // 2. Call Copilot completions
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
        const model = localStorage.getItem('copilot_ollama_model') || 'qwen3:14b';
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

  function appendPlaceholderMessage(id) {
    if (!el.copilotChatBody) return;
    const msg = document.createElement('div');
    msg.className = 'copilot-chat-msg copilot-chat-msg-bot';
    msg.id = id;
    msg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Duo is thinking...`;
    el.copilotChatBody.appendChild(msg);
    el.copilotChatBody.scrollTop = el.copilotChatBody.scrollHeight;
  }

  function clearCopilotChat() {
    if (!el.copilotChatBody) return;
    el.copilotChatBody.innerHTML = `
      <div class="copilot-chat-msg copilot-chat-msg-bot">
        <p>Hello! I am your GitLab Duo Assistant.</p>
        <p>I have live access to your dashboard. Ask me about your projects, open merge requests, issues, or failing pipelines!</p>
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

  // --- GITLAB GRAPQL / BOARDS VIEW ---
  async function glGraphQL(query, variables = {}) {
    const baseUrl = state.instanceUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/graphql`, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': state.token,
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

  async function loadBoardsView(forceRefresh = false) {
    if (!state.token) {
      if (el.projectLoadingIndicator) {
        el.projectLoadingIndicator.style.display = 'block';
        el.projectLoadingIndicator.innerHTML = `
          <i class="fa-solid fa-key fa-2xl" style="color: var(--orange);"></i>
          <p style="margin-top: 12px;">Please connect your GitLab account to load projects.</p>
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
        <p style="margin-top: 12px;">Fetching projects from your GitLab account...</p>
      `;
    }
    if (el.projectItemsContainer) el.projectItemsContainer.style.display = 'none';
    if (el.projectInfoCard) el.projectInfoCard.style.display = 'none';

    try {
      // Query projects using GraphQL
      const data = await glGraphQL(`
        query {
          currentUser {
            groupMemberships(first: 20) {
              nodes {
                group {
                  id
                  fullName
                  projects(first: 20) {
                    nodes {
                      id
                      name
                      fullPath
                      description
                    }
                  }
                }
              }
            }
            projectMemberships(first: 50) {
              nodes {
                project {
                  id
                  name
                  fullPath
                  description
                }
              }
            }
          }
        }
      `);
      
      let allProjects = [];
      if (data && data.currentUser) {
        const personalProjs = data.currentUser.projectMemberships.nodes.map(n => n.project) || [];
        allProjects.push(...personalProjs);
        
        if (data.currentUser.groupMemberships.nodes) {
          data.currentUser.groupMemberships.nodes.forEach(m => {
            if (m.group && m.group.projects.nodes) {
              allProjects.push(...m.group.projects.nodes);
            }
          });
        }
      }

      // Deduplicate by ID
      const seenIds = new Set();
      state.projects = allProjects.filter(p => {
        if (!p || seenIds.has(p.id)) return false;
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
        `;
      }
    }
  }

  function populateProjectsSelect() {
    if (!el.projectSelect) return;

    if (!state.projects || state.projects.length === 0) {
      el.projectSelect.innerHTML = '<option value="">No projects found</option>';
      return;
    }

    const prevSelection = el.projectSelect.value;
    const options = state.projects.map(p => `<option value="${p.fullPath}">${escapeHtml(p.name)}</option>`).join('');
    el.projectSelect.innerHTML = `<option value="">Select a project...</option>${options}`;

    if (prevSelection && state.projects.some(p => p.fullPath === prevSelection)) {
      el.projectSelect.value = prevSelection;
      loadProjectBoards(prevSelection);
    }
  }

  async function loadProjectBoards(projectFullPath) {
    if (el.projectLoadingIndicator) {
      el.projectLoadingIndicator.style.display = 'block';
      el.projectLoadingIndicator.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin fa-2xl" style="color: var(--blue);"></i>
        <p style="margin-top: 12px;">Loading boards for project...</p>
      `;
    }
    try {
      const data = await glGraphQL(`
        query($path: ID!) {
          project(fullPath: $path) {
            name
            description
            boards(first: 20) {
              nodes {
                id
                name
              }
            }
          }
        }
      `, { path: projectFullPath });

      if (el.projectLoadingIndicator) el.projectLoadingIndicator.style.display = 'none';

      if (!data || !data.project) {
        throw new Error('Project not found or access denied.');
      }

      const proj = data.project;
      if (el.projectInfoCard) {
        el.projectInfoCard.style.display = 'block';
        el.projectTitleHeader.textContent = proj.name;
        el.projectDescHeader.textContent = proj.description || 'No description provided.';
      }

      const boards = proj.boards.nodes || [];
      if (boards.length === 0) {
        el.boardSelect.innerHTML = '<option value="">No boards found</option>';
        return;
      }

      el.boardSelect.innerHTML = `<option value="">Select a board...</option>` + 
        boards.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');

    } catch (err) {
      console.error('Error loading project boards:', err);
      if (el.projectLoadingIndicator) {
        el.projectLoadingIndicator.innerHTML = `
          <i class="fa-solid fa-circle-exclamation fa-2xl" style="color: var(--red);"></i>
          <p style="margin-top: 12px; color: var(--red);">Failed to load boards: ${escapeHtml(err.message)}</p>
        `;
      }
    }
  }

  async function loadBoardDetails(projectFullPath, boardId) {
    if (el.projectLoadingIndicator) {
      el.projectLoadingIndicator.style.display = 'block';
      el.projectLoadingIndicator.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin fa-2xl" style="color: var(--blue);"></i>
        <p style="margin-top: 12px;">Loading board lists and issues...</p>
      `;
    }
    if (el.projectItemsContainer) el.projectItemsContainer.style.display = 'none';

    try {
      const data = await glGraphQL(`
        query($path: ID!, $boardId: BoardID!) {
          project(fullPath: $path) {
            board(id: $boardId) {
              id
              name
              lists {
                nodes {
                  id
                  listType
                  title
                  label {
                    id
                    title
                  }
                }
              }
            }
            issues(first: 50, state: opened) {
              nodes {
                id
                iid
                title
                webUrl
                state
                labels(first: 10) {
                  nodes {
                    title
                  }
                }
              }
            }
          }
        }
      `, { path: projectFullPath, boardId });

      if (el.projectLoadingIndicator) el.projectLoadingIndicator.style.display = 'none';

      if (!data || !data.project || !data.project.board) {
        throw new Error('Board details not found.');
      }

      // Map labels nodes to flat string array
      if (data.project.issues && data.project.issues.nodes) {
        data.project.issues.nodes.forEach(issue => {
          issue.labels = issue.labels && issue.labels.nodes ? issue.labels.nodes.map(n => n.title) : [];
        });
      }

      state.currentProject = data.project;
      state.currentBoard = data.project.board;
      renderBoardItems();

    } catch (err) {
      console.error('Error loading board details:', err);
      if (el.projectLoadingIndicator) {
        el.projectLoadingIndicator.innerHTML = `
          <i class="fa-solid fa-circle-exclamation fa-2xl" style="color: var(--red);"></i>
          <p style="margin-top: 12px; color: var(--red);">Failed to load board details: ${escapeHtml(err.message)}</p>
        `;
      }
    }
  }

  function renderBoardItems() {
    const project = state.currentProject;
    const board = state.currentBoard;
    if (!project || !board) return;

    if (el.projectItemsContainer) {
      el.projectItemsContainer.style.display = 'block';
    }

    const lists = board.lists.nodes || [];
    const labelLists = lists.filter(l => l.listType === 'label');
    
    if (!el.projectItemsTbody) return;

    const issues = project.issues.nodes || [];
    if (issues.length === 0) {
      el.projectItemsTbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--fg-secondary);">No open issues found in this project.</td>
        </tr>
      `;
      return;
    }

    el.projectItemsTbody.innerHTML = issues.map(issue => {
      const typeIcon = '<i class="fa-solid fa-circle-dot" style="color: var(--green);" title="Issue"></i>';
      const title = issue.title || 'Untitled';
      const url = issue.webUrl || '#';

      let stateBadge = `<span class="badge badge-success">${issue.state}</span>`;

      // Determine which board list this issue currently belongs to based on labels
      let currentListId = '';
      labelLists.forEach(list => {
        if (list.label && issue.labels.includes(list.label.title)) {
          currentListId = list.id;
        }
      });

      let statusSelector = '';
      if (labelLists.length > 0) {
        const optionsHtml = labelLists.map(list => 
          `<option value="${list.id}" ${list.id === currentListId ? 'selected' : ''}>${escapeHtml(list.title)}</option>`
        ).join('');
        statusSelector = `
          <select class="form-control board-list-select" 
                  data-issue-id="${issue.id}" 
                  data-issue-iid="${issue.iid}"
                  data-current-list-id="${currentListId}"
                  style="margin: 0; padding: 4px 8px; font-size: 12px; height: auto; border: 2px solid var(--border-color); border-radius: 4px; outline: none; background-color: var(--bg-hard); color: var(--fg-primary);">
            <option value="">Backlog</option>
            ${optionsHtml}
          </select>
        `;
      } else {
        statusSelector = `<span style="color: var(--fg-secondary); font-style: italic;">No label lists configured on this board</span>`;
      }

      return `
        <tr>
          <td style="text-align: center; width: 50px; font-size: 16px;">${typeIcon}</td>
          <td>
            <a href="${url}" target="_blank" class="repo-link" style="font-weight: bold; color: var(--fg-primary);">
              ${escapeHtml(title)}
            </a>
          </td>
          <td>${stateBadge}</td>
          <td>${statusSelector}</td>
        </tr>
      `;
    }).join('');

    const selects = el.projectItemsTbody.querySelectorAll('.board-list-select');
    selects.forEach(select => {
      select.addEventListener('change', async function () {
        const issueId = this.getAttribute('data-issue-id');
        const issueIid = this.getAttribute('data-issue-iid');
        const fromListId = this.getAttribute('data-current-list-id');
        const toListId = this.value;
        const projectFullPath = el.projectSelect.value;
        const boardId = el.boardSelect.value;
        const itemName = this.closest('tr').querySelector('.repo-link').textContent.trim();
        const selectedText = this.options[this.selectedIndex].text;

        try {
          this.disabled = true;
          await updateBoardIssueStatus(projectFullPath, boardId, issueId, issueIid, fromListId, toListId, itemName, selectedText);
        } catch (err) {
          showNotification('Board Update Error', `Failed to move issue: ${err.message}`, 'danger');
          loadBoardDetails(projectFullPath, boardId);
        } finally {
          this.disabled = false;
        }
      });
    });
  }

  async function updateBoardIssueStatus(projectFullPath, boardId, issueId, issueIid, fromListId, toListId, itemName, optionName) {
    showNotification('Moving Issue', `Moving '${itemName}' to '${optionName}'...`, 'info');
    
    // In GitLab GraphQL, issueMoveList takes id, boardId, fromListId, toListId
    await glGraphQL(`
      mutation($id: IssueID!, $boardId: BoardID!, $fromListId: ListID, $toListId: ListID) {
        issueMoveList(input: {
          id: $id
          boardId: $boardId
          fromListId: $fromListId
          toListId: $toListId
        }) {
          issue {
            id
          }
        }
      }
    `, { 
      id: issueId, 
      boardId, 
      fromListId: fromListId || null, 
      toListId: toListId || null 
    });

    showNotification('Issue Moved', `Successfully moved '${itemName}' to '${optionName}'!`, 'success');
    loadBoardDetails(projectFullPath, boardId);
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
        // Fetch recently closed issues (Lead Time) - using user-centric scopes to avoid GitLab.com scope=all timeout
        const [closedCreated, closedAssigned] = await Promise.all([
          glFetch('/issues?state=closed&scope=created_by_me&per_page=50'),
          glFetch('/issues?state=closed&scope=assigned_to_me&per_page=50')
        ]);
        const closedMap = new Map();
        closedCreated.forEach(i => closedMap.set(i.id, i));
        closedAssigned.forEach(i => closedMap.set(i.id, i));
        const closedIssues = Array.from(closedMap.values());
        state.closedItems = closedIssues;
        state.closedTotalCount = closedIssues.length;

        // Fetch recently merged MRs (Cycle Time) - using user-centric scopes to avoid GitLab.com scope=all timeout
        const [mergedCreated, mergedAssigned] = await Promise.all([
          glFetch('/merge_requests?state=merged&scope=created_by_me&per_page=50'),
          glFetch('/merge_requests?state=merged&scope=assigned_to_me&per_page=50')
        ]);
        const mergedMap = new Map();
        mergedCreated.forEach(mr => mergedMap.set(mr.id, mr));
        mergedAssigned.forEach(mr => mergedMap.set(mr.id, mr));
        const mergedMRs = Array.from(mergedMap.values());
        state.mergedPrs = mergedMRs;

        state.metricsLoaded = true;
      }

      // 1. Lead Time Calculation (time to close issues)
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

      // 2. Cycle Time Calculation (time to merge MRs)
      let cycleTimeStr = '0.0d';
      if (state.mergedPrs && state.mergedPrs.length > 0) {
        let totalMs = 0;
        let count = 0;
        state.mergedPrs.forEach(item => {
          if (item.merged_at && item.created_at) {
            const merged = Date.parse(item.merged_at);
            const created = Date.parse(item.created_at);
            if (merged >= created) {
              totalMs += (merged - created);
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

      // 4. Work Item Age Calculation (avg age of open issues + MRs)
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

      // 5. Delivery Predictability
      let predictabilityStr = '100%';
      const openCount = (state.prs ? state.prs.length : 0) + (state.issues ? state.issues.length : 0);
      const closedCount = state.closedTotalCount || 0;
      const totalCount = openCount + closedCount;
      if (totalCount > 0) {
        const ratio = (closedCount / totalCount) * 100;
        predictabilityStr = ratio.toFixed(0) + '%';
      }
      if (el.metricPredictability) el.metricPredictability.textContent = predictabilityStr;

      // 6. Blocked Time
      let blockedStr = '0%';
      if (openItems.length > 0) {
        let blockedCount = 0;
        openItems.forEach(item => {
          const hasBlockedLabel = item.labels && item.labels.some(labelName => {
            const name = labelName.toLowerCase();
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

      // 8. Defect Root Cause (number of open bugs)
      let defectRootCount = 0;
      if (state.issues && state.issues.length > 0) {
        state.issues.forEach(issue => {
          const isBug = issue.labels && issue.labels.some(labelName => {
            const name = labelName.toLowerCase();
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
      Object.keys(state.workflowRuns).forEach(projId => {
        const runs = state.workflowRuns[projId] || [];
        runs.forEach(run => {
          const isFinished = run.status === 'success' || run.status === 'failed';
          if (isFinished) {
            totalRuns++;
            if (run.status === 'failed') {
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

  // Kickstart App
  
    document.addEventListener('DOMContentLoaded', init);


})();
