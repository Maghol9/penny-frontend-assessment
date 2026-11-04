import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';
import { idle, loading, ViewState } from '../../common/view-state';
import { CrDetail, ReqUser, TimelineEntry } from '../../models/cr.models';
import { SessionService } from '../../session/session.service';
import { computeDiff, DiffRow } from '../diff.util';

/** Reviewer detail view. No state transition is optimistically shown before the API settles. */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit, OnChanges, OnDestroy {
	@Input() id!: string;
	/** Ask the hosting list to refresh after an action may have changed the CR status. */
	@Output() changed = new EventEmitter<void>();

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;
	rejectControl = new FormControl('', {
		nonNullable: true,
		validators: [Validators.required, Validators.pattern(/\S/)],
	});

	private initialized = false;
	/** Invalidates requests belonging to an old CR or a destroyed component. */
	private requestVersion = 0;

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		this.initialized = true;
		void this.load();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (this.initialized && changes['id'] && !changes['id'].firstChange) {
			void this.load();
		}
	}

	ngOnDestroy(): void {
		this.requestVersion++;
	}

	async load(): Promise<void> {
		const version = ++this.requestVersion;
		const id = this.id;
		const user = this.session.user;
		this.state = loading();
		this.submitting = false;
		this.actionError = undefined;
		this.rejectControl.reset('');
		try {
			const detail = await this.api.getChangeRequest(user, id);
			if (this.isCurrent(version, id, user)) {
				this.state = { status: 'loaded', data: detail };
			}
		} catch (err) {
			if (this.isCurrent(version, id, user)) {
				this.state = { status: 'error', data: null, error: (err as Error).message };
			}
		}
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	get timeline(): TimelineEntry[] {
		// Copy before sorting so fixture / API data is not mutated.
		return [...(this.detail?.audit ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	}

	get canApprove(): boolean {
		return this.state.status === 'loaded' && this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user);
	}

	get canReject(): boolean {
		return this.canApprove;
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	async approve(): Promise<void> {
		if (!this.canApprove || this.submitting) return;
		await this.performAction('Approve', (user, id) => this.api.approve(user, id, new Date().toISOString()));
	}

	async reject(): Promise<void> {
		if (!this.canReject || this.submitting) return;
		this.rejectControl.markAsTouched();
		this.rejectControl.updateValueAndValidity();
		const reason = this.rejectControl.value.trim();
		if (this.rejectControl.invalid || !reason) return;
		await this.performAction('Reject', (user, id) => this.api.reject(user, id, new Date().toISOString(), reason));
	}

	private isCurrent(version: number, id: string, user: ReqUser): boolean {
		return this.requestVersion === version && this.id === id && this.session.user === user;
	}

	private async performAction(name: string, run: (user: ReqUser, id: string) => Promise<CrDetail>): Promise<void> {
		const version = this.requestVersion;
		const id = this.id;
		const user = this.session.user;
		this.submitting = true;
		this.actionError = undefined;
		try {
			const updated = await run(user, id);
			if (!this.isCurrent(version, id, user)) return;
			this.state = { status: 'loaded', data: updated };
			this.rejectControl.reset('');
			this.changed.emit();
		} catch (err) {
			if (!this.isCurrent(version, id, user)) return;
			// The mock API commits a transition BEFORE settling its promise. A rejected
			// promise therefore does not prove the action failed. Fetch authoritative status.
			try {
				const latest = await this.api.getChangeRequest(user, id);
				if (!this.isCurrent(version, id, user)) return;
				this.state = { status: 'loaded', data: latest };
				this.actionError = `${name} returned an error (${(err as Error).message}). The latest status has been refreshed.`;
				this.changed.emit();
			} catch (refreshErr) {
				if (!this.isCurrent(version, id, user)) return;
				// Do not allow another action against an unconfirmed server state.
				this.state = {
					status: 'error',
					data: null,
					error: `${name} returned an error, and the latest status could not be checked: ${(refreshErr as Error).message}`,
				};
			}
		} finally {
			if (this.isCurrent(version, id, user)) this.submitting = false;
		}
	}
}
