import React from 'react';
import {
  Globe,
  FileText,
  Flag,
  Zap,
  Palette,
  ListChecks,
  Target
} from 'lucide-react';
import { useChat } from '../context/ChatContext';

export interface ArtifactCategory {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const ARTIFACT_CATEGORIES: ArtifactCategory[] = [
  { id: 'apps', title: 'Apps and websites', icon: Globe },
  { id: 'docs', title: 'Documents and templates', icon: FileText },
  { id: 'games', title: 'Games', icon: Flag },
  { id: 'tools', title: 'Productivity tools', icon: Zap },
  { id: 'creative', title: 'Creative projects', icon: Palette },
  { id: 'quiz', title: 'Quiz or survey', icon: ListChecks },
  { id: 'scratch', title: 'Start from scratch', icon: Target }
];

interface ArtifactCategoryPickerProps {
  compact?: boolean;
  selectedCategory?: string;
  onSelect?: (title: string) => void;
}

export const ArtifactCategoryPicker: React.FC<ArtifactCategoryPickerProps> = ({
  compact = false,
  selectedCategory,
  onSelect
}) => {
  const { selectArtifactCategory } = useChat();

  const handleCardClick = (title: string) => {
    if (onSelect) {
      onSelect(title);
    } else {
      selectArtifactCategory(title);
    }
  };

  return (
    <div className={`w-full flex flex-col items-center justify-start ${compact ? 'pt-4 pb-6' : 'pt-14 sm:pt-20 pb-16'} px-4 max-w-4xl mx-auto select-none`}>
      <h2 className="text-[14px] sm:text-[15px] font-normal text-claude-text-primary text-center mb-7 max-w-xl leading-relaxed">
        Let's get cooking! Pick an artifact category or start building your idea from scratch.
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 w-full max-w-3xl">
        {ARTIFACT_CATEGORIES.map((cat) => {
          const IconComponent = cat.icon;
          const isChosen = selectedCategory === cat.title;

          return (
            <div
              key={cat.id}
              onClick={() => handleCardClick(cat.title)}
              className={`group relative p-5 h-[130px] rounded-2xl border cursor-pointer transition-all duration-150 flex flex-col justify-between shadow-sm active:scale-[0.99] ${
                isChosen
                  ? 'bg-claude-input border-[#DA7756]/60 text-claude-text-primary ring-1 ring-[#DA7756]/40'
                  : 'bg-claude-card/80 border-claude-border-subtle hover:border-claude-border hover:bg-claude-surface text-claude-text-primary'
              }`}
            >
              <span className="text-[14px] font-normal group-hover:text-claude-text-primary transition-colors leading-snug">
                {cat.title}
              </span>

              <div className={`self-end transition-colors ${isChosen ? 'text-[#DA7756]' : 'text-claude-text-muted group-hover:text-claude-text-primary'}`}>
                <IconComponent className="w-4 h-4 stroke-[1.8]" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};