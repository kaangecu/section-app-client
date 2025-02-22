import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MoveEventDialogComponent } from '../../move-event-dialog/move-event-dialog.component';
import { BehaviorSubject, firstValueFrom, ReplaySubject } from 'rxjs';
import {
  ReactiveFormsModule,
  UntypedFormControl,
  Validators,
} from '@angular/forms';
import { DateTime } from 'luxon';
import {
  CancelPaymentGQL,
  DeregisterFromEventGQL,
  LoadEventQuery,
  LoadUserForEventQuery,
  RegisterForEventGQL,
  SubmissionItemType,
  TransactionDirection,
} from '@tumi/legacy-app/generated/generated';
import { MatDialog } from '@angular/material/dialog';
import { Price } from '@tumi/legacy-app/utils';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PermissionsService } from '@tumi/legacy-app/modules/shared/services/permissions.service';
import { ExtendDatePipe } from '@tumi/legacy-app/modules/shared/pipes/extended-date.pipe';
import { RouterLink } from '@angular/router';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CheckAdditionalDataComponent } from '../check-additional-data/check-additional-data.component';
import {
  AsyncPipe,
  CurrencyPipe,
  DatePipe,
  NgFor,
  NgIf,
} from '@angular/common';

@Component({
  selector: 'app-stripe-event-registration',
  templateUrl: './stripe-event-registration.component.html',
  styleUrls: ['./stripe-event-registration.component.scss'],
  standalone: true,
  imports: [
    NgIf,
    CheckAdditionalDataComponent,
    MatFormFieldModule,
    MatSelectModule,
    ReactiveFormsModule,
    NgFor,
    MatOptionModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    ExtendDatePipe,
  ],
})
export class StripeEventRegistrationComponent implements OnChanges {
  @Input() public event: LoadEventQuery['event'] | null = null;
  @Input() public deRegistrationOptions: {
    deRegistrationPossible: boolean;
    minimumDaysForDeRegistration: number;
    refundFeesOnDeRegistration: boolean;
    movePossible: boolean;
    minimumDaysForMove: number;
    refundFeesOnMove: boolean;
  } | null = null;
  @Input() public user: LoadUserForEventQuery['currentUser'] | null = null;
  @Input() public bestPrice: Price | null = null;
  public availablePrices$ = new ReplaySubject<Price[]>(1);
  public priceControl = new UntypedFormControl(null, Validators.required);
  public processing = new BehaviorSubject(false);
  public infoCollected$ = new BehaviorSubject<unknown | null>(null);
  public SubmissionItemType = SubmissionItemType;

  constructor(
    private registerForEventGQL: RegisterForEventGQL,
    private deregisterFromEventGQL: DeregisterFromEventGQL,
    private cancelPaymentGQL: CancelPaymentGQL,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private permissions: PermissionsService,
  ) {}

  get lastDeRegistration() {
    if (!this.event?.start || !this.deRegistrationOptions) {
      return new Date();
    }
    return DateTime.fromISO(this.event?.start)
      .minus({ days: this.deRegistrationOptions.minimumDaysForDeRegistration })
      .toJSDate();
  }
  get lastMove() {
    if (!this.event?.start || !this.deRegistrationOptions) {
      return new Date();
    }
    return DateTime.fromISO(this.event?.start)
      .minus({ days: this.deRegistrationOptions.minimumDaysForMove })
      .toJSDate();
  }

  get lastPayment() {
    if (!this.activeStripePayment) {
      return new Date();
    }
    return DateTime.fromISO(this.activeStripePayment?.createdAt)
      .plus({ minutes: 30 })
      .toJSDate();
  }

  get canDeregister() {
    if (!this.deRegistrationOptions?.deRegistrationPossible) {
      return {
        result: false,
        reason: 'De registrations are not allowed for this event',
      };
    }
    if (this.event?.activeRegistration?.didAttend) {
      return { result: false, reason: 'You already attended this event' };
    }
    if (this.event?.activeRegistration?.status !== 'SUCCESSFUL') {
      return {
        result: false,
        reason: 'Your registration is not successful yet',
      };
    }
    if (!this.event?.start || this.lastDeRegistration < new Date()) {
      return {
        result: false,
        reason: `You can only de register this event until ${this.deRegistrationOptions?.minimumDaysForDeRegistration} days before it starts`,
      };
    }
    return { result: true, reason: '' };
  }

