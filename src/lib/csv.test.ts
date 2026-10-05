import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('leaves plain values as they are', () => {
    expect(csvCell('Fuel')).toBe('Fuel');
    expect(csvCell(1250.5)).toBe('1250.5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Fuel, Makkah')).toBe('"Fuel, Makkah"');
    expect(csvCell('the "big" one')).toBe('"the ""big"" one"');
    expect(csvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
  });

  it('stops a spreadsheet from running text as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+966500000000')).toBe("'+966500000000");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    // Negative numbers stay numbers.
    expect(csvCell(-500)).toBe('-500');
  });

  it('builds rows with CRLF line endings', () => {
    expect(toCsv([['Date', 'Amount'], ['2026-08-05', 5000]])).toBe('Date,Amount\r\n2026-08-05,5000\r\n');
  });
});
