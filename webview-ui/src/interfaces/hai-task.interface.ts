export interface IHaiTask {
	list: string
	acceptance: string
	id: string
	subTaskTicketId?: string
	status: string
}

export interface IHaiClineTask extends IHaiTask {
	context: string
}

export interface IHaiStory {
	id: string
	prdId: string
	name: string
	description: string
	storyTicketId?: string
	tasks: IHaiTask[]
}
