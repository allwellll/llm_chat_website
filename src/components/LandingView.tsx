import React, { useState, useMemo } from 'react';
import { ClaudeStarburst } from './ClaudeIcons';
import { ChatInput } from './ChatInput';
import { useSettings } from '../context/SettingsContext';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { PROMPT_STARTERS } from '../services/mockData';
import { Sparkles, ArrowRight, X, GraduationCap, PenLine, Code2, Coffee, Lightbulb, PanelLeftOpen } from 'lucide-react';

interface LandingViewProps {
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  isSidebarOpen = true,
  onToggleSidebar
}) => {
  const { settings } = useSettings();
  const { sendMessage, setActivePageView } = useChat();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const userName = user?.name || settings.userName || 'Norbu';
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good morning, ${userName}`;
    if (hour < 17) return `Good afternoon, ${userName}`;
    return `Good evening, ${userName}`;
  }, [userName]);

  const categories = [
    { id: 'learn', label: 'Learn', icon: GraduationCap },
    { id: 'write', label: 'Write', icon: PenLine },
    { id: 'code', label: 'Code', icon: Code2 },
    { id: 'life', label: 'Life stuff', icon: Coffee },
    { id: 'choice', label: "Claude's choice", icon: Lightbulb }
  ];

  const currentCategoryTemplates = PROMPT_STARTERS.filter(
    (item) => item.category === activeCategory
  );

  const handleSelectPrompt = (promptText: string) => {
    sendMessage(promptText);
    setActiveCategory(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-claude-bg text-claude-text-primary select-none relative overflow-y-auto">
      
      {/* Top Left Sidebar Toggle Button when Collapsed */}
      {!isSidebarOpen && onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="hidden md:inline-flex fixed left-4 top-4 z-30 p-2 rounded-xl bg-claude-card hover:bg-claude-surface border border-claude-border text-claude-text-secondary hover:text-claude-text-primary shadow-lg transition-all"
          title="Open sidebar"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      )}

      {/* TOP CENTER PLAN INDICATOR */}
      <div className="pt-6 pb-2 flex items-center justify-center shrink-0">
        <button
          onClick={() => setActivePageView('upgrade')}
          className="flex items-center gap-1.5 text-xs text-claude-text-secondary hover:text-claude-text-primary transition-colors"
        >
          <span className="text-claude-text-primary font-medium">
            {user?.plan === 'max' ? 'Max plan' : user?.plan === 'team' ? 'Team plan' : user?.plan === 'free' ? 'Free plan' : 'Pro plan'}
          </span>
          {user?.plan !== 'max' && (
            <span className="text-[#3B82F6] hover:underline font-normal">· Upgrade</span>
          )}
        </button>
      </div>

      {/* CENTERED CONTENT AREA */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-12 max-w-3xl mx-auto w-full my-auto">
        
        {/* Center Greeting & Logo (matching Image 2) */}
        <div className="flex items-center gap-3.5 mb-8">
          <ClaudeStarburst size={38} color="#DA7756" />
          <h1 className="font-serif text-3xl sm:text-4xl text-claude-text-primary font-normal tracking-tight">
            {greeting}
          </h1>
        </div>

        {/* Centered Chat Composer */}
        <div className="w-full mb-4">
          <ChatInput />
        </div>

        {/* Prompt Starter Chips (matching Image 2) */}
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all border ${
                  activeCategory === cat.id
                    ? 'bg-claude-input border-[#DA7756]/50 text-claude-text-primary shadow-sm'
                    : 'bg-claude-card/80 hover:bg-claude-surface border-claude-border text-claude-text-secondary hover:text-claude-text-primary'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-claude-text-secondary" />
                <span className="font-normal">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Suggestion Templates Flyout */}
        {activeCategory && (
          <div className="mt-4 w-full max-w-2xl bg-claude-card border border-claude-border rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 relative">
            <div className="flex items-center justify-between pb-2 border-b border-claude-border-subtle mb-3">
              <span className="text-xs font-semibold text-claude-text-primary flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#DA7756]" />
                Prompts for {categories.find((c) => c.id === activeCategory)?.label}
              </span>
              <button
                onClick={() => setActiveCategory(null)}
                className="text-claude-text-muted hover:text-claude-text-primary p-1 rounded-md hover:bg-claude-surface"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentCategoryTemplates.map((template, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectPrompt(template.prompt)}
                  className="group p-3 rounded-xl bg-claude-bg border border-claude-border-subtle hover:border-[#DA7756]/60 hover:bg-claude-surface cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div>
                    <h4 className="text-xs font-medium text-claude-text-primary group-hover:text-[#DA7756] transition-colors leading-snug">
                      {template.title}
                    </h4>
                    <p className="text-[11px] text-claude-text-muted mt-1 line-clamp-2 leading-relaxed">
                      {template.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-end text-[11px] text-claude-text-secondary group-hover:text-[#DA7756] mt-2 pt-2 border-t border-claude-border-subtle">
                    <span className="font-medium mr-1">Use prompt</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
