import React, { useEffect, useState } from "react";
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import styled from "styled-components";
import { vscode } from "../../utils/vscode";
import { useExtensionState } from "../../context/ExtensionStateContext";

interface CustomInstructionsMenuProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const CustomInstructionsMenu = ({
  isExpanded,
  onToggleExpand,
}: CustomInstructionsMenuProps) => {
  const [
    isHoveringCollapsibleSection,
    setIsHoveringCollapsibleSection,
  ] = useState(false);

  const {
    isCustomInstructionsEnabled,
    customInstructions,
    setIsCustomInstructionsEnabled,
    fileInstructions,
    setFileInstructions,
  } = useExtensionState();

  const [allInstructionsEnabled, setAllInstructionsEnabled] = useState<boolean>(
    (fileInstructions?.every((i) => i.enabled === true) ?? false) &&
      customInstructions !== undefined &&
      isCustomInstructionsEnabled
      ? true
      : false
  );
  
  useEffect(() => {
    setAllInstructionsEnabled(
      (fileInstructions?.every((i) => i.enabled === true) ?? false) &&
        customInstructions !== undefined &&
        isCustomInstructionsEnabled
    );
  }, [fileInstructions, customInstructions, isCustomInstructionsEnabled]);

  const toggleInstruction = (index: number) => {
    const updatedInstructions = fileInstructions ? [...fileInstructions] : [];
    updatedInstructions[index] = {
      ...updatedInstructions[index],
      enabled: !updatedInstructions[index].enabled,
    };
    setFileInstructions(updatedInstructions);
    vscode.postMessage({
      type: "fileInstructions",
      fileInstructions: updatedInstructions,
    });
    setAllInstructionsEnabled(
      (updatedInstructions?.every((i) => i.enabled === true) ?? false) &&
        customInstructions !== undefined &&
        isCustomInstructionsEnabled
    );
  };

  const toggleTextInstruction = () => {
    const value = !isCustomInstructionsEnabled;
    setIsCustomInstructionsEnabled(value);
    vscode.postMessage({
      type: "customInstructions",
      text: customInstructions,
      bool: value,
    });
    setAllInstructionsEnabled(
      (fileInstructions?.every((i) => i.enabled === true) ?? false) &&
        customInstructions !== undefined &&
        value
    );
  };

  const toggleAllInstructions = () => {
    const newValue = !allInstructionsEnabled;
    let updatedInstructions = fileInstructions?.map((instruction) => ({
      ...instruction,
      enabled: newValue,
    }));
    if (updatedInstructions) {
      setFileInstructions(updatedInstructions);
      vscode.postMessage({
        type: "fileInstructions",
        fileInstructions: updatedInstructions,
      });
    }
    setAllInstructionsEnabled(newValue);
    setIsCustomInstructionsEnabled(newValue);
    vscode.postMessage({
      type: "customInstructions",
      text: customInstructions,
      bool: newValue,
    });
  };

  return (
    <div
      style={{
        padding: "0 15px",
        marginTop: "8px",
        userSelect: "none",
        borderTop:
          "0.5px solid color-mix(in srgb, var(--vscode-titleBar-inactiveForeground) 20%, transparent)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: isExpanded ? "8px 0" : "8px 0 0 0",
          cursor: "pointer",
        }}
        onMouseEnter={() => setIsHoveringCollapsibleSection(true)}
        onMouseLeave={() => setIsHoveringCollapsibleSection(false)}
        onClick={() => onToggleExpand()}
      >
        <VSCodeCheckbox
          style={{ pointerEvents: "auto" }}
          checked={allInstructionsEnabled}
          onClick={(e) => {
            e.stopPropagation();
            toggleAllInstructions();
          }}
        />
        <CollapsibleSection
          isHovered={isHoveringCollapsibleSection}
          style={{ cursor: "pointer" }}
        >
          <span
            style={{ color: "var(--vscode-foreground)", whiteSpace: "nowrap" }}
          >
            Custom Instructions:
          </span>
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {(fileInstructions ?? []).filter((i) => i.enabled).length > 0 ||
            (customInstructions && isCustomInstructionsEnabled)
              ? `${fileInstructions
                  ?.filter((i) => i.enabled)
                  .filter((i) => i.enabled)
                  .map((i) => i.name)
                  .join(", ")}${
                  (fileInstructions?.filter((i) => i.enabled).length ?? 0) >
                    0 &&
                  customInstructions &&
                  isCustomInstructionsEnabled
                    ? ", "
                    : ""
                }${
                  customInstructions && isCustomInstructionsEnabled
                    ? "Default"
                    : ""
                }`
              : "None"}
          </span>
          <span
            className={`codicon codicon-chevron-${
              isExpanded ? "down" : "right"
            }`}
            style={{
              flexShrink: 0,
              marginLeft: isExpanded ? "2px" : "-2px",
            }}
          />
        </CollapsibleSection>
      </div>

      {isExpanded && (
        <div style={{ padding: "8px 0" }}>
          <div
            style={{
              color: "var(--vscode-descriptionForeground)",
              fontSize: "12px",
              marginBottom: "12px",
              lineHeight: "1.4",
            }}
          >
            Custom instructions allow you to define specific behaviors for the
            AI assistant. Enable instructions to include them in every
            conversation with the AI.
          </div>
          <div className="space-y-2">
            {fileInstructions?.map((instruction, index) => (
              <div key={instruction.name} style={{ margin: "6px 0" }}>
                <VSCodeCheckbox
                  checked={instruction.enabled}
                  onClick={() => toggleInstruction(index)}
                >
                  {instruction.name}
                </VSCodeCheckbox>
              </div>
            ))}
            {customInstructions && (
              <>
                <div key={customInstructions} style={{ margin: "6px 0" }}>
                  <VSCodeCheckbox
                    checked={isCustomInstructionsEnabled}
                    onClick={toggleTextInstruction}
                  >
                    Default Instructions
                  </VSCodeCheckbox>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    marginTop: "5px",
                    color: "var(--vscode-descriptionForeground)",
                  }}
                >
                  These default instructions are textual instructions provided
                  in the settings, which are added to the end of the system
                  prompt sent with every request.
                </p>
              </>
            )}
            {!customInstructions && (!fileInstructions || fileInstructions.length < 1) && (
              <p
                style={{
                  fontSize: "12px",
                  marginTop: "5px",
                  color: "var(--vscode-descriptionForeground)",
                }}
              >
                To leverage capabilities, configure instructions via the settings page "Custom Instructions" field or by uploading .md files [ex: place coding-style.md in the .hai/instructions folder].
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CollapsibleSection = styled.div<{ isHovered?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  color: ${(props) =>
    props.isHovered
      ? "var(--vscode-foreground)"
      : "var(--vscode-descriptionForeground)"};
  flex: 1;
  min-width: 0;

  &:hover {
    color: var(--vscode-foreground);
  }
`;

export default CustomInstructionsMenu;
