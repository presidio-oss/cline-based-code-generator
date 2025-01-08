import React, { useState, PropsWithChildren, memo } from 'react';

type AlertProps = {
    type: 'success' | 'info' | 'warning' | 'error'
    expanded?: boolean
    header?: string | React.ReactNode
    isAccordion?: boolean
};

const alertIcons: Record<string, string> = {
    success: 'codicon-check',
    info: 'codicon-info',
    warning: 'codicon-warning',
    error: 'codicon-error'
};

const Alert: React.FC<PropsWithChildren<AlertProps>> = ({ type, children, header, expanded, isAccordion }) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(expanded ?? true);

    const toggleExpand = () => {
        setIsExpanded((prev) => !prev);
    };

    const sharedStyles: React.CSSProperties = {
        margin: '5px 0',
        borderRadius: "3px",
        padding: "9px 10px 9px 14px",
        display: 'flex',
        alignItems: 'flex-start',
        flexDirection: "column",
    };

    const styles: Record<string, React.CSSProperties> = {
        success: {
            ...sharedStyles,
            backgroundColor: 'green',
            color: 'white',
        },
        info: {
            ...sharedStyles,
            backgroundColor: "var(--vscode-editor-inactiveSelectionBackground)",
            color: 'white',
        },
        warning: {
            ...sharedStyles,
            backgroundColor: '#FF0',
            color: 'black',
        },
        error: {
            ...sharedStyles,
            backgroundColor: 'red',
            color: 'white',
        },
    };

    return (
        <div style={styles[type]}>
            <div style={{ display: "flex", width: '100%' }} onClick={toggleExpand}>
                {isAccordion && (<div className={`codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} style={{ marginRight: '6px' }}></div>)}
                {isAccordion && (<div className={`codicon ${alertIcons[type]}`} style={{ marginRight: '6px', fontWeight: 'bold' }}></div>)}
                {header && (<div style={{ flexGrow: 1, fontWeight: 'bold' }}>
                    {header}
                </div>)}
            </div>
            <div style={{ paddingTop: '4px' }}>
                {isExpanded && children}
            </div>
        </div>
    );
};

export default memo(Alert);
