export interface IHaiTask {
	list: string
	acceptance: string
	id: string
	subTaskTicketId?: string
}

export interface IHaiClineTask extends IHaiTask {
	context: string
}

export interface IHaiStory {
	id: string
	name: string
	description: string
	storyTicketId?: string
	tasks: IHaiTask[]
}
