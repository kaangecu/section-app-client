import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import {
  BehaviorSubject,
  firstValueFrom,
  map,
  Observable,
  shareReplay,
  Subject,
  takeUntil,
} from 'rxjs';
import {
  CheckInUserGQL,
  GetRegistrationGQL,
  GetRegistrationQuery,
  LoadEventForRunningGQL,
  LoadEventForRunningQuery,
  TransactionDirection,
  TransactionStatus,
} from '@tumi/legacy-app/generated/generated';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, UntypedFormControl } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import QrScanner from 'qr-scanner';
import { retryBackoff } from 'backoff-rxjs';
import { ExtendDatePipe } from '@tumi/legacy-app/modules/shared/pipes/extended-date.pipe';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import {
  AsyncPipe,
  CurrencyPipe,
  DatePipe,
  NgFor,
  NgIf,
  NgOptimizedImage,
} from '@angular/common';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';

@Component({
  selector: 'app-event-checkin-page',
  templateUrl: './event-checkin-page.component.html',
  styleUrls: ['./event-checkin-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    BackButtonComponent,
    NgIf,
    MatFormFieldModule,
    MatSelectModule,
    ReactiveFormsModule,
    NgFor,
    MatOptionModule,
    MatButtonModule,
    RouterLink,
    AsyncPipe,
    DatePipe,
    ExtendDatePipe,
    NgOptimizedImage,
    CurrencyPipe,
  ],
})
export class EventCheckinPageComponent implements AfterViewInit, OnDestroy {
  public hideScanner$ = new BehaviorSubject(false);
  public cameras$ = new BehaviorSubject<QrScanner.Camera[]>([]);
  public cameraControl = new UntypedFormControl();
  public currentRegistration$ = new BehaviorSubject<
    | GetRegistrationQuery['registration']
    | (LoadEventForRunningQuery['event']['participantRegistrations'][0] & {
        event: LoadEventForRunningQuery['event'];
        didAttend: boolean;
      })
    | null
  >(null);
  public registrationLoading$ = new BehaviorSubject(false);
  public event$: Observable<LoadEventForRunningQuery['event']>;
  public certificatePayload$ = new BehaviorSubject<{
    name: string;
    test?: {
      type: string;
      country: string;
      result: 'Positive' | 'Negative';
      hours: number;
      date: string;
      relativeDate: string;
    };
    vaccination?: {
      doseNumber: number;
      series: number;
      date: string;
      country: string;
      relativeDate: string;
    };
    recovery?: {
      date: string;
      validFrom: string;
      validUntil: string;
      country: string;
      relativeDate: string;
      relativeUntil: string;
      relativeFrom: string;
    };
  } | null>(null);
  @ViewChild('scannerVideo') video: ElementRef<HTMLVideoElement> | undefined;
  public eventId: string;
  private loadEventQueryRef;
  private destroyed$ = new Subject();
  private scanner: QrScanner | undefined;
  private scanResult$ = new Subject<string>();

  constructor(
    private route: ActivatedRoute,
    private loadEvent: LoadEventForRunningGQL,
    private loadRegistration: GetRegistrationGQL,
    private checkInMutation: CheckInUserGQL,
    private snackBar: MatSnackBar,
  ) {
    this.loadEventQueryRef = this.loadEvent.watch({
      id: this.route.snapshot.params['eventId'],
    });
    this.eventId = this.route.snapshot.params['eventId'];
    this.event$ = this.loadEventQueryRef.valueChanges.pipe(
      map(({ data }) => data.event),
      shareReplay(1),
    );
    this.loadEventQueryRef.startPolling(5000);
  }

  async ngAfterViewInit() {
    const idTest = new RegExp(
      /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    );
    this.scanResult$.subscribe(async (result) => {
      const isID = idTest.test(result);
      if (isID) {
        this.scanner?.stop();
        this.hideScanner$.next(true);
        this.registrationLoading$.next(true);
        const event = await firstValueFrom(this.event$);
        const registration = event.participantRegistrations.find(
          (r) => r.id === result,
        );
        if (registration) {
          this.currentRegistration$.next({
            ...registration,
            event,
            didAttend: false,
          });
        }
        // This should not need a setTimeout, but it blocks otherwise
        setTimeout(() => {
          this.loadRegistration.fetch({ id: result }).subscribe(({ data }) => {
            this.registrationLoading$.next(false);
            this.currentRegistration$.next(data.registration);
          });
        }, 100);
      }
    });
    if (this.video?.nativeElement) {
      this.scanner = new QrScanner(
        this.video?.nativeElement,
        (result) => {
          if (typeof result === 'string') {
            this.scanResult$.next(result);
          }
          this.scanResult$.next(result.data);
        },
        {
          maxScansPerSecond: 2,
          highlightScanRegion: true,
          highlightCodeOutline: true,
        },
      );
      await this.scanner.setCamera('environment');
    } else {
      this.snackBar.open('No video element found');
    }
    this.scanner?.start();
    const cameras = await QrScanner.listCameras(true);
    this.cameras$.next(cameras);
    this.cameraControl.setValue(cameras[0].id);
    this.cameraControl.valueChanges
      .pipe(takeUntil(this.destroyed$))
      .subscribe((camera) => {
        this.scanner?.setCamera(camera);
      });
  }

  getRelevantTransaction(
    transactions: {
      status: TransactionStatus;
      direction: TransactionDirection;
      amount: any;
    }[],
  ) {
    return transactions.find(
      (t) => t.direction === TransactionDirection.UserToTumi,
    );
  }

  ngOnDestroy(): void {
    this.scanner?.stop();
    this.scanner?.destroy();
    this.loadEventQueryRef.stopPolling();
    this.destroyed$.next(true);
    this.destroyed$.complete();
    this.scanResult$.complete();
  }

  showScanner(): void {
    this.hideScanner$.next(false);
    this.certificatePayload$.next(null);
  }

  async checkInUser() {
    this.snackBar.open('Checking in...');
    const registration = this.currentRegistration$.value;
    if (registration) {
      try {
        await firstValueFrom(
          this.checkInMutation
            .mutate({ id: registration.id })
            .pipe(retryBackoff({ initialInterval: 100, maxRetries: 5 })),
        );
      } catch (e) {
        this.snackBar.open('Error checking in user');
      }
      this.snackBar.open('✔️ Check in successful');
      this.currentRegistration$.next(null);
      this.hideScanner$.next(false);
      this.scanner?.start();
    } else {
      this.snackBar.open('⚠️ No registration loaded');
    }
  }
}
