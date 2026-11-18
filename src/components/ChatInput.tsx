import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Globe,
  ArrowUp,
  Square,
  MicOff,
  X,
  FileCode,
  FileText,
  Sparkles
} from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useSettings } from '../context/SettingsContext';
import { Attachment } from '../types';
import { ModelSelectorDropdown } from './ModelSelectorDropdown';
import { AddContentDropdown } from './AddContentDropdown';
import { ClaudeMic, ClaudeWaveform } from './ClaudeIcons';

interface ChatInputProps {
  compact?: boolean;
  fullWidth?: boolean;
  forcePlaceholder?: string;
  hideQuickAnswer?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  compact = false,
  fullWidth = false,
  forcePlaceholder,
  hideQuickAnswer = false
}) => {
  const {
    sendMessage,
    isStreaming,
    stopGeneration,
    activeMode,
    setActiveMode,
    activeConversation
  } = useChat();

  const { settings, updateSettings } = useSettings();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const hasMessages = activeConversation && activeConversation.messages.length > 0;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Keyboard shortcut Ctrl+U for file upload
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleScreenshot = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

        stream.getTracks().forEach((track) => track.stop());

        const dataUrl = canvas.toDataURL('image/png');
        setAttachments((prev) => [
          ...prev,
          {
            id: `att-${Date.now()}-screenshot`,
            name: `Screenshot-${new Date().toLocaleTimeString().replace(/:/g, '-')}.png`,
            type: 'image/png',
            size: dataUrl.length,
            dataUrl
          }
        ]);
      } else {
        alert('Screen capture is not supported in this browser.');
      }
    } catch (err) {
      console.warn('Screenshot canceled or failed:', err);
    }
  };

  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput((prev) => (prev ? prev + ' ' + transcript : transcript));
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();

      if (file.type.startsWith('image/')) {
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            {
              id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl: reader.result as string
            }
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            {
              id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              type: file.type,
              size: file.size,
              textContent: reader.result as string
            }
          ]);
        };
        reader.readAsText(file);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = event.clipboardData;
    const supported = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    // Prefer items: the same file often appears in both items and files.
    const itemFiles = Array.from(clipboard.items || [])
      .filter(item => item.kind === 'file' && supported.has(item.type))
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null);
    const images = itemFiles.length ? itemFiles : Array.from(clipboard.files || []).filter(file => supported.has(file.type));
    if (!images.length) return;
    // Mixed text+image pastes retain the browser's normal text insertion.
    if (!clipboard.getData('text/plain')) event.preventDefault();
    images.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments(previous => [...previous, {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name || `pasted-image.${file.type.split('/')[1]}`,
          type: file.type,
          size: file.size,
          dataUrl: reader.result as string
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME confirmation belongs to the input method, not send/stop. Safari can
    // fire compositionend before its final keydown, which still has code 229.
    if (isComposingRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (isStreaming) {
      stopGeneration();
      return;
    }

    if (!input.trim() && attachments.length === 0) return;

    sendMessage(input, attachments);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const isReadyToSend = Boolean(input.trim() || attachments.length > 0);

  return (
    <div className={`w-full relative transition-all ${fullWidth ? 'w-full' : compact ? 'max-w-3xl mx-auto' : 'max-w-2xl mx-auto'}`}>
      
      {/* Floating suggestion chip above prompt bar when in active chat */}
      {hasMessages && !hideQuickAnswer && (
        <div className="flex justify-center mb-2.5">
          <button
            type="button"
            onClick={() => setInput('Can you provide a quick answer?')}
            className="px-3 py-1 rounded-full bg-claude-card hover:bg-claude-surface border border-claude-border text-[11px] font-medium text-claude-text-secondary hover:text-claude-text-primary shadow-sm transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3 text-[#DA7756]" />
            <span>Quick answer</span>
          </button>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*,.js,.jsx,.ts,.tsx,.html,.css,.json,.py,.java,.c,.cpp,.rs,.go,.md,.txt,.pdf,.csv"
      />

      {/* Main Input Box Card (matching Claude exact geometry) */}
      <div className="bg-claude-card rounded-[22px] border border-claude-border hover:border-claude-border focus-within:border-claude-border transition-all shadow-md">
        
        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-0">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-claude-bg border border-claude-border text-xs text-claude-text-primary max-w-xs"
              >
                {att.dataUrl ? (
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="w-7 h-7 object-cover rounded border border-claude-border"
                  />
                ) : att.name.endsWith('.js') || att.name.endsWith('.ts') || att.name.endsWith('.py') ? (
                  <FileCode className="w-4 h-4 text-[#DA7756]" />
                ) : (
                  <FileText className="w-4 h-4 text-claude-text-secondary" />
                )}
                <span className="truncate text-xs">{att.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="ml-1 text-claude-text-muted hover:text-red-400 p-0.5 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Area */}
        <div className="px-4 pt-3.5 pb-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onBlur={() => { isComposingRef.current = false; }}
            onKeyDown={handleKeyDown}
            placeholder={forcePlaceholder || (hasMessages ? 'Write a message...' : 'How can I help you today?')}
            className="w-full bg-transparent text-claude-text-primary placeholder-claude-text-muted text-[14.5px] resize-none focus:outline-none leading-relaxed font-sans max-h-[220px]"
          />
        </div>

        {/* Bottom Action Bar (Seamless without harsh dividing border) */}
        <div className="composer-toolbar flex items-center justify-between px-3 pb-2.5 pt-1">
          
          {/* Left Actions: + and Mode toggle */}
          <div className="composer-tools flex items-center gap-2 relative">
            
            {/* The "+" Button with AddContentDropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                className={`p-1.5 rounded-lg transition-colors border ${
                  isAddMenuOpen
                    ? 'bg-claude-input text-claude-text-primary border-claude-border'
                    : 'text-claude-text-secondary hover:text-claude-text-primary hover:bg-claude-surface border-transparent'
                }`}
                title="Add content, screenshot, or skills (Ctrl+U)"
              >
                <Plus className="w-4 h-4" />
              </button>

              <AddContentDropdown
                isOpen={isAddMenuOpen}
                onClose={() => setIsAddMenuOpen(false)}
                onUploadClick={() => fileInputRef.current?.click()}
                onScreenshotCapture={handleScreenshot}
              />
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.webSearch === true}
              aria-label="网页检索"
              onClick={() => updateSettings({ webSearch: settings.webSearch !== true })}
              className={`composer-search px-2 py-1 rounded-lg text-xs transition-colors ${settings.webSearch === true ? 'bg-[#DA7756]/20 text-[#DA7756]' : 'text-claude-text-secondary bg-claude-surface'}`}
              title="关闭后，本次及后续请求不携带 Web Search 工具；选择会保存在当前浏览器"
            >
              <Globe className="composer-search-icon hidden w-4 h-4" aria-hidden="true" />
              <span className="composer-search-label">🌐 网页检索 {settings.webSearch === true ? '开' : '关'}</span>
            </button>
            {/* Chat / Cowork Mode Toggle (only on landing page) */}
            {!hasMessages && (
              <div className="composer-modes flex items-center bg-claude-bg p-0.5 rounded-lg border border-claude-border-subtle text-xs">
                <button
                  type="button"
                  onClick={() => setActiveMode('chat')}
                  className={`px-2.5 py-1 rounded-md transition-all font-normal ${
                    activeMode === 'chat'
                      ? 'bg-claude-input text-claude-text-primary shadow-sm'
                      : 'text-claude-text-secondary hover:text-claude-text-primary'
                  }`}
                >
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('cowork')}
                  className={`px-2.5 py-1 rounded-md transition-all font-normal ${
                    activeMode === 'cowork'
                      ? 'bg-claude-input text-claude-text-primary shadow-sm'
                      : 'text-claude-text-secondary hover:text-claude-text-primary'
                  }`}
                >
                  Cowork
                </button>
              </div>
            )}
          </div>

          {/* Right Actions: Model selector, Mic, Waveform, Send */}
          <div className="composer-send-actions flex items-center gap-1.5 relative">
            
            {/* Model Selector */}
            <ModelSelectorDropdown />

            {/* Voice Dictation (Mic) */}
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={`p-1.5 rounded-lg transition-colors ${
                isListening
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                  : 'text-claude-text-secondary hover:text-claude-text-primary hover:bg-claude-surface'
              }`}
              title={isListening ? 'Stop listening' : 'Voice dictation'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <ClaudeMic size={17} color="currentColor" />}
            </button>

            {/* Claude Waveform Icon (matching screenshot) */}
            <button
              type="button"
              className="composer-waveform p-1.5 rounded-lg text-claude-text-secondary hover:text-claude-text-primary hover:bg-claude-surface transition-colors"
              title="Voice Mode"
            >
              <ClaudeWaveform size={17} color="currentColor" />
            </button>

            {/* Send / Stop Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isStreaming && !isReadyToSend}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                isStreaming
                  ? 'bg-[#DA7756] hover:bg-[#C86545] text-white shadow'
                  : isReadyToSend
                  ? 'bg-[#DA7756] hover:bg-[#C86545] text-white shadow-sm cursor-pointer'
                  : 'bg-claude-input text-claude-text-muted cursor-not-allowed'
              }`}
              title={isStreaming ? 'Stop response' : 'Send message (Enter)'}
            >
              {isStreaming ? (
                <Square className="w-3 h-3 fill-current" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.2]" />
              )}
            </button>

          </div>

        </div>

      </div>

      {/* Footer Disclaimer */}
      <p className="text-center text-[10px] text-claude-text-muted mt-2">
        Claude can make mistakes. Please double-check responses.
      </p>
    </div>
  );
};
