export function buildTreeString(paths: string[], cwd: string): string {
	const root: Record<string, any> = {};

	paths.forEach(path => {
	  const relativePath = path.startsWith(cwd) ? path.slice(cwd.length) : path;
	  const parts = relativePath.split('/').filter(Boolean);
	  let current: { [key: string]: any } = root;

	  parts.forEach((part, index) => {
		if (!current[part]) {
		  current[part] = index === parts.length - 1 ? null : {};
		}
		current = current[part];
	  });
	});

	function buildTreeString(node: { [x: string]: any }, indent = '', isLast = true) {
		let treeString = '';
		const keys = Object.keys(node);
		keys.forEach((key, index) => {
		  const isLeaf = node[key] === null;
		  const isLastChild = index === keys.length - 1;
		  const prefix = isLast ? "└── " : "├── ";
		  const line = isLast ? "    " : "│   ";

		  treeString += indent + prefix + key + '\n';
		  if (!isLeaf) {
			treeString += buildTreeString(node[key], indent + (isLastChild ? "    " : "│   "), isLastChild);
		  }
		});
		return treeString;
	  }
  
	return buildTreeString(root);
  }
