import React, { useState, useMemo, useEffect } from "react";
import Fuse from "fuse.js";
import { IHaiTask, IHaiStory, IHaiClineTask } from "../../interfaces/hai-task.interface";
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { addHighlighting } from "../../utils/add-highlighting";
import CopyClipboard from "../common/CopyClipboard";

interface DetailedViewProps {
  task: IHaiTask | null;
  story: IHaiStory | null;
  onBreadcrumbClick: (type: string) => void;
  onTaskSelect: (task: IHaiClineTask) => void;
  onTaskClick: (task: IHaiTask) => void;
}

const DetailedView: React.FC<DetailedViewProps> = ({ task, story, onTaskSelect,  onBreadcrumbClick, onTaskClick }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<IHaiTask | null>(null);
  
  useEffect(() => {
    setSelectedTask(task);
  }, [task]);

  // Fuse.js setup for fuzzy search
  const fuse = useMemo(() => {
    if (!story) return null;
    return new Fuse(story.tasks, {
      keys: ["list", "id", "subTaskTicketId"],
      includeMatches: true,
      threshold: 0.5,
      minMatchCharLength: 1,
      ignoreLocation: true,
    });
  }, [story]);

  // Filter tasks based on the search query and apply highlighting
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim() || !fuse) return story?.tasks || [];
    const results = fuse.search(searchQuery);
    return results.map(({ item, matches }) => {
      const highlightedTask = { ...item };
      matches?.forEach(match => {
        if (match.key && match.indices && isTaskField(match.key)) {
          highlightedTask[match.key] = addHighlighting(
            String(match.value),
            match.indices
          );
        }
      });
      return highlightedTask;
    });
  }, [searchQuery, fuse, story]);

  function isTaskField(key: string): key is keyof IHaiTask {
    return ['list', 'id', 'subTaskTicketId', 'acceptance'].includes(key);
  }

  // Breadcrumb logic with component rendering
  const breadcrumb = useMemo(() => {
    if (selectedTask && story) {
      return (
        <>
          <span onClick={() => onBreadcrumbClick("USER_STORIES")} style={{ cursor: "pointer", color: "#3794FF" }}>USER STORIES</span> {" / "}
          <span onClick={() => onBreadcrumbClick("USER_STORY")} style={{ cursor: "pointer", color: "#3794FF" }}>{story.id}{story.storyTicketId && ` • ${story.storyTicketId}`}</span> {" / "}
          {selectedTask.id}{selectedTask.subTaskTicketId && ` • ${selectedTask.subTaskTicketId}`}
        </>
      );
    } else if (story) {
      return (
        <>
          <span onClick={() => onBreadcrumbClick("USER_STORIES")} style={{ cursor: "pointer", color: "#3794FF" }}>USER STORIES</span> {" / "}
          {story.id}{story.storyTicketId && ` • ${story.storyTicketId}`}
        </>
      );
    }
    return "";
  }, [selectedTask, story, onBreadcrumbClick]);

  return (
    <div>
      <style>
        {`
          .hai-task-highlight {
            background-color: var(--vscode-editor-findMatchHighlightBackground);
            color: inherit;
          }
        `}
      </style>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: "10px", fontWeight: "bold" }}>
        <span>{breadcrumb}</span>
      </nav>

      {/* Render Story Details */}
      {!selectedTask && story && (
        <>
          <h2>{story.name}</h2>
          <p>{story.description}</p>

          {/* Search Bar */}
          <VSCodeTextField
            style={{ width: "100%", margin: "10px 0", textAlign: "left" }}
            placeholder="Search tasks..."
            value={searchQuery}
            onInput={(e) =>
              setSearchQuery((e.target as HTMLInputElement).value)
            }
          >
            {searchQuery && (
              <span
                className="codicon codicon-clear-all"
                slot="end"
                style={{ cursor: "pointer" }}
                onClick={() => setSearchQuery("")}
              />
            )}
          </VSCodeTextField>

          {/* Task List */}
          <div>
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  minWidth: 0,
                  gap: "8px",
                  padding: "8px 0",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    padding: "0 8px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      display: "flex",
                      flexDirection: "row",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "inherit",
                        fontWeight: "bold",
                        color: "var(--vscode-descriptionForeground)",
                      }}
                    >
                      <span dangerouslySetInnerHTML={{ __html: task.id }} />
                      {task.subTaskTicketId && (
                        <span
                          style={{
                            fontSize: "12px",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            color: "var(--vscode-descriptionForeground)",
                            textOverflow: "ellipsis",
                          }}
                          dangerouslySetInnerHTML={{
                            __html: ` • ${task.subTaskTicketId}`,
                          }}
                        />
                      )}{" "}
                    </span>
                  </div>
                  <span
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: "vertical",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                  }}
                  dangerouslySetInnerHTML={{ __html: task.list }} />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexShrink: 0,
                    opacity: 0.8,
                  }}
                >
                <VSCodeButton
                    appearance="icon"
                    title="Execute Task"
                    onClick={() => {
                      onTaskSelect({
                        context: `${story?.name}: ${story?.description}`,
                        ...task,
                        id: `${story?.id}-${task.id}`
                      })
                    }}
                  >
                  <span className="codicon codicon-play" style={{ fontSize: 14, cursor: 'pointer' }} />
                  </VSCodeButton>
                  <CopyClipboard
                    title="Copy Task"
                    onCopyContent={() => {
                      return `Task (${task.id}): ${task.list}` + '\n' 
                      + `Acceptance: ${task.acceptance}` + '\n\n'
                      + `Context:` + '\n'
                      + `Story (${story?.id}): ${story?.name}` + '\n'
                      + `Story Acceptance: ${story?.description}` + '\n'
                    }}
                  />
                  <VSCodeButton
                    appearance="icon"
                    title="View Task"
                    onClick={() => {
                      setSelectedTask(task);
                      onTaskClick(task);
                    }}
                  >
                  <span
                    className="codicon codicon-eye"
                    style={{ fontSize: 14, cursor: 'pointer' }}
                  />
                  </VSCodeButton>
                </div>
              </div>
            ))}
            {filteredTasks.length === 0 && (
              <p style={{ textAlign: "center", marginTop: "20px" }}>
                No matching tasks found.
              </p>
            )}
          </div>
        </>
      )}

      {/* Render Task Details */}
      {selectedTask && (
        <>
          <h2>{selectedTask.list}</h2>
          <p>{selectedTask.acceptance}</p>
          <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
            <VSCodeButton appearance="primary" onClick={() => {
										onTaskSelect({
                      context: `${story?.name}: ${story?.description}`,
											...selectedTask,
											id: `${story?.id}-${selectedTask.id}`
										})
									}}>Execute Task</VSCodeButton>
          </div>
        </>
      )}
    </div>
  );
};

export default DetailedView;
