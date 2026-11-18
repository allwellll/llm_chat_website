import React, { useState, useEffect } from 'react';
import { Search, X, MessageSquare, Clock, ArrowRight } from 'lucide-react';
import { useChat } from '../context/ChatContext';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const { conversations, selectConversation, searchHistory } = useChat();
  const [query, setQuery] = useState('');
  const [resultIds,setResultIds]=useState<string[]>([]);
  const [next,setNext]=useState<string|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{let live=true;if(!isOpen)return;const timer=setTimeout(()=>{searchHistory(query).then(page=>{if(live){setResultIds(page.records.filter((r:any)=>r.kind==='conversation').map((r:any)=>r.id));setNext(page.next);setError('');}}).catch(()=>{if(live)setError('搜索失败，请修改关键词重试');});},250);return()=>{live=false;clearTimeout(timer);};},[query,isOpen]);


  // Handle ESC and Ctrl+K / Cmd+K to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset search query when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const matches = conversations.filter(conv=>resultIds.includes(conv.id)).map(conv=>({conv,snippet:''}));

  const handleSelect = (id: string) => {
    selectConversation(id);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/75 duration-75 cursor-default"
      role="dialog"
      aria-modal="true"
      aria-label="Search conversations"
    >
      <div
        className="w-full max-w-xl bg-claude-card border border-claude-border rounded-2xl shadow-2xl overflow-hidden select-none cursor-auto duration-75"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-claude-border-subtle">
          <Search className="w-4 h-4 text-claude-text-secondary mr-3 shrink-0" />
          <input
            type="text"
            placeholder="搜索所有会话标题…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm text-claude-text-primary placeholder-claude-text-muted focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-claude-text-muted hover:text-claude-text-primary transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="text-[10px] text-claude-text-muted hover:text-claude-text-primary font-mono px-1.5 py-0.5 rounded bg-claude-bg border border-claude-border-subtle transition-colors"
              title="Close search (ESC)"
            >
              ESC
            </button>
          )}
        </div>

        {error && <div role="alert" className="p-3">{error}</div>}
        {next && <button className="p-3 underline text-xs" onClick={()=>{void searchHistory(query,next).then(page=>{setResultIds(ids=>[...ids,...page.records.filter((r:any)=>r.kind==='conversation').map((r:any)=>r.id)]);setNext(page.next);}).catch(()=>setError('搜索失败，请重试'));}}>更多结果</button>}
        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {matches.length === 0 ? (
            <div className="py-8 text-center text-xs text-claude-text-muted">
              No matching conversations found for "{query}".
            </div>
          ) : (
            matches.map(({ conv, snippet }) => (
              <div
                key={conv.id}
                onClick={() => handleSelect(conv.id)}
                className="group flex items-start justify-between p-3 rounded-xl hover:bg-claude-surface cursor-pointer transition-colors"
              >
                <div className="space-y-1 overflow-hidden pr-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-[#DA7756] shrink-0" />
                    <span className="font-medium text-xs text-claude-text-primary group-hover:text-[#DA7756] transition-colors truncate">
                      {conv.title}
                    </span>
                  </div>
                  {snippet && (
                    <p className="text-[11px] text-claude-text-secondary line-clamp-1 pl-5">
                      {snippet}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-claude-text-muted shrink-0">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(conv.updatedAt).toLocaleDateString()}</span>
                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-[#DA7756] ml-1" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
