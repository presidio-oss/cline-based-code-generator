import { IHaiClineTask, IHaiStory, IHaiTask } from "../../interfaces/hai-task.interface";
import {
  VSCodeButton,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import { HaiStoryAccordion } from "./HaiStoryAccordion";
import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import Fuse from "fuse.js";
import { addHighlighting } from "../../utils/add-highlighting";

type SearchableTaskFields = keyof IHaiTask;
const TASK_PREFIX = "tasks."

export function HaiTasksList({
  haiTaskList,
  haiTaskLastUpdatedTs,
  selectedHaiTask,
  onCancel,
  onConfigure,
  onHaiTaskReset,
  onTaskClick,
  onStoryClick,
}: {
  haiTaskList: IHaiStory[];
  haiTaskLastUpdatedTs?: string;
  selectedHaiTask: (task: IHaiClineTask) => void;
  onCancel: () => void;
  onConfigure: (loadDefault: boolean) => void;
  onHaiTaskReset: () => void;
  onTaskClick: (task: IHaiTask) => void;
  onStoryClick: (story: IHaiStory) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAllExpanded, setIsAllExpanded] = useState(true);
  const handleFoldUnfold = (expand: boolean) => {
    setIsAllExpanded(expand);
  };

  const fuse = useMemo(() => {
    return new Fuse(haiTaskList, {
      keys: [
        "id",
        "name",
        "description",
        "storyTicketId",
        "tasks.id",
        "tasks.list",
        "tasks.subTaskTicketId"
      ],
      includeMatches: true,
      shouldSort: true,
      threshold: 0.5,
      ignoreLocation: true,
      minMatchCharLength: 1,
      isCaseSensitive: false,
    });
  }, [haiTaskList]);

  const taskSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return haiTaskList;
  
    const searchResults = fuse.search(searchQuery);
    
    return searchResults.map(({ item, matches }) => {
      const highlightedStory = { ...item };
      let hasStoryMatch = false;
  
      matches?.forEach(match => {
        if (match.key === 'id' || match.key === 'name' || match.key === 'description' || match.key === 'storyTicketId') {
          hasStoryMatch = true;
          highlightedStory[match.key] = addHighlighting(
            String(match.value),
            match.indices || []
          );
        }
      });
  
      // Process task-level matches
      const processedTasks = highlightedStory.tasks
        .map(task => {
          let hasTaskMatch = false;
          const highlightedTask = { ...task };
  
          matches?.forEach(match => {
            if (match.key?.startsWith(TASK_PREFIX)) {
              const [, field] = match.key.split('.') as [string, SearchableTaskFields];
              if (isTaskField(field) && task[field] === match.value) {
                hasTaskMatch = true;
                highlightedTask[field] = addHighlighting(
                  String(match.value),
                  match.indices || []
                );
              }
            }
          });
  
          return hasTaskMatch || hasStoryMatch ? highlightedTask : null;
        })
        .filter((task): task is IHaiTask => task !== null);
  
      if (processedTasks.length === 0) return null;
      setIsAllExpanded(true);
      
      return {
        ...highlightedStory,
        tasks: processedTasks
      };
    }).filter((story): story is IHaiStory => story !== null);
  }, [searchQuery, haiTaskList, fuse]);

  function isTaskField(key: string): key is SearchableTaskFields {
    return ['list', 'acceptance', 'id', 'subTaskTicketId'].includes(key);
  }

  return (
    <>
      <style>
        {`
          .hai-task-highlight {
            background-color: var(--vscode-editor-findMatchHighlightBackground);
            color: inherit;
          }
        `}
      </style>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: "10",
          backgroundColor: "var(--vscode-editor-background)",
        }}
      >
        <div className="hai-task-list-wrapper">
          <div className="hai-task-list-header">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3 style={{ color: "var(--vscode-foreground)", margin: 0 }}>
                  USER STORIES
                </h3>
                {haiTaskList.length > 0 && haiTaskLastUpdatedTs && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--vscode-descriptionForeground)",
                      paddingRight: "5px",
                      marginTop: "5px",
                    }}
                  >
                    {haiTaskLastUpdatedTs}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {haiTaskList.length > 0 && (
                  <>
                    <VSCodeButton
                      appearance="icon"
                      onClick={() => onConfigure(true)}
                      title="Refresh"
                    >
                  <span className="codicon codicon-refresh"></span>
                    </VSCodeButton>
                    <VSCodeButton
                      appearance="icon"
                      onClick={() => handleFoldUnfold(true)}
                      title="Expand All"
                    >
                    <span className="codicon codicon-unfold"></span>
                    </VSCodeButton>
                    <VSCodeButton
                      appearance="icon"
                      onClick={() => handleFoldUnfold(false)}
                      title="Collapse All"
                    >
                    <span className="codicon codicon-fold"></span>
                    </VSCodeButton>
                    <VSCodeButton
                      appearance="icon"
                      onClick={onHaiTaskReset}
                      title="Clear All"
                    >
                      <span className="codicon codicon-clear-all"></span>
                    </VSCodeButton>
                  </>
                )}
              </div>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <VSCodeTextField
                style={{ width: "100%" }}
                placeholder="Fuzzy search story..."
                value={searchQuery}
                onInput={(e) => {
                  const newValue = (e.target as HTMLInputElement)?.value;
                  setSearchQuery(newValue);
                }}
              >
                <div
                  slot="start"
                  className="codicon codicon-search"
                  style={{ fontSize: 13, marginTop: 2.5, opacity: 0.8 }}
                ></div>
                {searchQuery && (
                  <div
                    className="input-icon-button codicon codicon-close"
                    aria-label="Clear search"
                    onClick={() => setSearchQuery("")}
                    slot="end"
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      height: "100%",
                      cursor: "pointer",
                    }}
                  />
                )}
              </VSCodeTextField>
            </div>
          </div>
          {taskSearchResults.length > 0 ? (
            taskSearchResults.map((story) => (
              <HaiStoryAccordion
                description={story.description}
                storyTicketId={story.storyTicketId}
                key={uuidv4()}
                name={story.name}
                tasks={story.tasks}
                id={story.id}
                onTaskSelect={selectedHaiTask}
                onTaskClick={onTaskClick}
                onStoryClick={onStoryClick}
                isAllExpanded={isAllExpanded}
              />
            ))
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                marginTop: "60px",
                padding: "30px 0",
              }}
            >
              <h3 style={{ marginBottom: "0" }}>
                {searchQuery ? "No matching tasks found." : "No tasks available."}
              </h3>
              {!searchQuery && (
                <>
                  <p style={{ width: "80%", textAlign: "center" }}>
                    Choose your hai build workspace to load the tasks from the project
                  </p>
                  <VSCodeButton onClick={() => onConfigure(false)}>
                    Load Tasks
                  </VSCodeButton>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
