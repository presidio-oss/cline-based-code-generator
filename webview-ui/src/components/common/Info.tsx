export enum InfoStatus {
    SUCCESS = 'success',
    FAILED = 'failed',
    WARNING = 'warning'
}

const isValidInfoStatus = (value: string): value is InfoStatus => {
    return Object.values(InfoStatus).includes(value as InfoStatus);
};

const Info = ({
    status,
    statusLabel,
    isLoading = false,
    loadingText = 'Loading...'
}: {
    status: InfoStatus,
    statusLabel: string,
    isLoading: boolean,
    loadingText?: string
}) => {
    if (!isValidInfoStatus(status)) {
        console.error(`Invalid status value: "${status}". Expected one of ${Object.values(InfoStatus).join(', ')}.`);
        return null;
    }

    const infoConfig: { [key: string]: { color: string, icon: string } } = {
        [InfoStatus.SUCCESS]: {
            color: 'var(--vscode-charts-green)',
            icon: 'pass'
        },
        [InfoStatus.FAILED]: {
            color: 'var(--vscode-errorForeground)',
            icon: 'x'
        },
        [InfoStatus.WARNING]: {
            color: 'var(--vscode-errorForeground)',
            icon: 'warning'
        }
    }

    return (
        <span
            style={{
                fontWeight: 500,
                color: isLoading ? 'var(--vscode-foreground)' : infoConfig[status].color,
            }}>
            <i
                className={`codicon codicon-${isLoading ? 'info' : infoConfig[status].icon}`}
                style={{
                    marginRight: '4px',
                    fontSize: '15px',
                    fontWeight: 700,
                    display: "inline-block",
                    verticalAlign: "bottom",
                }}></i>
            {isLoading ? loadingText : statusLabel}
        </span>
    )
}

export default Info;