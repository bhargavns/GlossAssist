export function getExampleLengthCategory(transcript) {
  const wordCount = String(transcript || '').trim().split(/\s+/).filter(Boolean).length;
  return wordCount <= 3 ? 'short' : 'long';
}

function shuffleArray(input) {
  const items = [...input];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

export function selectBalancedStudyExamples(rows, limit, randomSample) {
  if (!Number.isInteger(limit) || limit <= 0 || limit % 2 !== 0) {
    throw new Error('Examples per condition must be a positive, even number so short and long examples can be balanced equally.');
  }

  const shortRows = rows.filter((row) => getExampleLengthCategory(row.transcript) === 'short');
  const longRows = rows.filter((row) => getExampleLengthCategory(row.transcript) === 'long');
  const perCategory = limit / 2;

  if (shortRows.length < perCategory || longRows.length < perCategory) {
    throw new Error(
      `This dataset needs at least ${perCategory} short examples (three words or fewer) and ${perCategory} long examples (more than three words) for a balanced selection.`
    );
  }

  const chooseRows = (categoryRows) => (randomSample ? shuffleArray(categoryRows) : categoryRows).slice(0, perCategory);
  const selectedRows = [...chooseRows(shortRows), ...chooseRows(longRows)];

  if (randomSample) {
    return shuffleArray(selectedRows);
  }

  const selectedSet = new Set(selectedRows);
  return rows.filter((row) => selectedSet.has(row));
}
