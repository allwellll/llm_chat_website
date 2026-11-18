import React, { useState, useRef, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ActiveChatHeader } from './components/ActiveChatHeader';
import { LandingView } from './components/LandingView';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { ArtifactViewer } from './components/ArtifactViewer';
import { ProjectsView } from './components/ProjectsView';
import { ArtifactsView } from './components/ArtifactsView';
import { ArtifactCategoryPicker } from './components/ArtifactCategoryPicker';
import { UpgradeView } from './components/UpgradeView';
import { CustomizeModal } from './components/CustomizeModal';
import { SearchModal } from './components/SearchModal';
import { useChat } from './context/ChatContext';
import { useSettings } from './context/SettingsContext';
import { useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';
import { ActivePageView } from './types';
import { ArrowDown, PanelLeftOpen, Plus } from 'lucide-react';

// Lazy load large views
const CustomizeView = React.lazy(() =>
  import('./components/CustomizeView').then((mod) => ({ default: mod.CustomizeView }))
);


const ClaudeWorkspace: React.FC = () => {
  const {
    activeConversation,
    activeConversationId,
    conversationLoadError,
    retryConversationLoad,
    createNewConversation,
    activePageView,
    setActivePageView,
    isArtifactPaneOpen,
    setIsArtifactPaneOpen,
    activeArtifact,
    isStreaming
  } = useChat();

  const { settings } = useSettings();

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // Default to open on desktop, closed on mobile
    return window.innerWidth >= 768;
  });
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [previousPageView, setPreviousPageView] = useState<ActivePageView>('chat');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  // Handle window resize - auto-close sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        // Don't force close if user explicitly opened it
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track previous view before navigating to upgrade
  const handleNavigateUpgrade = () => {
    if (activePageView !== 'upgrade') {
      setPreviousPageView(activePageView);
    }
    setActivePageView('upgrade');
  };

  const hasMessages = Boolean(activeConversation && activeConversation.messages.length > 0);

  // Auto-scroll to bottom on streaming or new messages
  useEffect(() => {
    if (activePageView === 'chat' && hasMessages && settings.autoScroll !== false) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages, isStreaming, activePageView, settings.autoScroll, hasMessages]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K for search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
      // Ctrl+Shift+, for settings
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ',') {
        e.preventDefault();
        // Settings handled in SettingsContext
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleScroll = () => {
    if (chatScrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatScrollContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
      setShowScrollBottom(!isNearBottom);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ─── FULL PAGE UPGRADE VIEW ───
  if (activePageView === 'upgrade') {
    return (
      <UpgradeView
        onBack={() => setActivePageView(previousPageView || 'chat')}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-claude-bg text-claude-text-primary font-sans antialiased selection:bg-[#DA7756]/30">
      {/* Left Navigation Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onOpenSearch={() => setIsSearchModalOpen(true)}
      />

      {/* Main Workspace Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-claude-bg">
        
        {/* One persistent mobile entry point, independent of the current view. */}
        <header className="md:hidden flex h-14 shrink-0 items-center justify-between gap-2 px-3 border-b border-claude-border-subtle bg-claude-bg">
          <button
            type="button"
            aria-label="打开会话菜单"
            aria-controls="conversation-sidebar"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen(open => !open)}
            className="flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-lg px-2 text-claude-text-primary hover:bg-claude-surface"
          >
            <PanelLeftOpen className="h-5 w-5" />
            <span className="text-sm">会话</span>
          </button>
          <span className="font-serif text-xl text-claude-text-primary">Claude</span>
          <button
            type="button"
            aria-label="新建会话"
            onClick={() => { createNewConversation(); setIsSidebarOpen(false); }}
            className="flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-claude-text-primary hover:bg-claude-surface"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm">新建</span>
          </button>
        </header>

        {/* Top Header for active chat */}
        {activePageView === 'chat' && hasMessages && (
          <ActiveChatHeader
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          />
        )}

        {/* Content Area */}
        <div className="flex-1 flex min-h-0 relative overflow-hidden">
          
          {/* Projects View */}
          {activePageView === 'projects' && <ProjectsView />}

          {/* Artifacts View */}
          {activePageView === 'artifacts' && <ArtifactsView />}

          {/* Code Workspace View */}
          {activePageView === 'code' && (
            <React.Suspense fallback={
              <div className="flex-1 flex items-center justify-center bg-claude-bg">
                <div className="text-sm text-claude-text-secondary">Loading Code Workspace...</div>
              </div>
            }>
              <div className="p-8 text-sm text-claude-text-secondary">Claude Code / terminal execution is not enabled. Use chat for coding assistance.</div>
            </React.Suspense>
          )}

          {/* Customize View */}
          {activePageView === 'customize' && (
            <React.Suspense fallback={
              <div className="flex-1 flex items-center justify-center">
                <div className="text-sm text-claude-text-secondary">Loading...</div>
              </div>
            }>
              <CustomizeView />
            </React.Suspense>
          )}

          {/* Chat View */}
          {activePageView === 'chat' && (
            <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
              {activeConversationId && !activeConversation ? (
                <div className="p-8 text-sm" role="alert">{conversationLoadError || '正在打开会话…'}</div>
              ) : activeConversation?._historyUnloaded ? (
                <div className="p-8 text-sm" role={conversationLoadError?'alert':'status'}>{conversationLoadError || '正在加载会话…'}{conversationLoadError && <button className="underline ml-3" onClick={retryConversationLoad}>重试</button>}</div>
              ) : !hasMessages ? (
                /* Landing / Empty Chat State or Artifact Starter Picker */
                activeConversation?.isArtifactPicker ? (
                  <div className="flex-1 overflow-y-auto flex flex-col justify-start">
                    <ArtifactCategoryPicker />
                  </div>
                ) : (
                  <LandingView
                    isSidebarOpen={isSidebarOpen}
                    onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                  />
                )
              ) : (
                /* Active Conversation */
                <>
                  <div
                    ref={chatScrollContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto pt-4 pb-36 px-2 sm:px-4"
                  >
                    {/* If artifact starter chat, show the category cards at the top */}
                    {activeConversation?.isArtifactPicker && (
                      <ArtifactCategoryPicker
                        compact={true}
                        selectedCategory={activeConversation.artifactCategory || activeConversation.title}
                      />
                    )}

                    {activeConversation?.messages.map((message, index) => (
                      <ChatMessage
                        key={message.id}
                        message={message}
                        isLast={index === (activeConversation.messages.length - 1)}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Scroll to bottom floating button */}
                  {showScrollBottom && (
                    <button
                      onClick={scrollToBottom}
                      className="absolute bottom-28 right-8 p-2 rounded-full bg-claude-surface hover:bg-claude-input border border-claude-border text-claude-text-secondary hover:text-claude-text-primary shadow-xl z-20 transition-all"
                      title="Scroll to bottom"
                      aria-label="Scroll to bottom"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  )}

                  {/* Bottom Sticky Composer */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-claude-bg via-claude-bg/95 to-transparent pt-8 pb-3 px-4 pointer-events-none">
                    <div className="pointer-events-auto">
                      <ChatInput compact />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Artifacts Split View Pane */}
          {isArtifactPaneOpen && activeArtifact && (
            <ArtifactViewer
              artifact={activeArtifact}
              onClose={() => setIsArtifactPaneOpen(false)}
            />
          )}

        </div>
      </div>

      {/* Global Search Modal (Ctrl+K) */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
      />

      {/* Settings Modal */}
      <CustomizeModal />
    </div>
  );
};

export const App: React.FC = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return <ClaudeWorkspace />;
};

