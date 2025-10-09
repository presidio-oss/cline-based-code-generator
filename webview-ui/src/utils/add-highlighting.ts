export function addHighlighting(text: string, indices: readonly [number, number][]): string {
	if (!indices.length) {
		return text
	}

	let result = ""
	let lastIndex = 0

	const sortedIndices = [...indices].sort((a, b) => a[0] - b[0])

	sortedIndices.forEach(([start, end]) => {
		result += text.slice(lastIndex, start)
		result += `<span class="hai-task-highlight">${text.slice(start, end + 1)}</span>`
		lastIndex = end + 1
	})

	result += text.slice(lastIndex)
	return result
}