  get canMove() {
    if (!this.deRegistrationOptions?.movePossible) {
      return { result: false, reason: 'Moves are not allowed for this event' };
    }
    if (this.event?.activeRegistration?.didAttend) {
      return { result: false, reason: 'You already attended this event' };
    }
    if (this.event?.activeRegistration?.status !== 'SUCCESSFUL') {
      return {
        result: false,
        reason: 'Your registration is not successful yet',
      };
    }
    if (!this.event?.start || this.lastMove < new Date()) {
      return {
        result: false,
        reason: `You can only move this event until ${this.deRegistrationOptions?.minimumDaysForMove} days before it starts`,
      };
    }
    return { result: true, reason: '' };
  }

  get activeStripePayment() {
    const payment = this.event?.activeRegistration?.transactions?.find(
      (transaction) =>
        transaction.direction === TransactionDirection.UserToTumi,
    )?.stripePayment;
    return payment;
  }

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['event']) {
      const prices = await firstValueFrom(
        this.permissions.getPricesForUser(
          changes['event'].currentValue.prices.options,
          new Date(changes['event'].currentValue.start),
        ),
      );
      if (this.bestPrice) {
        this.priceControl.setValue(this.bestPrice);
      }
      this.availablePrices$.next(prices);
    }
    if (changes['bestPrice']) {
      this.priceControl.setValue(this.bestPrice);
    }
  }

  async cancelPayment() {
    this.processing.next(true);
    if (this.event && this.event.activeRegistration) {
      try {
        await firstValueFrom(
          this.cancelPaymentGQL.mutate({
            registrationId: this.event.activeRegistration.id,
          }),
        );
        this.processing.next(false);
      } catch (e: unknown) {
        this.processing.next(false);
        if (e instanceof Error) {
          this.snackBar.open(`❗ There was an error: ${e.message}`, undefined, {
            duration: 10000,
          });
          this.processing.next(false);
        }
      }
    }
  }

  async register() {
    this.processing.next(true);

    if (this.event) {
      let data;
      try {
        const res = await firstValueFrom(
          this.registerForEventGQL.mutate({
            eventId: this.event.id,
            price: this.priceControl.value,
            submissions: this.infoCollected$.value,
          }),
        );
        data = res.data;

        const payment =
          data?.registerForEvent.activeRegistration?.transactions?.find(
            (transaction) =>
              transaction.direction === TransactionDirection.UserToTumi,
          )?.stripePayment;

        if (!payment) {
          throw new Error('No payment found');
        }
        await this.openPaymentSession(payment.checkoutUrl);
      } catch (e: unknown) {
        this.processing.next(false);
        if (e instanceof Error) {
          this.snackBar.open(`❗ There was an error: ${e.message}`, undefined, {
            duration: 10000,
          });
        }
        return;
      }
    }
    this.processing.next(false);
  }

  async deregister() {
    this.processing.next(true);
    try {
      await firstValueFrom(
        this.deregisterFromEventGQL.mutate({
          registrationId: this.event?.activeRegistration?.id ?? '',
        }),
      );
    } catch (e: unknown) {
      this.processing.next(false);
      if (e instanceof Error) {
        this.snackBar.open(`❗ There was an error: ${e.message}`);
      }
      return;
    }
    this.snackBar.open('✔️ Success: Refunds can take 5-10 business days');
    this.processing.next(false);
  }

  moveEvent(): void {
    this.dialog.open(MoveEventDialogComponent, {
      data: { event: this.event },
      panelClass: 'modern',
    });
  }

  registerAdditionalData($event: unknown): void {
    this.infoCollected$.next($event);
  }

  async openPaymentSession(checkoutSession: string | null = '') {
    if (!checkoutSession) {
      return;
    }
    location.href = checkoutSession;
  }
}
