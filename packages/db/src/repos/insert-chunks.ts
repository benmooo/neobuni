const chunkItems = <T>(items: T[], chunkSize: number): T[][] => {
	if (chunkSize <= 0) {
		throw new Error(`chunkSize must be > 0. Received: ${chunkSize}`);
	}

	return items.reduce<T[][]>((chunks, item, index) => {
		const chunkIndex = Math.floor(index / chunkSize);
		const existingChunk = chunks[chunkIndex] ?? [];

		return [
			...chunks.slice(0, chunkIndex),
			[...existingChunk, item],
			...chunks.slice(chunkIndex + 1),
		];
	}, []);
};

export { chunkItems };
