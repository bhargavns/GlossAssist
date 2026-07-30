import { getExampleLengthCategory, selectBalancedStudyExamples } from './studyExamples';

const rows = [
  { transcript: 'one' },
  { transcript: 'one two three four' },
  { transcript: 'one two' },
  { transcript: 'one two three four five' },
  { transcript: 'one two three' },
  { transcript: 'one two three four five six' }
];

describe('study example selection', () => {
  test('classifies transcripts with three or fewer words as short', () => {
    expect(getExampleLengthCategory('one two three')).toBe('short');
    expect(getExampleLengthCategory('one two three four')).toBe('long');
  });

  test('selects an equal number of short and long examples while preserving source order', () => {
    const selected = selectBalancedStudyExamples(rows, 4, false);

    expect(selected).toEqual([rows[0], rows[1], rows[2], rows[3]]);
    expect(selected.filter((row) => getExampleLengthCategory(row.transcript) === 'short')).toHaveLength(2);
    expect(selected.filter((row) => getExampleLengthCategory(row.transcript) === 'long')).toHaveLength(2);
  });

  test('rejects odd limits and datasets without enough examples in each category', () => {
    expect(() => selectBalancedStudyExamples(rows, 3, false)).toThrow('positive, even number');
    expect(() => selectBalancedStudyExamples(rows.slice(0, 3), 4, false)).toThrow('at least 2 short examples');
  });
});
