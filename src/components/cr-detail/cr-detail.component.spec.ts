import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrApiService } from '../../api/cr-api.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
import { SessionService } from '../../session/session.service';
import { CrDetailComponent } from './cr-detail.component';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function create(user: ReqUser, id: string, settle = true): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges();
	if (settle) {
		await flush();
		fixture.detectChanges();
	}
	return fixture;
}

describe('CrDetailComponent', () => {
	it('renders a loading state then the detail title', async () => {
		const fixture = await create(users.approver, 'CR-1', false);
		expect(fixture.nativeElement.querySelector('.cr-detail__loading')).not.toBeNull();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('renders a correct diff with money totals/delta and oldest-first timeline', async () => {
		const fixture = await create(users.approver, 'CR-1');
		const el: HTMLElement = fixture.nativeElement;
		expect(el.querySelector('.cr-diff__row[data-kind="changed"]')?.textContent).toContain('SKU-A');
		expect(el.querySelector('.cr-diff__row[data-kind="unchanged"]')?.textContent).toContain('SKU-B');
		expect(el.querySelector('.cr-detail__totals')?.textContent).toContain('USD 8,000.00');
		expect(el.querySelector('.cr-detail__totals')?.textContent).toContain('USD 8,500.00');
		expect(el.querySelector('.cr-detail__delta')?.textContent).toContain('USD 500.00');
		const timelineActions = Array.from(el.querySelectorAll('.cr-timeline__action')).map((node) => node.textContent?.trim());
		expect(timelineActions).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
	});

	it('disables Approve and hides Reject for a read-only viewer', async () => {
		const fixture = await create(users.viewer, 'CR-1');
		const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(btn.disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('disables actions for non-pending CRs even for an approver', async () => {
		const fixture = await create(users.approver, 'CR-2');
		expect((fixture.nativeElement.querySelector('.cr-actions__approve') as HTMLButtonElement).disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('returns an error without showing cross-organization data', async () => {
		const fixture = await create(users.otherOrg, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__error')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-detail__header')).toBeNull();
	});

	it('validates rejection reason and sends its trimmed value', async () => {
		const fixture = await create(users.approver, 'CR-1');
		const api = TestBed.inject(CrApiService);
		const spy = jest.spyOn(api, 'reject');
		const reason: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');
		const reject: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__reject-btn');
		expect(reject.disabled).toBe(true);
		reason.value = '   ';
		reason.dispatchEvent(new Event('input'));
		reason.dispatchEvent(new Event('blur'));
		fixture.detectChanges();
		expect(reject.disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reason-error')).not.toBeNull();
		reason.value = '  Incorrect quantity  ';
		reason.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(reject.disabled).toBe(false);
		reject.click();
		fixture.detectChanges();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][3]).toBe('Incorrect quantity');
		await flush();
		fixture.detectChanges();
		expect(fixture.componentInstance.detail?.status).toBe('REJECTED');
		expect(fixture.nativeElement.textContent).toContain('Incorrect quantity');
	});

	it('disables actions while submitting and prevents a duplicate approval', async () => {
		const fixture = await create(users.approver, 'CR-1');
		const api = TestBed.inject(CrApiService);
		api.latencyMs = 20;
		const spy = jest.spyOn(api, 'approve');
		const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		btn.click();
		fixture.detectChanges();
		expect(btn.disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__submitting')).not.toBeNull();
		void fixture.componentInstance.approve();
		expect(spy).toHaveBeenCalledTimes(1);
		await pause(30);
		fixture.detectChanges();
		expect(fixture.componentInstance.detail?.status).toBe('APPROVED');
		expect(fixture.nativeElement.querySelector('.cr-timeline__list').textContent).toContain('APPROVE');
	});

	it('rechecks status after failed action response because mock API may have committed it', async () => {
		const fixture = await create(users.approver, 'CR-1');
		const api = TestBed.inject(CrApiService);
		api.failNext = true;
		const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		btn.click();
		await flush(); // rejected action, followed by a new getChangeRequest()
		await flush(); // reconciliation read
		fixture.detectChanges();
		expect(fixture.componentInstance.detail?.status).toBe('APPROVED');
		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('latest status');
		expect((fixture.nativeElement.querySelector('.cr-actions__approve') as HTMLButtonElement).disabled).toBe(true);
	});

	it('reloads when selected CR id changes without showing stale details', async () => {
		const fixture = await create(users.approver, 'CR-1');
		fixture.componentInstance.id = 'CR-2';
		fixture.componentInstance.ngOnChanges({ id: new SimpleChange('CR-1', 'CR-2', false) });
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__loading')).not.toBeNull();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Replace SKU-B supplier');
	});
});

describe('CrDetailComponent additional error and navigation scenarios', () => {
	it('hides stale decision controls when action failure cannot be reconciled', async () => {
		const fixture = await create(users.approver, 'CR-1');
		const api = TestBed.inject(CrApiService);
		api.failNext = true;
		jest.spyOn(api, 'getChangeRequest').mockRejectedValueOnce(new Error('Refresh unavailable'));
		const button: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		button.click();
		await flush();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-detail__error')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-actions__approve')).toBeNull();
	});

	it('rejects a decision after an earlier request has already completed', async () => {
		const fixture = await create(users.approver, 'CR-1');
		const api = TestBed.inject(CrApiService);
		const spy = jest.spyOn(api, 'approve');
		await fixture.componentInstance.approve();
		fixture.detectChanges();
		expect(fixture.componentInstance.detail?.status).toBe('APPROVED');
		await fixture.componentInstance.approve();
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
