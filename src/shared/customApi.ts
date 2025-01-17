export type HaiBuildContextOptions = {
    useIndex: boolean
    useContext: boolean
    appContext?: string
	excludeFolders?: string
    useSyncWithApi: boolean
}

export type HaiBuildIndexProgress = {
    type: 'codeContext' | 'codeIndex'
    progress: number
    ts: string
    isInProgress: boolean
    isCodeIndexEverCompleted?: boolean
    isCodeContextEverCompleted?: boolean
    isPaused?: boolean
}

export type HaiInstructionFile = { 
    name: string
    enabled?: boolean
    content?: string 
}