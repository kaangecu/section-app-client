import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import {
  AddOrganizerToEventGQL,
  AddSubmissionToEventGQL,
  DeleteEventGQL,
  Exact,
  GetEventTemplatesGQL,
  KickFromEventGQL,
  LoadEventForEditGQL,
  LoadEventForEditQuery,
  LoadUsersByStatusGQL,
  LoadUsersByStatusQuery,
  MembershipStatus,
  PublicationState,
  RegistrationMode,
  Role,
  UpdateCoreEventGQL,
  UpdateEventLocationGQL,
  UpdateEventTemplateConnectionGQL,
  UpdateGeneralEventGQL,
  UpdatePublicationGQL,
} from '@tumi/legacy-app/generated/generated';
import {
  ReactiveFormsModule,
  UntypedFormArray,
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
} from '@angular/forms';
import { DateTime } from 'luxon';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { QueryRef } from 'apollo-angular';
import {
  combineLatest,
  first,
  firstValueFrom,
  map,
  Observable,
  shareReplay,
  startWith,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { Title } from '@angular/platform-browser';
import { SelectLocationDialogComponent } from '@tumi/legacy-app/modules/shared/components/select-location-dialog/select-location-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PermissionsService } from '@tumi/legacy-app/modules/shared/services/permissions.service';
import {
  SelectWithAutocompleteDialogComponent,
  SelectWithAutocompleteDialogData,
} from '@tumi/legacy-app/modules/shared/components/select-with-autocomplete-dialog/select-with-autocomplete-dialog.component';
import { IconURLPipe } from '@tumi/legacy-app/modules/shared/pipes/icon-url.pipe';
import { UserChipComponent } from '../../../shared/components/user-chip/user-chip.component';
import { DataItemsManagerComponent } from '../../../shared/components/data-items-manager/data-items-manager.component';
import { IfRoleDirective } from '../../../shared/directives/if-role.directive';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import {
  AsyncPipe,
  NgFor,
  NgIf,
  NgOptimizedImage,
  TitleCasePipe,
} from '@angular/common';
import { BackButtonComponent } from '../../../shared/components/back-button/back-button.component';
import { MatToolbarModule } from '@angular/material/toolbar';

@Component({
  selector: 'app-event-edit-page',
  templateUrl: './event-edit-page.component.html',
  styleUrls: ['./event-edit-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    MatToolbarModule,
    BackButtonComponent,
    NgIf,
    MatButtonModule,
    RouterLink,
    MatTabsModule,
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatSelectModule,
    NgFor,
    MatOptionModule,
    IfRoleDirective,
    DataItemsManagerComponent,
    UserChipComponent,
    AsyncPipe,
    TitleCasePipe,
    IconURLPipe,
    NgOptimizedImage,
  ],
})
export class EventEditPageComponent implements OnInit, OnDestroy {
  public RegistrationMode = RegistrationMode;
  public PublicationState = PublicationState;
  public MembershipStatus = MembershipStatus;
  public Role = Role;
  public generalInformationForm: UntypedFormGroup;
  public coreInformationForm: UntypedFormGroup;
  public publicationForm: UntypedFormGroup;
  public users$: Observable<LoadUsersByStatusQuery['users']>;
  public event$: Observable<LoadEventForEditQuery['event']>;
  public organizers$: Observable<LoadEventForEditQuery['eventOrganizers']>;
  public editingProhibited$: Observable<boolean>;
  private destroyed$ = new Subject();
  private loadEventRef:
    | QueryRef<LoadEventForEditQuery, Exact<{ id: string }>>
    | undefined;

  constructor(
    private addOrganizerMutation: AddOrganizerToEventGQL,
    private addSubmissionMutation: AddSubmissionToEventGQL,
    private deleteEventGQL: DeleteEventGQL,
    private kickFromEventGQL: KickFromEventGQL,
    private dialog: MatDialog,
    private fb: UntypedFormBuilder,
    private loadEventForEditGQL: LoadEventForEditGQL,
    private loadUsers: LoadUsersByStatusGQL,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private title: Title,
    private updateCoreEventGQL: UpdateCoreEventGQL,
    private updateGeneralEventGQL: UpdateGeneralEventGQL,
    private updateLocationMutation: UpdateEventLocationGQL,
    private updatePublicationMutation: UpdatePublicationGQL,
    private updateEventTemplateGQL: UpdateEventTemplateConnectionGQL,
    private getEventTemplatesGQL: GetEventTemplatesGQL,
    public permission: PermissionsService,
  ) {
    this.publicationForm = this.fb.group({
      publicationState: ['', Validators.required],
    });
    this.generalInformationForm = this.fb.group({
      description: ['', Validators.required],
      organizerText: ['', Validators.required],
      participantText: ['', Validators.required],
    });
    this.coreInformationForm = this.fb.group({
      title: ['', Validators.required],
      icon: ['', Validators.required],
      start: ['', Validators.required],
      end: ['', Validators.required],
      registrationStart: ['', Validators.required],
      organizerRegistrationStart: ['', Validators.required],
      excludeFromRatings: [false, Validators.required],
      excludeFromStatistics: [false, Validators.required],
      enablePhotoSharing: [true, Validators.required],
      registrationMode: ['', Validators.required],
      registrationLink: ['', Validators.required],
      prices: this.fb.group({
        options: this.fb.array([], Validators.required),
      }),
      eventOrganizerId: ['', Validators.required],
      organizerSignup: [[]],
      participantSignup: [[]],
      participantLimit: ['', Validators.required],
      organizerLimit: ['', Validators.required],
      deRegistrationSettings: this.fb.group({
        participants: this.fb.group({
          deRegistrationPossible: [true, Validators.required],
          minimumDaysForDeRegistration: [
            5,
            [
              Validators.required,
              Validators.min(0),
              Validators.pattern('^[0-9]*$'),
            ],
          ],
          refundFeesOnDeRegistration: [true, Validators.required],
          movePossible: [true, Validators.required],
          minimumDaysForMove: [
            0,
            [
              Validators.required,
              Validators.min(0),
              Validators.pattern('^[0-9]*$'),
            ],
          ],
          refundFeesOnMove: [true, Validators.required],
        }),
        organizers: this.fb.group({
          deRegistrationPossible: [true, Validators.required],
          minimumDaysForDeRegistration: [
            5,
            [
              Validators.required,
              Validators.min(0),
              Validators.pattern('^[0-9]*$'),
            ],
          ],
          refundFeesOnDeRegistration: [true, Validators.required],
        }),
      }),
    });
    this.event$ = this.route.paramMap.pipe(
      map((params) =>
        this.loadEventForEditGQL.watch({ id: params.get('eventId') ?? '' }),
      ),
      tap((ref) => (this.loadEventRef = ref)),
      // @ts-ignore
      switchMap((ref) => ref.valueChanges),
      map(({ data }) => data.event),
      tap((event) => this.title.setTitle(`Edit ${event.title}`)),
      shareReplay(1),
    );
    this.organizers$ = this.route.paramMap.pipe(
      // @ts-ignore
      switchMap((params) =>
        this.loadEventForEditGQL.fetch({ id: params.get('eventId') ?? '' }),
      ),
      map(({ data }) => data.eventOrganizers),
      shareReplay(1),
    );
    this.users$ = this.event$.pipe(
      switchMap((event) =>
        this.loadUsers.fetch({
          allowList: [
            MembershipStatus.Trial,
            MembershipStatus.Full,
            MembershipStatus.Sponsor,
          ],
        }),
      ),
      map(({ data }) => data.users),
      shareReplay(1),
    );
    this.editingProhibited$ = combineLatest([
      this.permission.hasRole([Role.Admin]),
      this.event$,
    ]).pipe(
      map(
        ([permission, event]) =>
          !(permission || event?.publicationState === PublicationState.Draft),
      ),
      tap((prohibited) => {
        if (prohibited) {
          this.coreInformationForm.disable();
        }
      }),
    );
  }

  get prices() {
    return this.coreInformationForm
      .get('prices')
      ?.get('options') as UntypedFormArray;
  }

  get statusOptions() {
    return Object.values(this.MembershipStatus);
  }

  async deleteEvent() {
    const event = await firstValueFrom(this.event$);
    const confirmDelete = confirm(
      `Are you sure you want to delete ${event.title}?`,
    );
    if (confirmDelete) {
      try {
        await firstValueFrom(this.deleteEventGQL.mutate({ id: event.id }));
      } catch (e: any) {
        console.error(e);
        alert(e.message);
        return;
      }
      await this.router.navigateByUrl('/events');
    }
  }

  addPrice(): void {
    this.prices.push(
      this.fb.group({
        amount: ['', Validators.required],
        esnCardRequired: [false, Validators.required],
        allowedStatusList: [this.statusOptions, Validators.required],
        defaultPrice: [false, Validators.required],
      }),
    );
  }

  removePrice(index: number): void {
    const priceToRemove = this.prices.at(index);
    if (priceToRemove?.get('defaultPrice')?.value) {
      return;
    }
    this.prices.removeAt(index);
  }

  async ngOnInit() {
    const loader = this.snackBar.open('Loading data ⏳', undefined, {
      duration: 0,
    });
    const event = await firstValueFrom(this.event$);
    if (event?.prices?.options?.length) {
      for (let i = 0; i < event.prices.options.length; i++) {
        this.addPrice();
      }
    }
    if (event) {
      this.generalInformationForm.patchValue(event, { emitEvent: true });
      this.coreInformationForm.patchValue(
        {
          ...event,
          start: DateTime.fromISO(event.start).toISO({ includeOffset: false }),
          end: DateTime.fromISO(event.end).toISO({ includeOffset: false }),
          registrationStart: DateTime.fromISO(event.registrationStart).toISO({
            includeOffset: false,
          }),
          organizerRegistrationStart: DateTime.fromISO(
            event.organizerRegistrationStart,
          ).toISO({
            includeOffset: false,
          }),
        },
        { emitEvent: true },
      );
      this.publicationForm.patchValue(event);
    }
    this.coreInformationForm
      .get('registrationMode')
      ?.valueChanges.pipe(
        startWith(this.coreInformationForm.get('registrationMode')?.value),
        takeUntil(this.destroyed$),
      )
      .subscribe((mode) => {
        switch (mode) {
          case RegistrationMode.Stripe: {
            this.coreInformationForm.get('prices')?.enable();
            this.coreInformationForm.get('registrationLink')?.disable();
            this.coreInformationForm.get('participantLimit')?.enable();
            this.coreInformationForm.get('organizerLimit')?.enable();
            break;
          }
          case RegistrationMode.Online: {
            this.coreInformationForm.get('prices')?.disable();
            this.coreInformationForm.get('registrationLink')?.disable();
            this.coreInformationForm.get('participantLimit')?.enable();
            this.coreInformationForm.get('organizerLimit')?.enable();
            break;
          }
          case RegistrationMode.External: {
            this.coreInformationForm.get('prices')?.disable();
            this.coreInformationForm.get('registrationLink')?.enable();
            this.coreInformationForm.get('participantLimit')?.disable();
            this.coreInformationForm.get('organizerLimit')?.disable();
            break;
          }
        }
      });
    loader.dismiss();
  }

  ngOnDestroy(): void {
    this.destroyed$.next(false);
    this.destroyed$.complete();
  }

  async addOrganizer() {
    const loader = this.snackBar.open('Loading data ⏳', undefined, {
      duration: 0,
    });
    const users = await firstValueFrom(this.users$);
    const event = await firstValueFrom(this.event$);
    const choices = users.filter(
      (user) =>
        !event?.organizers.some((organizer: any) => organizer.id === user.id),
    );
    loader.dismiss();
    const userId = await this.dialog
      .open<
        SelectWithAutocompleteDialogComponent,
        SelectWithAutocompleteDialogData
      >(SelectWithAutocompleteDialogComponent, {
        data: {
          choices,
          displayAttribute: 'fullName',
          title: 'Select Organizer',
        },
      })
      .afterClosed()
      .toPromise();
    if (userId && event) {
      this.snackBar.open('Adding user ⏳', undefined, { duration: 0 });
      await this.addOrganizerMutation
        .mutate({ eventId: event.id, userId })
        .toPromise();
      if (this.loadEventRef) {
        await this.loadEventRef.refetch();
      }
      this.snackBar.open('User added ✔️');
    }
  }

  async changeTemplate() {
    const loader = this.snackBar.open('Loading data ⏳', undefined, {
      duration: 0,
    });
    const event = await firstValueFrom(this.event$);
    const templates = await firstValueFrom(this.getEventTemplatesGQL.fetch());
    const choices = templates.data.eventTemplates;
    loader.dismiss();
    const templateId = await this.dialog
      .open<
        SelectWithAutocompleteDialogComponent,
        SelectWithAutocompleteDialogData
      >(SelectWithAutocompleteDialogComponent, {
        data: {
          choices,
          displayAttribute: 'title',
          title: 'Select Template',
        },
        panelClass: 'modern',
      })
      .afterClosed()
      .toPromise();
    if (templateId && event) {
      this.snackBar.open('Updating Event ⏳', undefined, { duration: 0 });
      await firstValueFrom(
        this.updateEventTemplateGQL.mutate({ templateId, eventId: event.id }),
      );
      this.snackBar.open('User added ✔️');
    }
  }

  async removeUser(registrationId: string) {
    this.snackBar.open('Removing user ⏳', undefined, { duration: 0 });
    await firstValueFrom(
      this.kickFromEventGQL.mutate({
        registrationId,
        withRefund: false,
        refundFees: false,
      }),
    );
    if (this.loadEventRef) {
      await this.loadEventRef.refetch();
    }
    this.snackBar.open('User removed ✔️');
  }

  async updateLocation() {
    const event = await this.event$.pipe(first()).toPromise();
    const location = await firstValueFrom(
      this.dialog
        .open(SelectLocationDialogComponent, {
          minWidth: '50vw',
          panelClass: 'modern',
        })
        .afterClosed(),
    );
    if (location && event) {
      await firstValueFrom(
        this.updateLocationMutation.mutate({
          eventId: event.id,
          update: {
            location: location.structured_formatting.main_text,
            coordinates: location.position,
            googlePlaceId: location.place_id,
            googlePlaceUrl: location.url,
            isVirtual: location.isVirtual,
            onlineMeetingUrl: location.onlineMeetingUrl,
          },
        }),
      );
    }
  }

  async changePublication() {
    this.snackBar.open('Saving event ⏳', undefined, {
      duration: 0,
    });
    const event = await firstValueFrom(this.event$);
    const state = this.publicationForm.get('publicationState')?.value;
    if (state && event) {
      await this.updatePublicationMutation
        .mutate({ id: event.id, state })
        .toPromise();
      this.snackBar.open('Event saved ✔️');
    }
  }

  async onSubmit() {
    this.snackBar.open('Saving event ⏳', undefined, { duration: 0 });
    const event = await firstValueFrom(this.event$);
    if (event && this.generalInformationForm.valid) {
      const update = this.generalInformationForm.value;
      const { data } = await firstValueFrom(
        this.updateGeneralEventGQL.mutate({
          id: event.id,
          data: update,
        }),
      );
      if (data) {
        delete data.updateEventGeneralInfo.__typename;
        this.generalInformationForm.patchValue(data.updateEventGeneralInfo);
        this.snackBar.open('Event saved ✔️');
      }
    }
  }

  async onCoreSubmit() {
    this.snackBar.open('Saving event ⏳', undefined, {
      duration: 0,
    });
    const event = await firstValueFrom(this.event$);
    if (event && this.coreInformationForm.valid) {
      const update = this.coreInformationForm.value;
      const { data } = await firstValueFrom(
        this.updateCoreEventGQL.mutate({
          id: event.id,
          data: {
            organizerLimit: event.organizerLimit,
            participantLimit: event.participantLimit,
            ...update,
            start: DateTime.fromISO(update.start).toJSDate(),
            end: DateTime.fromISO(update.end).toJSDate(),
            registrationStart: DateTime.fromISO(
              update.registrationStart,
            ).toJSDate(),
            organizerRegistrationStart: DateTime.fromISO(
              update.organizerRegistrationStart,
            ).toJSDate(),
          },
        }),
      );
      if (data) {
        delete data.updateEventCoreInfo.__typename;
        this.coreInformationForm.patchValue({
          ...data.updateEventCoreInfo,
          start: DateTime.fromISO(data.updateEventCoreInfo.start).toISO({
            includeOffset: false,
          }),
          end: DateTime.fromISO(data.updateEventCoreInfo.end).toISO({
            includeOffset: false,
          }),
          registrationStart: DateTime.fromISO(
            data.updateEventCoreInfo.registrationStart,
          ).toISO({
            includeOffset: false,
          }),
          organizerRegistrationStart: DateTime.fromISO(
            data.updateEventCoreInfo.organizerRegistrationStart,
          ).toISO({
            includeOffset: false,
          }),
        });
      }
      this.snackBar.open('Event saved ✔️');
    }
    if (this.coreInformationForm.invalid) {
      this.snackBar.open('Form is not valid ❌');
    }
  }

  async reloadEvent() {
    await this.loadEventRef?.refetch();
  }
}
