import React from "react"

// React icon
export const ReactIcon = () => (
	<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
		<path
			d="M16 13.146C14.402 13.146 13.098 14.451 13.098 16.049C13.098 17.646 14.402 18.951 16 18.951C17.598 18.951 18.902 17.646 18.902 16.049C18.902 14.451 17.598 13.146 16 13.146Z"
			fill="#61DAFB"
		/>
		<path
			d="M16 9.317C10.049 9.317 4.634 10.634 4.634 16.049C4.634 21.463 10.049 22.78 16 22.78C21.951 22.78 27.366 21.463 27.366 16.049C27.366 10.634 21.951 9.317 16 9.317ZM16 20.244C13.293 20.244 11.098 18.39 11.098 16.049C11.098 13.707 13.293 11.854 16 11.854C18.707 11.854 20.902 13.707 20.902 16.049C20.902 18.39 18.707 20.244 16 20.244Z"
			fill="#61DAFB"
		/>
		<path
			d="M16 7.317C19.927 7.317 23.317 6.634 25.78 5.463C27.366 4.683 29.366 3.317 29.366 1.317C29.366 0.683 29.049 0 28.415 0C26.415 0 23.366 3.049 16 3.049C8.634 3.049 5.585 0 3.585 0C2.951 0 2.634 0.683 2.634 1.317C2.634 3.317 4.634 4.683 6.22 5.463C8.683 6.634 12.073 7.317 16 7.317Z"
			fill="#61DAFB"
		/>
		<path
			d="M16 24.78C12.073 24.78 8.683 25.463 6.22 26.634C4.634 27.415 2.634 28.78 2.634 30.78C2.634 31.415 2.951 32.098 3.585 32.098C5.585 32.098 8.634 29.049 16 29.049C23.366 29.049 26.415 32.098 28.415 32.098C29.049 32.098 29.366 31.415 29.366 30.78C29.366 28.78 27.366 27.415 25.78 26.634C23.317 25.463 19.927 24.78 16 24.78Z"
			fill="#61DAFB"
		/>
	</svg>
)

// .NET icon
export const DotNetIcon = () => (
	<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
		<path d="M3 6.5V25.5L16 29.5L29 25.5V6.5L16 2.5L3 6.5Z" fill="#512BD4" />
		<path d="M9 21.5L7 11.5H8.5L9.5 18L11 11.5H12.5L14 18L15 11.5H16.5L14.5 21.5H13L11.5 15L10 21.5H9Z" fill="white" />
		<path
			d="M17 21.5V11.5H21C22.7 11.5 24 12.8 24 14.5C24 16.2 22.7 17.5 21 17.5H18.5V21.5H17ZM18.5 16H21C21.8 16 22.5 15.3 22.5 14.5C22.5 13.7 21.8 13 21 13H18.5V16Z"
			fill="white"
		/>
	</svg>
)

// Terraform icon
export const TerraformIcon = () => (
	<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
		<path d="M12 4.5V14.5L20 9.5V0L12 4.5Z" fill="#7B42BC" />
		<path d="M22 8.5V18L30 13.5V4L22 8.5Z" fill="#7B42BC" />
		<path d="M2 9V18.5L10 23V14L2 9Z" fill="#7B42BC" />
		<path d="M12 16V25.5L20 30V20.5L12 16Z" fill="#7B42BC" />
	</svg>
)

// GenAI icon
export const GenAIIcon = () => (
	<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
		<path d="M16 2L2 9V23L16 30L30 23V9L16 2Z" fill="#00A67E" />
		<path d="M16 8L9 12V20L16 24L23 20V12L16 8Z" fill="#FFFFFF" />
		<circle cx="16" cy="16" r="4" fill="#00A67E" />
	</svg>
)

// Default icon for any other expert
export const DefaultIcon = () => (
	<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
		<circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="none" />
		<text x="16" y="20" textAnchor="middle" fill="currentColor" fontSize="14">
			?
		</text>
	</svg>
)
