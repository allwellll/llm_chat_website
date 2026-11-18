import React, { useState } from 'react';
import {
  ArrowLeft,
  MoreVertical,
  ChevronDown,
  Eye,
  Code2,
  Download,
  Trash2,
  Edit2,
  Check,
  Sparkles,
  Copy,
  AlertCircle
} from 'lucide-react';

export interface CustomSkillItem {
  id: string;
  type: 'skill' | 'connector' | 'plugin';
  name: string;
  badge?: string;
  author: string;
  description: string;
  timeAgo: string;
  isEnabled: boolean;
  instructions?: string;
  skillMdContent?: string;
}

interface SkillDetailViewProps {
  skill: CustomSkillItem;
  onBack: () => void;
  onUpdate: (updated: CustomSkillItem) => void;
  onDelete: (id: string) => void;
  onToggle: () => void;
}

export const SkillDetailView: React.FC<SkillDetailViewProps> = ({
  skill,
  onBack,
  onUpdate,
  onDelete,
  onToggle
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'contents'>('contents');
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const initialContent =
    skill.skillMdContent ||
    skill.instructions ||
    `# ${skill.name}

${skill.description}

## Ground rules — read these first

Check for required tools before executing workflows. When the user invokes this skill, format structured output according to Anthropic best practices.

### Instructions

1. Parse the user request thoroughly.
2. Formulate clear step-by-step logic.
3. Deliver high quality markdown responses.`;

  const [markdownContent, setMarkdownContent] = useState<string>(initialContent);

  const handleContentChange = (newContent: string) => {
    setMarkdownContent(newContent);
    onUpdate({
      ...skill,
      skillMdContent: newContent,
      instructions: newContent
    });
  };

  const handleDownload = () => {
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${skill.name.toLowerCase().replace(/\s+/g, '-')}-SKILL.md`;
    link.click();
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(markdownContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  // Basic Markdown Renderer for SKILL.md
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // H1
      if (line.startsWith('# ')) {
        return (
          <h1 key={idx} className="text-xl sm:text-2xl font-bold text-claude-text-primary mt-3 mb-4 tracking-tight">
            {line.replace('# ', '')}
          </h1>
        );
      }
      // H2
      if (line.startsWith('## ')) {
        return (
          <h2 key={idx} className="text-base sm:text-lg font-semibold text-claude-text-primary mt-6 mb-3 tracking-tight">
            {line.replace('## ', '')}
          </h2>
        );
      }
      // H3
      if (line.startsWith('### ')) {
        return (
          <h3 key={idx} className="text-sm font-semibold text-claude-text-primary mt-4 mb-2">
            {line.replace('### ', '')}
          </h3>
        );
      }
      // Empty line
      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }
      // List items
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ') || /^\d+\.\s/.test(line.trim())) {
        return (
          <div key={idx} className="flex items-start gap-2 pl-2 text-xs text-claude-text-primary leading-relaxed">
            <span className="text-[#DA7756] mt-0.5">•</span>
            <span>{parseInlineStyles(line.replace(/^[-•]\s+|^\d+\.\s+/, ''))}</span>
          </div>
        );
      }
      // Normal paragraph
      return (
        <p key={idx} className="text-xs text-claude-text-primary leading-relaxed">
          {parseInlineStyles(line)}
        </p>
      );
    });
  };

  // Helper for inline backticks, bold, links
  const parseInlineStyles = (content: string) => {
    const parts = content.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="font-mono text-[11px] text-[#DA7756] bg-claude-surface px-1.5 py-0.5 rounded border border-claude-border"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-claude-text-primary">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-claude-bg text-claude-text-primary overflow-y-auto select-none">
      <div className="max-w-5xl mx-auto w-full px-6 sm:px-8 py-6 space-y-5">
        
        {/* Back Link (matching Image 1) */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs text-claude-text-secondary hover:text-claude-text-primary transition-colors w-fit group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Skills</span>
        </button>

        {/* Skill Main Header Card (matching Image 1) */}
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-claude-card border border-claude-border-subtle flex items-center justify-center text-claude-text-secondary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M7 7h10" />
                <path d="M7 12h10" />
                <path d="M7 17h6" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-medium text-claude-text-primary font-mono">{skill.name}</h1>
                {skill.badge && (
                  <span className="text-[10.5px] text-claude-text-secondary bg-claude-surface px-2 py-0.5 rounded-md border border-claude-border">
                    {skill.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-claude-text-secondary mt-0.5">
                by {skill.author} · updated {skill.timeAgo}
              </p>
            </div>
          </div>

          {/* Right Action Switch + Options Menu */}
          <div className="flex items-center gap-3">
            {/* Blue Toggle Switch matching Image 1 */}
            <button
              role="switch"
              aria-checked={skill.isEnabled}
              onClick={onToggle}
              className={`w-10 h-5 rounded-full relative transition-colors p-0.5 ${
                skill.isEnabled ? 'bg-[#3B82F6]' : 'bg-claude-card-hover'
              }`}
            >
              <div
                className={`w-4 h-4 bg-white rounded-full transition-transform ${
                  skill.isEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>

            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1.5 rounded-lg text-claude-text-secondary hover:text-claude-text-primary hover:bg-claude-surface transition-colors"
                aria-label="Skill options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-claude-card border border-claude-border rounded-xl shadow-2xl p-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={handleDownload}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-claude-surface text-left text-claude-text-primary"
                  >
                    <Download className="w-3.5 h-3.5 text-claude-text-secondary" />
                    <span>Download SKILL.md</span>
                  </button>
                  <button
                    onClick={() => {
                      handleCopy();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-claude-surface text-left text-claude-text-primary"
                  >
                    <Copy className="w-3.5 h-3.5 text-claude-text-secondary" />
                    <span>{isCopied ? 'Copied!' : 'Copy raw content'}</span>
                  </button>
                  <div className="my-0.5 border-t border-claude-border-subtle" />
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsDeleteDialogOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-red-950/40 text-left text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete skill</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation (Overview / Contents · 1) */}
        <div className="flex items-center gap-6 border-b border-claude-border-subtle text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 transition-colors relative ${
              activeTab === 'overview'
                ? 'text-claude-text-primary'
                : 'text-claude-text-secondary hover:text-claude-text-primary'
            }`}
          >
            Overview
            {activeTab === 'overview' && (
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('contents')}
            className={`pb-2.5 transition-colors relative ${
              activeTab === 'contents'
                ? 'text-claude-text-primary'
                : 'text-claude-text-secondary hover:text-claude-text-primary'
            }`}
          >
            Contents · 1
            {activeTab === 'contents' && (
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white rounded-full" />
            )}
          </button>
        </div>

        {/* ─── TAB: OVERVIEW ─── */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-3xl pt-2">
            <div>
              <h3 className="text-xs font-medium text-claude-text-muted uppercase tracking-wider mb-2">Description</h3>
              <p className="text-sm text-claude-text-primary leading-relaxed">{skill.description}</p>
            </div>

            <div>
              <h3 className="text-xs font-medium text-claude-text-muted uppercase tracking-wider mb-2">Author & Source</h3>
              <p className="text-xs text-claude-text-primary">{skill.author}</p>
            </div>

            <div>
              <h3 className="text-xs font-medium text-claude-text-muted uppercase tracking-wider mb-2">Capabilities Included</h3>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-[#DA7756] bg-claude-surface px-2.5 py-1 rounded-lg border border-claude-border">
                  Custom Prompts
                </span>
                <span className="text-xs text-[#3B82F6] bg-claude-surface px-2.5 py-1 rounded-lg border border-claude-border">
                  Tool Integration
                </span>
                <span className="text-xs text-emerald-400 bg-claude-surface px-2.5 py-1 rounded-lg border border-claude-border">
                  Memory Sync
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: CONTENTS · 1 (matching Image 1) ─── */}
        {activeTab === 'contents' && (
          <div className="space-y-3">
            {/* Version dropdown button */}
            <div>
              <button className="px-3 py-1.5 rounded-xl bg-claude-card border border-claude-border-subtle text-xs text-claude-text-primary flex items-center gap-2 hover:bg-claude-surface transition-colors">
                <span>{skill.name} · current</span>
                <ChevronDown className="w-3.5 h-3.5 text-claude-text-secondary" />
              </button>
            </div>

            {/* Split Workspace Box */}
            <div className="flex flex-col md:flex-row rounded-2xl border border-claude-border-subtle bg-claude-bg min-h-[520px] overflow-hidden shadow-xl">
              
              {/* Left File Explorer Column */}
              <div className="w-full md:w-52 border-b md:border-b-0 md:border-r border-claude-border-subtle p-3 space-y-1 bg-claude-bg">
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-claude-surface text-claude-text-primary text-xs font-mono font-medium shadow-xs">
                  <span>SKILL.md</span>
                </div>
              </div>

              {/* Right Document / Editor Column */}
              <div className="flex-1 flex flex-col bg-claude-bg">
                
                {/* File Header Bar */}
                <div className="h-10 px-5 border-b border-claude-border-subtle flex items-center justify-between text-xs bg-claude-bg">
                  <span className="font-mono text-xs text-claude-text-secondary">/SKILL.md</span>

                  <div className="flex items-center bg-claude-card p-0.5 rounded-lg border border-claude-border-subtle">
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`p-1.5 rounded-md transition-colors ${
                        viewMode === 'preview'
                          ? 'bg-claude-input text-claude-text-primary shadow-xs'
                          : 'text-claude-text-secondary hover:text-claude-text-primary'
                      }`}
                      title="Preview formatted markdown"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('raw')}
                      className={`p-1.5 rounded-md transition-colors ${
                        viewMode === 'raw'
                          ? 'bg-claude-input text-claude-text-primary shadow-xs'
                          : 'text-claude-text-secondary hover:text-claude-text-primary'
                      }`}
                      title="Edit raw markdown"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Content Render Area */}
                <div className="flex-1 p-6 sm:p-8 overflow-y-auto max-h-[600px]">
                  {viewMode === 'raw' ? (
                    <div className="space-y-3 h-full">
                      <div className="text-[11px] text-claude-text-muted flex items-center justify-between">
                        <span>Editing mode · changes auto-save</span>
                        <button
                          onClick={handleCopy}
                          className="text-claude-text-secondary hover:text-claude-text-primary flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <textarea
                        value={markdownContent}
                        onChange={(e) => handleContentChange(e.target.value)}
                        className="w-full h-[450px] bg-claude-bg border border-claude-border-subtle rounded-xl p-4 text-claude-text-primary font-mono text-xs leading-relaxed outline-none focus:border-[#DA7756] resize-none"
                        placeholder="# Skill Name&#10;&#10;Write markdown instructions here..."
                      />
                    </div>
                  ) : (
                    <div className="space-y-4 max-w-3xl">
                      {renderMarkdown(markdownContent)}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-claude-card border border-claude-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h2 className="text-sm font-semibold text-claude-text-primary">Delete {skill.name}?</h2>
            </div>

            <p className="text-xs text-claude-text-secondary leading-relaxed">
              Are you sure you want to remove <strong className="text-claude-text-primary">{skill.name}</strong>? This action will permanently remove it from your skills list.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-claude-border-subtle">
              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(false)}
                className="px-4 py-2 rounded-xl text-claude-text-secondary hover:bg-claude-surface transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  onDelete(skill.id);
                }}
                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold shadow transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};