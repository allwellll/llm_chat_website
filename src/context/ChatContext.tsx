import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Conversation, Message, Artifact, Attachment, ModelProfileId, Project, ActivePageView } from '../types';
import { HistorySync, HistoryStatus } from '../services/historySync.mjs';
import { useSettings } from './SettingsContext';
import { chatApiClient } from '../services/apiClient';
import { extractArtifactsAndThinking, cleanStreamingChatText } from '../services/artifactParser';
import { conversationRootPath, sessionIdFromPath, sessionPath } from '../services/sessionPath';
import { loadSelectedModel, persistSelectedModel, validModel } from '../services/models';

interface ChatContextType {
  conversations: Conversation[];
  historyHasMore: boolean;
  loadMoreHistory: () => Promise<void>;
  searchHistory: (q:string,cursor?:string) => Promise<any>;
  conversationLoadError: string;
  retryConversationLoad: () => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  activeConversation: Conversation | null;
  isStreaming: boolean;
  selectedModel: ModelProfileId;
  setSelectedModel: (model: ModelProfileId) => void;
  activeMode: 'chat' | 'cowork';
  setActiveMode: (mode: 'chat' | 'cowork') => void;
  activeArtifact: Artifact | null;
  setActiveArtifact: (artifact: Artifact | null) => void;
  isArtifactPaneOpen: boolean;
  setIsArtifactPaneOpen: (open: boolean) => void;
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  allArtifacts: Artifact[];
  activePageView: ActivePageView;
  setActivePageView: (view: ActivePageView) => void;
  
