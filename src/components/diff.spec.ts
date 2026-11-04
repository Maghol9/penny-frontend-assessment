import { computeDiff } from './diff.util';
import { LineItem } from '../models/cr.models';

const base: LineItem[] = [
	{ sku: 'SKU-A', description: 'Widget A', quantity: 10, unitPrice: 500 },
	{ sku: 'SKU-B', description: 'Widget B', quantity: 30, unitPrice: 100 },
];

describe('computeDiff', () => {
	it('detects a removed sku', () => {
		expect(computeDiff(base, [base[0]]).find((r) => r.sku === 'SKU-B')?.kind).toBe('removed');
	});

	it('detects an added sku', () => {
		const rows = computeDiff(base, [...base, { sku: 'SKU-C', description: 'C', quantity: 1, unitPrice: 5 }]);
		expect(rows.find((r) => r.sku === 'SKU-C')?.kind).toBe('added');
	});

	it('detects a quantity-only change as changed', () => {
		// SKU-A quantity 10 -> 11 (same unit price) is a real change.
		const rows = computeDiff(base, [{ ...base[0], quantity: 11 }, base[1]]);
		expect(rows.find((r) => r.sku === 'SKU-A')?.kind).toBe('changed');
	});

	it('detects description-only and price-only changes', () => {
		const rows = computeDiff(base, [
			{ ...base[0], description: 'New vendor' },
			{ ...base[1], unitPrice: 101 },
		]);
		expect(rows.map((r) => r.kind)).toEqual(['changed', 'changed']);
	});

	it('leaves identical items unchanged and does not mutate inputs', () => {
		const old = [...base];
		const rows = computeDiff(base, [...base]);
		expect(rows.map((r) => r.kind)).toEqual(['unchanged', 'unchanged']);
		expect(base).toEqual(old);
	});
});
