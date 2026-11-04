import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrApiService } from '../../api/cr-api.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
import { SessionService } from '../../session/session.service';
import { CrListComponent } from './cr-list.component';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function create(user: ReqUser, settle = true): Promise<ComponentFixture<CrListComponent>> {
	TestBed.configureTestingModule({
		imports: [CrListComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrListComponent);
	fixture.detectChanges();
	if (settle) {
		await flush();
		fixture.detectChanges();
	}
	return fixture;
}

describe('CrListComponent', () => {
	it('renders only the three rows in the current organization', async () => {
		const fixture = await create(users.approver);
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row')).toHaveLength(3);
		expect(fixture.nativeElement.textContent).not.toContain('CR-9');
	});

	it('renders loading while awaiting the API', async () => {
		const fixture = await create(users.approver, false);
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).toBeNull();
	});

	it('shows the empty state when an organization has no change requests', async () => {
		const fixture = await create({ id: 'x', orgCode: 'org-empty', policies: ['cr_r_o'] });
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
	});

	it('filters visibleRows and the rendered table together', async () => {
		const fixture = await create(users.approver);
		const select: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');
		select.value = 'PENDING_APPROVAL';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		expect(fixture.componentInstance.visibleRows.map((row) => row.id)).toEqual(['CR-1']);
		const renderedRows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.cr-list__row'));
		expect(renderedRows).toHaveLength(1);
		expect(renderedRows[0].textContent).toContain('CR-1');
		select.value = 'ALL';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row')).toHaveLength(3);
	});

	it('explains an empty filter result rather than showing a blank table', async () => {
		const fixture = await create(users.approver);
		const select: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');
		select.value = 'REJECTED';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__filtered-empty').textContent).toContain('No change requests match');
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
	});

	it('renders a recoverable API error and Retry loads the data', async () => {
		const fixture = await create(users.approver, false);
		const api = TestBed.inject(CrApiService);
		// The first API call starts immediately, but failNext is inspected when its timer settles.
		api.failNext = true;
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__error')).not.toBeNull();
		const retry: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-list__error button');
		retry.click();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-list__loading')).not.toBeNull();
		await flush();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row')).toHaveLength(3);
	});
});