  // Actions
  createNewConversation: (projectId?: string) => string;
  selectConversation: (id: string, options?: { history?: boolean }) => void;
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  regenerateResponse: (assistantMessageId?: string) => Promise<void>;
  editUserMessage: (userMessageId: string, newContent: string) => Promise<void>;
  retryLastRequest: () => Promise<void>;
  stopGeneration: () => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, newTitle: string) => void;
  toggleStarConversation: (id: string) => void;
  moveConversationToProject: (convId: string, targetProjectId?: string) => void;
  startNewArtifactChat: () => string;
  selectArtifactCategory: (categoryTitle: string) => Promise<void>;
  clearAllConversations: () => void;
  saveArtifact: (artifact: Artifact) => void;
  deleteArtifact: (id: string) => void;
  createNewArtifact: (title: string, type: Artifact['type'], content: string) => Artifact;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelProfileId>(loadSelectedModel);
  useEffect(() => { persistSelectedModel(selectedModel); }, [selectedModel]);
  const [activeMode, setActiveMode] = useState<'chat' | 'cowork'>('chat');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeArtifact, setActiveArtifactState] = useState<Artifact | null>(null);
  const [isArtifactPaneOpen, setIsArtifactPaneOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([]);
  const [activePageView, setActivePageView] = useState<ActivePageView>('chat');

  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>({ready:false,error:'',notice:'',pending:0,saving:false});
  const syncRef = useRef<HistorySync | null>(null);
  if (!syncRef.current) syncRef.current = new HistorySync({
    onChange: snapshot => { setConversations(snapshot.conversations); setProjects(snapshot.projects); setAllArtifacts(snapshot.artifacts); },
    onStatus: setHistoryStatus
  });
  const sync = syncRef.current;
  const [conversationLoadError,setConversationLoadError]=useState('');
  const selectedRef=useRef<string|null>(null);
  const projectSelection=useRef<string|null>(null);
  const artifactSelection=useRef<string|null>(null);
  const setActiveProject=(project:Project|null)=>{
    projectSelection.current=project?.id||null;setActiveProjectState(project?._historyUnloaded ? null : project);
    if(project?._historyUnloaded)void sync.load('project',project.id).then(full=>{if(projectSelection.current===project.id)setActiveProjectState(full);}).catch(()=>{setConversationLoadError('项目加载失败，请重新打开重试');});
  };
  const setActiveArtifact=(artifact:Artifact|null)=>{
    artifactSelection.current=artifact?.id||null;
    if(artifact?._historyUnloaded){setActiveArtifactState(null);void sync.load('artifact',artifact.id).then(full=>{if(artifactSelection.current===artifact.id)setActiveArtifactState(full);}).catch(()=>{setConversationLoadError('作品加载失败，请重新打开重试');});}
    else setActiveArtifactState(artifact);
  };
  const loadSelected=async(id:string)=>{setConversationLoadError('');try{await sync.load('conversation',id);}catch{if(selectedRef.current===id)setConversationLoadError('会话加载失败，请重试');}};
  useEffect(()=>{selectedRef.current=activeConversationId;setConversationLoadError('');if(activeConversationId)void loadSelected(activeConversationId);},[activeConversationId]);
  const streamRef = useRef(false);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void sync.start();
    const refresh = () => { if (!streamRef.current) void sync.refresh(); };
    const online = () => { void sync.flush().then(refresh); };
    const interval = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', online);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('online', online); if(uploadTimer.current)clearTimeout(uploadTimer.current); uploadTimer.current=null; };
  }, [sync]);
  useLayoutEffect(() => {
    sync.update({conversations,projects,artifacts:allArtifacts});
    const finished = streamRef.current && !isStreaming;
    streamRef.current = isStreaming;
    if (finished) {
      if(uploadTimer.current)clearTimeout(uploadTimer.current);
      uploadTimer.current=null;
      void sync.flush();
    } else if (!uploadTimer.current) {
      uploadTimer.current=setTimeout(() => { uploadTimer.current=null; void sync.flush(); }, isStreaming ? 2000 : 650);
    }
  }, [conversations,projects,allArtifacts,isStreaming,sync]);
  useEffect(() => {
    const preventLoss = (e: BeforeUnloadEvent) => { if(historyStatus.pending || isStreaming) {e.preventDefault();e.returnValue='';} };
    window.addEventListener('beforeunload',preventLoss);
    return () => window.removeEventListener('beforeunload',preventLoss);
  }, [historyStatus.pending,isStreaming]);

  // Derive active conversation
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;
  const restoredModelId = useRef<string | null>(null);
  useEffect(() => {
    if (!activeConversationId) { restoredModelId.current = null; return; }
    if (!activeConversation || activeConversation._historyUnloaded || restoredModelId.current === activeConversationId) return;
    restoredModelId.current = activeConversationId;
    setSelectedModel(validModel(activeConversation.model) ? activeConversation.model : 'opus-5');
  }, [activeConversationId, activeConversation]);

  const createNewConversation = (projectId?: string): string => {
    setActiveConversationId(null);
    setActiveArtifact(null);
    setIsArtifactPaneOpen(false);
    if (projectId) {
      const proj = projects.find((p) => p.id === projectId) || null;
      setActiveProject(proj);
    } else {
      setActiveProject(null);
    }
    setActivePageView('chat');
    window.history.replaceState(null, '', conversationRootPath());
    return '';
  };

  const selectConversation = (id: string, options: { history?: boolean } = {}) => {
    selectedRef.current=id;setConversationLoadError('');
    setActiveConversationId(id);
    void loadSelected(id);
    setActivePageView('chat');
    if (options.history !== false && sessionIdFromPath() !== id) {
      window.history.pushState(null, '', sessionPath(id));
    }
    const conv = conversations.find((c) => c.id === id);
    if (conv && !conv._historyUnloaded && validModel(conv.model)) setSelectedModel(conv.model);
    if (conv?.projectId) {
      const proj = projects.find((p) => p.id === conv.projectId) || null;
      setActiveProject(proj);
    } else {
      setActiveProject(null);
    }
    if (conv && conv.messages.length > 0) {
      const lastMsgWithArtifact = [...conv.messages].reverse().find((m) => m.artifacts && m.artifacts.length > 0);
      if (lastMsgWithArtifact && lastMsgWithArtifact.artifacts && lastMsgWithArtifact.artifacts.length > 0) {
        setActiveArtifact(lastMsgWithArtifact.artifacts[lastMsgWithArtifact.artifacts.length - 1]);
      }
    }
  };

  const saveArtifact = (artifact: Artifact) => {
    setAllArtifacts((prev) => {
      const filtered = prev.filter((a) => a.id !== artifact.id);
      return [artifact, ...filtered];
    });
  };

  const deleteArtifact = (id: string) => {
    setAllArtifacts((prev) => prev.filter((a) => a.id !== id));
    if (activeArtifact?.id === id) {
      setActiveArtifact(null);
      setIsArtifactPaneOpen(false);
    }
  };

  const createNewArtifact = (title: string, type: Artifact['type'], content: string): Artifact => {
    const newArt: Artifact = {
      id: `art-${Date.now()}`,
      identifier: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      type,
      title,
      content,
      createdAt: Date.now()
    };
    saveArtifact(newArt);
    setActiveArtifact(newArt);
    setIsArtifactPaneOpen(true);
    return newArt;
  };

  const executeStreamingResponse = async (
    convId: string,
    historyMessages: Message[],
    assistantMessageId: string,
    profileToUse: ModelProfileId
  ) => {
    setIsStreaming(true);
    let accumulatedText = '';
    let accumulatedThinking = '';

    const updateAssistantMessage = (partialText: string, partialThinking: string, streaming: boolean = true) => {
      // Hide raw code, markdown blocks, and artifact tags from the chat stream in real-time
      const { cleanText, isCrafting, artifactTitle } = cleanStreamingChatText(partialText);

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          const messages = c.messages.map((m) => {
            if (m.id !== assistantMessageId) return m;
            return {
              ...m,
              content: cleanText,
              thinkingContent: partialThinking || m.thinkingContent,
              isThinking: !cleanText || isCrafting || Boolean(partialThinking),
              thinkingStatus: isCrafting
                ? (artifactTitle ? `Crafting ${artifactTitle}` : 'Crafting')
                : (partialThinking ? 'Thinking' : 'Cooking'),
              isStreaming: streaming,
              error: undefined
            };
          });
          return { ...c, messages, updatedAt: Date.now() };
        })
      );
    };

    try {
      // Build combined system prompt including user settings, project instructions, and project files
      let combinedInstructions = settings.customInstructions || '';
      const currentConv = conversations.find((c) => c.id === convId);
      const projId = currentConv?.projectId || activeProject?.id;
      let proj = projects.find((p) => p.id === projId) || (activeProject?.id === projId ? activeProject : null);
      if(projId && (!proj || proj._historyUnloaded))proj=await sync.load('project',projId);

      if (proj) {
        if (proj.customInstructions) {
          combinedInstructions += `\n\n--- PROJECT INSTRUCTIONS: ${proj.name} ---\n${proj.customInstructions}`;
        }
        if (proj.files && proj.files.length > 0) {
          const filesContext = proj.files
            .filter((f) => f.textContent)
            .map((f) => `[Project Knowledge File: ${f.name}]\n${f.textContent}`)
            .join('\n\n');
          if (filesContext) {
            combinedInstructions += `\n\n--- PROJECT KNOWLEDGE FILES ---\n${filesContext}`;
          }
        }
      }

      await chatApiClient.streamChat(
        historyMessages,
        profileToUse,
        combinedInstructions,
        {
          onThinkingChunk: (chunk) => {
            accumulatedThinking += chunk;
            updateAssistantMessage(accumulatedText, accumulatedThinking, true);
          },
          onTextChunk: (chunk) => {
            accumulatedText += chunk;
            updateAssistantMessage(accumulatedText, accumulatedThinking, true);
          },
          onDone: () => {
            const { cleanedText, artifacts, thinkingContent } = extractArtifactsAndThinking(accumulatedText, assistantMessageId);

            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                const messages = c.messages.map((m) => {
                  if (m.id !== assistantMessageId) return m;
                  return {
                    ...m,
                    content: cleanedText || (artifacts.length > 0 ? '' : accumulatedText),
                    thinkingContent: accumulatedThinking || thinkingContent || m.thinkingContent,
                    artifacts: artifacts.length > 0 ? artifacts : undefined,
                    isThinking: false,
                    thinkingStatus: undefined,
                    isStreaming: false,
                    error: undefined
                  };
                });
                return { ...c, messages, updatedAt: Date.now() };
              })
            );

            if (artifacts.length > 0) {
              const latest = artifacts[0];
              setActiveArtifact(latest);
              setIsArtifactPaneOpen(true);
              artifacts.forEach(saveArtifact);
            }

            setIsStreaming(false);
          },
          onError: (err) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                const messages = c.messages.map((m) => {
                  if (m.id !== assistantMessageId) return m;
                  return {
                    ...m,
                    error: err.message || 'Something went wrong. Please try again.',
                    isThinking: false,
                    thinkingStatus: undefined,
                    isStreaming: false
                  };
                });
                return { ...c, messages };
              })
            );
            setIsStreaming(false);
          }
        }
      );
    } catch (err: any) {
      console.error('Streaming error:', err);
      setIsStreaming(false);
    }
  };

  const sendMessage = async (content: string, attachments: Attachment[] = []) => {
    if (!content.trim() && attachments.length === 0) return;

    setActivePageView('chat');
    let convId = activeConversationId;
    let currentConv = activeConversation;
    if(currentConv?._historyUnloaded)return;
    if(activeConversationId&&!currentConv)return;

    const userMessageId = `msg-${Date.now()}-user`;
    const assistantMessageId = `msg-${Date.now() + 1}-assistant`;

    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: Date.now()
    };

    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      thinkingContent: '',
      isThinking: true,
      thinkingStatus: 'Reasoning',
      createdAt: Date.now(),
      isStreaming: true
    };

    // Construct clean history of previous messages + new user message
    const previousHistory = currentConv ? currentConv.messages.filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content)) : [];
    const history = [...previousHistory, userMessage];

    if (!convId || !currentConv) {
      convId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newTitle = content.trim().slice(0, 38) || 'Greeting';
      const newConv: Conversation = {
        id: convId,
        title: newTitle,
        messages: [userMessage, assistantMessage],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: selectedModel,
        projectId: activeProject?.id,
        isStarred: false
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(convId);
      window.history.pushState(null, '', sessionPath(convId));
    } else {
      const isFirstMessage = currentConv.messages.length === 0;
      const newTitle = isFirstMessage ? (content.trim().slice(0, 38) || 'Greeting') : currentConv.title;
      const updatedConv: Conversation = {
        ...currentConv,
        title: newTitle,
        model: selectedModel,
        updatedAt: Date.now(),
        messages: [...currentConv.messages, userMessage, assistantMessage]
      };
      setConversations((prev) => prev.map((c) => (c.id === convId ? updatedConv : c)));
    }

    // Send clean history to streaming engine
    await executeStreamingResponse(convId, history, assistantMessageId, selectedModel);
  };

  const regenerateResponse = async (assistantMessageId?: string) => {
    if (!activeConversation || activeConversation._historyUnloaded || isStreaming) return;
    const conv = activeConversation;
    const messages = conv.messages;

    let targetIdx = assistantMessageId
      ? messages.findIndex((m) => m.id === assistantMessageId)
      : messages.length - 1;

    if (targetIdx === -1 || messages[targetIdx].role !== 'assistant') {
      targetIdx = messages.length - 1;
    }

    if (targetIdx < 1) return;

    const history = messages.slice(0, targetIdx);
    const targetMessageId = messages[targetIdx].id;

    // Reset target assistant message
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== conv.id) return c;
        const updated = c.messages.map((m, idx) =>
          idx === targetIdx
            ? { ...m, content: '', thinkingContent: '', isThinking: true, isStreaming: true, error: undefined }
            : m
        );
        return { ...c, messages: updated };
      })
    );

    await executeStreamingResponse(conv.id, history, targetMessageId, conv.model || selectedModel);
  };

  const editUserMessage = async (userMessageId: string, newContent: string) => {
    if (!activeConversation || activeConversation._historyUnloaded || isStreaming) return;
    const conv = activeConversation;
    const userIdx = conv.messages.findIndex((m) => m.id === userMessageId);
    if (userIdx === -1) return;

    setIsStreaming(true);

    const existingUserMsg = conv.messages[userIdx];
    const updatedUserMsg: Message = { ...existingUserMsg, content: newContent };

    const newAssistantMsgId = `msg-${Date.now()}-assistant`;
    const newAssistantMsg: Message = {
      id: newAssistantMsgId,
      role: 'assistant',
      content: '',
      isThinking: true,
      thinkingStatus: 'Thinking',
      createdAt: Date.now(),
      isStreaming: true
    };

    // Trim conversation up to the edited user message, then append new assistant response
    const history = [...conv.messages.slice(0, userIdx), updatedUserMsg];
    const updatedMessages = [...history, newAssistantMsg];

    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, messages: updatedMessages, updatedAt: Date.now() } : c))
    );

    await executeStreamingResponse(conv.id, history, newAssistantMsgId, conv.model || selectedModel);
  };

  const retryLastRequest = async () => {
    if (!activeConversation || activeConversation._historyUnloaded || isStreaming) return;
    await regenerateResponse();
  };

  const stopGeneration = () => {
    chatApiClient.cancel();
    setIsStreaming(false);
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
      window.history.replaceState(null, '', conversationRootPath());
      setActiveArtifact(null);
      setIsArtifactPaneOpen(false);
    }
  };

  const renameConversation = (id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle.trim() || 'Untitled' } : c))
    );
  };

  const toggleStarConversation = (id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isStarred: !c.isStarred } : c))
    );
  };

  const moveConversationToProject = (convId: string, targetProjectId?: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? { ...c, projectId: targetProjectId || undefined, updatedAt: Date.now() }
          : c
      )
    );
  };

  const startNewArtifactChat = (): string => {
    const convId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newConv: Conversation = {
      id: convId,
      title: 'Untitled',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: selectedModel,
      projectId: undefined,
      isStarred: false,
      isArtifactPicker: true
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(convId);
    window.history.pushState(null, '', sessionPath(convId));
    setActiveProject(null);
    setActivePageView('chat');
    return convId;
  };

  const selectArtifactCategory = async (categoryTitle: string) => {
    if (!activeConversationId) return;

    if (categoryTitle === 'Start from scratch') {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId
            ? { ...c, isArtifactPicker: false, title: 'Untitled' }
            : c
        )
      );
      return;
    }

    const convId = activeConversationId;
    const userMessageId = `msg-${Date.now()}-user`;
    const assistantMessageId = `msg-${Date.now() + 1}-assistant`;

    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: categoryTitle,
      createdAt: Date.now()
    };

    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      thinkingContent: '',
      isThinking: true,
      thinkingStatus: 'Reasoning',
      createdAt: Date.now(),
      isStreaming: true
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        return {
          ...c,
          title: categoryTitle,
          artifactCategory: categoryTitle,
          isArtifactPicker: true,
          messages: [userMessage, assistantMessage],
          updatedAt: Date.now()
        };
      })
    );

    // Send context prompt to LLM to produce the Claude response
    const promptForLLM: Message[] = [
      {
        id: `sys-${Date.now()}`,
        role: 'user',
        content: `I want to create an interactive artifact for "${categoryTitle}". Please acknowledge with a warm, encouraging message in Claude's style (e.g. "Great choice! There are many different types of ${categoryTitle.toLowerCase()} we could create. To get started, could you tell me:\n\n• What kind of ${categoryTitle.toLowerCase().replace(/s$/, '')} did you have in mind?\n• What's it about?\n• How do players play / what are the key features?") and ask a few friendly clarifying questions before generating the full artifact code.`,
        createdAt: Date.now()
      }
    ];

    await executeStreamingResponse(convId, promptForLLM, assistantMessageId, selectedModel);
  };

  const clearAllConversations = () => {
    void sync.clearConversations().catch(()=>setConversationLoadError('清空历史失败，请重试'));
    setActiveConversationId(null);
    setActiveArtifact(null);
    setIsArtifactPaneOpen(false);
  };

  useEffect(() => {
    if (!historyStatus.ready) return;
    const id = sessionIdFromPath();
    if (id) selectConversation(id, { history: false });
  }, [historyStatus.ready]);

  useEffect(() => {
    const onPopState = () => {
      const id = sessionIdFromPath();
      if (id) selectConversation(id, { history: false });
      else {
        setActiveConversationId(null);
        setConversationLoadError('');
        setActivePageView('chat');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  });

  return (
    <ChatContext.Provider
      value={{
        conversations,
        historyHasMore:!!sync.next,
        loadMoreHistory:()=>sync.more(),
        searchHistory:(q,cursor)=>sync.search(q,cursor),
        conversationLoadError,
        retryConversationLoad:()=>{if(activeConversationId)void loadSelected(activeConversationId);},
        activeConversationId,
        setActiveConversationId,
        activeConversation,
        isStreaming,
        selectedModel,
        setSelectedModel,
        activeMode,
        setActiveMode,
        activeArtifact,
        setActiveArtifact,
        isArtifactPaneOpen,
        setIsArtifactPaneOpen,
        activeProject,
        setActiveProject,
        projects,
        setProjects,
        allArtifacts,
        activePageView,
        setActivePageView,
        createNewConversation,
        startNewArtifactChat,
        selectArtifactCategory,
        selectConversation,
        sendMessage,
        regenerateResponse,
        editUserMessage,
        retryLastRequest,
        stopGeneration,
        deleteConversation,
        renameConversation,
        toggleStarConversation,
        moveConversationToProject,
        clearAllConversations,
        saveArtifact,
        deleteArtifact,
        createNewArtifact
      }}
    >
      <div className="flex flex-col h-dvh w-full overflow-hidden">
        <div role={historyStatus.error || historyStatus.notice ? 'alert' : 'status'} data-testid="history-sync-status" style={historyStatus.error || historyStatus.notice ? undefined : {display: 'none'}} className="shrink-0 border-b border-claude-border bg-claude-bg text-claude-text-primary px-3 py-1 text-xs flex flex-wrap items-center gap-2">
          <span>{historyStatus.error || historyStatus.notice || (!historyStatus.ready ? '正在加载共享历史…' : historyStatus.pending ? `待保存 ${historyStatus.pending} 项，请勿关闭页面` : '共享工作区 · 历史已保存到服务器')}</span>
          {(historyStatus.error || historyStatus.pending > 0) && <button className="underline p-1" onClick={() => { void (sync.ready ? sync.flush().then(() => sync.refresh()) : sync.start()); }}>重试同步</button>}
          {historyStatus.notice && <button className="underline p-1" onClick={() => setHistoryStatus(s => ({...s,notice:''}))}>关闭提示</button>}
        </div>
        <div className="flex-1 min-h-0 relative [&>div]:!h-full">
          {historyStatus.ready ? children : <div className="p-8 text-claude-text-primary bg-claude-bg h-full">正在安全加载云端历史；完成前不会上传空白状态。原始本机历史保留为迁移备份。</div>}
        </div>
      </div>
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
