export interface ICodeIndexProgress {
    type: 'start' | 'count' | 'total' | 'done' | 'progress'
    value?: number
    start?: boolean
    total?: number
    done?: true
    ignore?: boolean
}