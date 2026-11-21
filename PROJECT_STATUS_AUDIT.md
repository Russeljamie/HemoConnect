# HemoConnect Project Status Audit

**Audit date:** 21 November 2026  
**Audit mode:** Read-only review of the current working tree. No source, configuration, or database changes were made for this audit. The only permitted new file is this report.

## Evidence and verification limits

- Findings below are based on the checked-in source and the current working tree. At audit start, `HEAD` was `4524d33` (`Deletion of stock insights module`), while the worktree already had modified stock-management files and pre-existing untracked `backups/` and `server/tests/hospitalInventoryMovements.test.js`. Those changes were not created or altered during this audit.
- `prisma migrate status` was run as a read-only check. It reported 16 migrations and “Database schema is up to date” for the configured local PostgreSQL database.
- Tests, frontend build, and server startup were **not run** in this audit. The integration suites create and update database records; the audit restriction prohibits commands that may change state. Therefore, implementation status below describes code found, not independently confirmed live behavior.
- No `.env` values or other secret values are included in this report. Environment variable names only are listed.

## 1. Project overview

### Stack and versions

- **Frontend:** React SPA with Vite, React Router, Axios, and Leaflet/OpenStreetMap. Declared dependency ranges include React `^19.2.8`, Vite `^8.3.0`, React Router `^7.18.4`, Axios `^1.20.0`, and Leaflet `^1.9.4` in [client/package.json](./client/package.json).
- **Backend:** Node.js CommonJS application using Express, JWT, bcryptjs, Prisma, PostgreSQL, Nodemailer, and express-validator. Declared ranges include Express `^5.2.1`, Prisma and `@prisma/client` `^7.10.0`, PostgreSQL driver `pg ^8.16.3`, JWT `^9.0.3`, and Nodemailer `^10.3.1` in [package.json](./package.json).
- **Runtime observed:** Node `v24.21.0`, npm `11.19.0`. The repository does not declare a Node engine range in the opened package manifests.

### Folder structure

- [client/src](./client/src): React application, role dashboards, pages, components, routes, and API services.
- [server](./server): Express app, route modules, controllers, middleware, services, utilities, and Jest/Supertest tests.
- [prisma](./prisma): Prisma schema, SQL migration history, and seed script.
- [generated](./generated): generated Prisma artifacts.

### Running the application

The root [package.json](./package.json) defines `npm run dev` for the backend. The frontend defines `npm run dev --prefix client` and `npm run build --prefix client` in [client/package.json](./client/package.json). The Vite configuration proxies `/api` to the backend on port 5000 in [client/vite.config.js](./client/vite.config.js).

The root `npm test` script is a placeholder that exits with “Error: no test specified”; Jest is a development dependency, and tests are under [server/tests](./server/tests). Integration tests use Prisma and should be run only against a disposable/test database.

### Environment variables

Names referenced by [server/config/env.js](./server/config/env.js), [client/src/services/api.js](./client/src/services/api.js), and [.env.example](./.env.example):

`DATABASE_URL`, `PORT`, `NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_URL`, `VITE_API_BASE_URL`, `ALERT_WAVE_1_RADIUS_KM`, `ALERT_WAVE_2_RADIUS_KM`, `ALERT_WAVE_3_RADIUS_KM`, `ALERT_WAVE_INTERVAL_MINUTES`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_WORKER_INTERVAL_MS`.

`NOTIFICATION_MODE` appears in [.env.example](./.env.example) but was not found being read by [server/config/env.js](./server/config/env.js) or used in the reviewed application source.

### Build/start status

**Not verified in this audit.** No build or server start was run under the read-only constraint. The browser attachment showed a client page open, but that does not verify that the current backend and worktree build or start correctly.

## 2. Database

### Prisma models by area

All models are defined in [prisma/schema.prisma](./prisma/schema.prisma). The schema contains 29 models and no Prisma `enum` declarations.

#### Identity, access, and audit

| Model | Purpose |
|---|---|
| `User` | Shared login, contact, role, account status, and password-change state. |
| `Admin` | Admin-specific profile linked one-to-one to a user; also owns campaign/admin-created NGO-user relations. |
| `PasswordResetToken` | Hashed, expiring, single-use password reset tokens linked to a user. |
| `AuditLog` | Generic record of actor, action, entity, timestamp, and JSON details. |

#### Donor, appointment, and donation operations

| Model | Purpose |
|---|---|
| `Donor` | Donor identity extension containing blood type, DOB, gender, address, coordinates, eligibility flag, last donation date, and reward points. |
| `AppointmentSlot` | Hospital-published date/time/capacity slot, with a unique slot time per hospital. |
| `Appointment` | Donor or patient visit, optionally linked to a hospital and slot. |
| `DonationRecord` | Recorded donor collection, including blood type, quantity, status, date, and optional hospital/staff/appointment references. |
| `MedicalCheckup` | Donor screening measurements and notes, linked to donor and optionally hospital staff/hospital. |
| `RequestMatch` | Per-request donor match, response status, alert wave, and distance; one match per request/donor. |
| `RewardTransaction` | Points awarded for a donation; belongs to the reward system being parked. |

#### Hospital, request, and stock operations

| Model | Purpose |
|---|---|
| `Hospital` | Hospital directory entry, contact/location, active state, and coordinates. It currently doubles as the appointment/donation site. |
| `HospitalStaff` | Staff profile linked to exactly one user and one hospital; has a free-text designation. |
| `EmergencyRequest` | Blood request, urgency, location, due date, status, fulfillment, and matching-wave state. |
| `BloodInventory` | Current units and manually configured minimum per hospital and blood type. |
| `InventoryTransaction` | Signed stock movement, reason, actor, and optional emergency request association. |
| `HospitalStockSettings` | One-per-hospital settings record with `historicalWindowDays` defaulting to 30 and optional lead time/buffer; remains in schema although the adaptive stock-insights service/API was removed. |
| `HospitalDonationNeed` | Hospital-created blood-type need, optionally associated with an NGO campaign. |

#### Patient and family assistance (features proposed for removal)

| Model | Purpose |
|---|---|
| `Patient` | Patient identity/case record; can exist without a user account. |
| `PatientAccess` | Family/representative access grants to a patient record. |
| `AssistanceEnquiry` | Public or account-submitted assistance case awaiting hospital verification and possible conversion to an official request. |

#### NGO, campaign, and outreach (features proposed for removal/parking)

| Model | Purpose |
|---|---|
| `NGO` | NGO organization profile and hospital collaboration relation. |
| `NGOUser` | NGO account membership, optionally attributed to the creating admin. |
| `Campaign` | Campaign/drive record that can be associated with an NGO, hospital, or hospital donation need. |
| `OutreachActivity` | NGO outreach program, optionally attached to a campaign. |
| `CampaignRegistration` | Donor registration for a campaign. |

#### Notifications and email delivery

| Model | Purpose |
|---|---|
| `Alert` | Generic alert record with channel and send status; no `prisma.alert`/`tx.alert` usage was found in the reviewed server/client source. |
| `Notification` | In-app/user notification, optionally related to an emergency request or campaign. |
| `EmailOutbox` | Queued transactional emails with retry state, payload, and delivery status. |

### Main relationships

- `User` is the shared identity record and has optional one-to-one profile relations to `Donor`, `Patient`, `HospitalStaff`, `NGOUser`, and `Admin`.
- A hospital has many staff members, inventory records, slots, appointments, donations, and emergency requests. Staff accounts belong to one hospital.
- A donor has many appointments, donation records, medical checkups, matches, campaign registrations, and reward transactions.
- An emergency request can link to a patient, hospital, requesting user, and creating staff member, and has many donor matches, notifications, alerts, and inventory transactions.
- Campaigns connect NGO/hospital/need records to donor registrations and outreach; notifications may also reference campaigns.
- `AuditLog` is intentionally generic: `entityType`/`entityId` do not form a database foreign key to each audited entity.

### Schema observations and design concerns

- The target eligibility system has **no questionnaire-response, deferral, rule/version, or review-decision model**. `Donor.isEligible` is only a Boolean and cannot encode a reason, deferral interval, review status, or referral outcome.
- The target blood inventory requires components and expiry tracking, but `BloodInventory` stores only aggregate units per blood type. There is no stock-lot/component/expiry model, discard/transfer movement type model, or component-level request requirement.
- Donation collection quantities are recorded in millilitres by the hospital donation endpoint, while inventory is represented as whole units. No model-level unit field or reconciliation link converts a `DonationRecord` into stock.
- `HospitalStockSettings.historicalWindowDays` defaults to 30 rather than the target 90; the current threshold is a manually stored `BloodInventory.minimumUnits`. No active adaptive calculation was found in the current source.
- `Donor.firstName`/`lastName` duplicate names already stored on `User`. `role`, many status fields, blood type, and transaction types are strings rather than enums/check-constrained values.
- `Alert` overlaps with `Notification` conceptually and appears unused in the reviewed code. `HospitalStockSettings` appears to be a leftover from the removed adaptive insights feature.
- Existing uniqueness constraints include user email, profile user IDs, inventory `(hospitalId, bloodType)`, slot `(hospitalId, slotDate, time)`, and match `(requestId, donorId)`. These are useful. Hospital display names should not automatically be unique if multiple locations/branches may share a name.
- The worker filters/ranks donor records in application code. There is no explicit spatial index or composite index for donor coordinates/eligibility/blood type in the Prisma schema; this may become a performance concern as the donor population grows. Notification and generic audit queries also lack clearly declared compound indexes on their common owner/time filters.
- `Notification` and `EmailOutbox` retain message/payload data, and donor/medical models store DOB, address, coordinates, weight, blood pressure, hemoglobin, and notes. Retention, consent, and deletion policy are not represented in the schema.

### Migration status

**Verified in sync at audit time:** the read-only Prisma migration-status check found 16 migrations and reported the configured database schema as up to date. This is a point-in-time check against the configured local database; it does not prove a separate deployment database is current.

## 3. Authentication and roles

### Current login/session behavior

- Public registration and login routes are in [server/routes/auth.routes.js](./server/routes/auth.routes.js). Passwords are hashed with bcrypt in `register` and checked with bcrypt in `login` in [server/controllers/authController.js](./server/controllers/authController.js).
- Login returns a signed JWT containing user ID, role, and `mustChangePassword`; token expiration uses `JWT_EXPIRES_IN`. The configured default is seven days in [server/config/env.js](./server/config/env.js).
- The frontend stores/reads the bearer token in browser `localStorage` through the request interceptor in [client/src/services/api.js](./client/src/services/api.js).
- Password reset uses a random token stored as a hash with expiry and email delivery via the outbox in [server/controllers/authController.js](./server/controllers/authController.js) and [server/services/email.js](./server/services/email.js).

### Current roles

The current role strings are `DONOR`, `PATIENT`, `HOSPITAL_STAFF`, `NGO`, and `ADMIN`. Public registration permits only donors and patients in `registrationValidation` in [server/middleware/authValidation.js](./server/middleware/authValidation.js). Admins can create hospital staff accounts. There is no KNBTS role, and clinician/technician distinctions are not authorization roles.

### Authorization enforcement

- `authenticate` verifies the JWT and copies its user ID/role into the request in [server/middleware/authenticate.js](./server/middleware/authenticate.js).
- `authorize` checks an allowed role and blocks users with a temporary password change required in [server/middleware/authorize.js](./server/middleware/authorize.js).
- Donor, patient, hospital, NGO, admin, and notification API route files generally put `authenticate` and role-specific `authorize` middleware on business endpoints; server-side ownership/hospital scoping is also present in controllers such as `getDonorDonation`, `getHospitalInventory`, and `listHospitalStaff`.
- Client routes use `ProtectedRoute` for navigation in [client/src/routes/AppRoutes.jsx](./client/src/routes/AppRoutes.jsx). This is a UX guard, not a substitute for API authorization.
- Intentionally public routes include health/root endpoints, public registration/login/password reset, public hospital choices, and optional-auth assistance enquiries. These are visible in [server/routes/index.js](./server/routes/index.js), [server/routes/auth.routes.js](./server/routes/auth.routes.js), and [server/routes/patient.routes.js](./server/routes/patient.routes.js).
- No unprotected hospital/donor/admin/NGO business route was identified in the route files reviewed. Generic `/api/notifications` is authentication-only rather than role-specific, but its controller scopes reads/writes by `req.user.userId`.

### Authorization risks for the target

- The signed-in role is read from the JWT; `authenticate` does not reload the user or check the current database account status on every request. An account deactivated after login may therefore retain its existing token until expiry, unless a specific controller independently checks status.
- `JWT_SECRET` has a hard-coded development fallback in [server/config/env.js](./server/config/env.js). Production startup should fail closed if a strong secret is absent rather than rely on a fallback.
- One `HOSPITAL_STAFF` role plus a free-text `HospitalStaff.designation` cannot safely distinguish clinician-only eligibility decisions from technician-only inventory operations. Adding those dashboard labels without API permission changes would not provide real separation.
- Admin status routes should receive a targeted validation review before production; they do not have the same explicit route-level parameter/body validators as many other admin routes in [server/routes/admin.routes.js](./server/routes/admin.routes.js).

## 4. Feature inventory

Statuses below describe implementation evidence. “Implemented and working” means the code path and supporting tests are present; tests were not run in this audit.

### a. Donor registration and profile

**Status: IMPLEMENTED AND WORKING (test execution not verified).**  
Donor signup validates name, email, phone, password, blood type, age range, gender, and address. `register` creates `User` and `Donor` transactionally. Donors can update profile and location and view their profile in `donorController`. Evidence: [auth.routes.js](./server/routes/auth.routes.js), [authValidation.js](./server/middleware/authValidation.js), [authController.js](./server/controllers/authController.js), [donor.routes.js](./server/routes/donor.routes.js), [donorController.js](./server/controllers/donorController.js), [Register.jsx](./client/src/pages/Register.jsx), [DonorPages.jsx](./client/src/pages/DonorPages.jsx), and tests in [donorProfile.test.js](./server/tests/donorProfile.test.js).

**Missing for target:** consent/communication preferences and a structured eligibility pre-screen; policy for updating reported health answers.

### b. Eligibility questionnaire and deferral logic

**Status: NOT STARTED.**  
No questionnaire route, response form, eligibility rules table, answer snapshot, deferral record, clinician review state, or “refer to staff” decision was found. `MedicalCheckup` stores measurements/result/notes, not the requested questionnaire. Evidence: [schema.prisma](./prisma/schema.prisma), [donor.routes.js](./server/routes/donor.routes.js), and [donorController.js](./server/controllers/donorController.js).

The requested age/weight/illness/tattoo-travel/pregnancy/medication/risk-behaviour factors are not evaluated together. DOB is validated for a donor age of 18–100 at registration, but this is not a medical questionnaire or complete donor clearance.

### c. Donation history and next-eligible-date calculation

**Status: PARTIALLY IMPLEMENTED.**  
Donors can view paginated donation history. `getDonationEligibility` computes a next date four calendar months after the last successful donation, and appointment booking checks it; hospital staff record a cleared donation and update `lastDonationDate`. Evidence: [donationEligibility.js](./server/utils/donationEligibility.js), [donorController.js](./server/controllers/donorController.js), [hospitalController.js](./server/controllers/hospitalController.js), [DonorPages.jsx](./client/src/pages/DonorPages.jsx), and [donationEligibility.test.js](./server/tests/donationEligibility.test.js).

**Missing:** target questionnaire-based temporary/permanent deferrals, next eligible dates arising from clinical answers, policy-based rules, and staff referral/override workflow. Four months is currently hard-coded and should be reviewed against the clinical standard adopted by the project.

### d. Geolocation and donor-to-hospital matching

**Status: PARTIALLY IMPLEMENTED.**  
Donors can use browser geolocation or select/drag a pin on a Leaflet/OpenStreetMap map; coordinates are stored on `Donor`. Hospital coordinates are stored on `Hospital` and set in the admin hospital directory. The emergency matching worker uses an in-code Haversine calculation, filters by exact blood type, donor `isEligible`, active user, and available coordinates, then sends waves at configured radii. Appointment search ranks the three closest active mapped hospitals by Haversine distance. Evidence: [DonorPages.jsx](./client/src/pages/DonorPages.jsx), [OpenStreetMapLocationPicker.jsx](./client/src/components/OpenStreetMapLocationPicker.jsx), [donorController.js](./server/controllers/donorController.js), [donorMatching.js](./server/services/donorMatching.js), [Hospitals.jsx](./client/src/pages/admin/Hospitals.jsx), and [adminController.js](./server/controllers/adminController.js).

**Distance method:** Haversine using Earth-radius constants; no PostGIS or external routing API was found. It is straight-line distance, not road travel time.

**Ranking limitation:** emergency candidates are sorted first by prior donation-record count descending, then points descending, and only then by distance. Distance is therefore not the primary ranking criterion. The use of reward points in matching must be removed if the reward system is parked. Tests cover distance/radius waves in [donorMatching.test.js](./server/tests/donorMatching.test.js).

**Eligibility limitation:** emergency matching checks the donor's stored `isEligible` Boolean; it does not apply the four-month next-eligible-date calculation used by appointment booking. Matching therefore does not enforce that cooldown based on the latest successful donation.

**Missing:** geospatial database query/index, service-area/road-time logic if required, structured donation-site locations distinct from hospitals, explicit handling for missing/outdated donor location, and a shared current eligibility check for emergency matching.

### e. Emergency request lifecycle

**Status: PARTIALLY IMPLEMENTED.**  
Hospital staff can create official requests; requests are matched to donors; donors can accept/decline; hospital staff can claim/release requests and record full/partial fulfillment. Fulfillment and inventory decrement are in one Prisma transaction. Requests have a needed-by date and current alert wave. Evidence: [hospital.routes.js](./server/routes/hospital.routes.js), `createHospitalRequest`, `updateHospitalRequest`, and `fulfillHospitalRequest` in [hospitalController.js](./server/controllers/hospitalController.js); `respondToDonorAlert` in [donorController.js](./server/controllers/donorController.js); [donorMatching.js](./server/services/donorMatching.js); and [HospitalPages.jsx](./client/src/pages/HospitalPages.jsx)/[DonorPages.jsx](./client/src/pages/DonorPages.jsx).

**Escalation behavior:** current radius waves default to 5, 15, and 30 km, then stop; no KNBTS assignment or escalation/acknowledgement workflow exists. The worker excludes requests whose needed-by day has passed but no explicit `EXPIRED` transition was found. The matching worker pauses further expansion when it detects an accepted donor.

**Missing:** explicit expired/cancelled/escalated lifecycle states and rules, escalation to KNBTS or a named transfusion centre, centre response/action history, SLA/timeout handling after all waves, and component/units-aware requests.

### f. Notifications

**Status: PARTIALLY IMPLEMENTED.**

- **In-app:** implemented with `Notification`, per-user retrieval/read endpoints, and request/match notifications. Evidence: [notifications.routes.js](./server/routes/notifications.routes.js), [notificationController.js](./server/controllers/notificationController.js), [requestEvents.js](./server/services/requestEvents.js), [donorMatching.js](./server/services/donorMatching.js), and [NotificationsPage.jsx](./client/src/pages/NotificationsPage.jsx).
- **Email:** Nodemailer SMTP outbox, templating, retry, and worker are implemented in [email.js](./server/services/email.js). SMTP is required for delivery. Emergency-email templates exist, but the reviewed matching code writes in-app notifications and no `enqueueEmail` call for donor emergency dispatch was found.
- **SMS:** **NOT STARTED.** Twilio appears as a package dependency, but no Twilio/SMS implementation or provider call was found in the reviewed source.

**Missing:** SMS integration, channel preferences/consent, and explicit delivery/failure observability for critical request alerts.

### g. Inventory

**Status: PARTIALLY IMPLEMENTED.**  
Current stock is tracked by hospital and blood type, with manual additions/removals, a configurable manual minimum, transaction reasons, movement report filters/export, and automatic stock deduction on request fulfillment. Evidence: `BloodInventory`/`InventoryTransaction` in [schema.prisma](./prisma/schema.prisma), `adjustHospitalInventory`, `updateHospitalInventoryMinimum`, `getHospitalInventoryTransactions`, and `fulfillHospitalRequest` in [hospitalController.js](./server/controllers/hospitalController.js), [hospital.routes.js](./server/routes/hospital.routes.js), [HospitalPages.jsx](./client/src/pages/HospitalPages.jsx), and [hospitalInventoryMovements.test.js](./server/tests/hospitalInventoryMovements.test.js).

**Adaptive 90-day threshold:** **NOT STARTED in current code.** The active UI supports manual minimums, not 90-day rolling averages. `HospitalStockSettings` remains in the schema, but no active stock-insights service/API was found. Low stock is calculated by comparing current units to manual minimum; no automatic low-stock notification was found.

**Expiry/components:** **NOT STARTED.** There is no expiry date or blood component/lot record.

**Blood drive:** the hospital appointment donation endpoint records a `DonationRecord` in millilitres but does not add `BloodInventory` units. Staff must currently add usable stock manually; no validated automatic conversion exists. Evidence: `recordHospitalAppointmentDonation` and `adjustHospitalInventory` in [hospitalController.js](./server/controllers/hospitalController.js).

### h. Dashboards

**Status: PARTIALLY IMPLEMENTED; several placeholder summaries remain.**

| Actor | Current pages/evidence | Assessment |
|---|---|---|
| Donor | Dashboard, profile, history, appointments, emergency alerts, campaigns in [App.jsx](./client/src/App.jsx), [AppRoutes.jsx](./client/src/routes/AppRoutes.jsx), [DonorPages.jsx](./client/src/pages/DonorPages.jsx). | Profile/history/alerts/appointments use APIs; campaigns and reward cards are outside target. |
| Patient | Dashboard, requests, appointments, medical notes, notifications in [App.jsx](./client/src/App.jsx), [AppRoutes.jsx](./client/src/routes/AppRoutes.jsx), [PatientPages.jsx](./client/src/pages/PatientPages.jsx), [PatientRecordPages.jsx](./client/src/pages/PatientRecordPages.jsx). | Functional current scope, but proposed for removal. |
| Hospital staff | Dashboard, inventory, requests, donation needs, appointments, staff in [App.jsx](./client/src/App.jsx), [AppRoutes.jsx](./client/src/routes/AppRoutes.jsx), [HospitalPages.jsx](./client/src/pages/HospitalPages.jsx). | Data-backed current functions; no clinician/technician distinction. |
| NGO | Dashboard, campaigns, outreach, reports, notifications in [App.jsx](./client/src/App.jsx), [AppRoutes.jsx](./client/src/routes/AppRoutes.jsx), [NgoPages.jsx](./client/src/pages/NgoPages.jsx). | Data-backed current scope, proposed for removal/parking. |
| Admin | Dashboard, user accounts, hospital directory, inventory in [App.jsx](./client/src/App.jsx), [AppRoutes.jsx](./client/src/routes/AppRoutes.jsx), [Users.jsx](./client/src/pages/admin/Users.jsx), [Hospitals.jsx](./client/src/pages/admin/Hospitals.jsx), [Inventory.jsx](./client/src/pages/admin/Inventory.jsx). | Main directory/admin functions have APIs. No KNBTS staff interface exists. |

`roleConfig` in [App.jsx](./client/src/App.jsx) contains hard-coded fallback cards/lists, including sample request, stock, and NGO campaign values. Several roles replace these with API-backed summaries after loading, but placeholders can be displayed before data is loaded or when APIs fail; remove these sample values for a trustworthy production dashboard.

### i. Admin functions

**Status: PARTIALLY IMPLEMENTED for the target actors.**  
The admin API supports dashboard summary, user listing/status management, hospital creation/status management, hospital staff account creation, and inventory listing. Relevant code: [admin.routes.js](./server/routes/admin.routes.js), [adminController.js](./server/controllers/adminController.js), and [admin pages](./client/src/pages/admin).

**Missing:** KNBTS account/centre management, clinician/technician permission setup, eligibility-rule management, donation-site management as a distinct concept, escalation oversight, and an audit-log viewer.

### j. Reporting, analytics, and audit logging

**Status: PARTIALLY IMPLEMENTED.**  
The admin dashboard aggregates active accounts/hospitals, inventory alerts, and open requests; hospital inventory provides a movement report; NGO reports exist but are out of target scope. `AuditLog` is written for request events, account/password events, hospital operations, and stock minimum changes. Evidence: [adminController.js](./server/controllers/adminController.js), [hospitalController.js](./server/controllers/hospitalController.js), [requestEvents.js](./server/services/requestEvents.js), [ngoController.js](./server/controllers/ngoController.js), and [schema.prisma](./prisma/schema.prisma).

**Missing:** 90-day per-component inventory analytics, expiration/discard reporting, KNBTS escalation/SLA reports, donor eligibility/deferral analytics, and a user-facing authorized audit-log search page.

## 5. Removal impact

The lists below cover the direct implementation and the dependencies found by searching first-party source. Some files are shared and should be refactored, not deleted wholesale.

### Patients and family assistance

**Models to remove or reshape:** `Patient`, `PatientAccess`, and `AssistanceEnquiry`; remove the optional `Appointment.patient` and `EmergencyRequest.patient` relations only after emergency requests have a patient-independent identity/contact model. `User.patient`, `Hospital.patients`, and patient-related `Notification`/request-event logic also need updates in [schema.prisma](./prisma/schema.prisma).

**Routes/API to remove or redesign:**

- `/api/patient/profile`, `/appointments`, `/medical-notes`, `/requests`, `/hospitals`, `/notifications/:notificationId/read`, and `/enquiries` in [patient.routes.js](./server/routes/patient.routes.js).
- `/api/hospital/patients`, `/patients/:patientId/access`, `/enquiries`, `/enquiries/:enquiryId/review`, and `/enquiries/:enquiryId/convert` in [hospital.routes.js](./server/routes/hospital.routes.js).
- `/api/hospital/requests` currently accepts patient details or `patientId`; refactor its payload and the `createHospitalRequest` implementation rather than removing official hospital request creation.
- Public patient registration must be removed from `/api/auth/register` and its validation; public donor registration should remain.

**Files/components with direct dependencies:** [client/src/App.jsx](./client/src/App.jsx), [client/src/routes/AppRoutes.jsx](./client/src/routes/AppRoutes.jsx), [client/src/services/api.js](./client/src/services/api.js), [client/src/pages/Register.jsx](./client/src/pages/Register.jsx), [client/src/pages/PatientPages.jsx](./client/src/pages/PatientPages.jsx), [client/src/pages/PatientRecordPages.jsx](./client/src/pages/PatientRecordPages.jsx), [client/src/pages/PublicAssistanceEnquiryPage.jsx](./client/src/pages/PublicAssistanceEnquiryPage.jsx), [server/routes/index.js](./server/routes/index.js), [server/routes/patient.routes.js](./server/routes/patient.routes.js), [server/controllers/patientController.js](./server/controllers/patientController.js), [server/controllers/hospitalController.js](./server/controllers/hospitalController.js), [server/controllers/authController.js](./server/controllers/authController.js), [server/middleware/authValidation.js](./server/middleware/authValidation.js), [server/controllers/adminController.js](./server/controllers/adminController.js), [server/services/requestEvents.js](./server/services/requestEvents.js), and [server/services/email.js](./server/services/email.js).

**Tests/retention:** [patientProfile.test.js](./server/tests/patientProfile.test.js), [hospitalProfile.test.js](./server/tests/hospitalProfile.test.js), [adminHospitalStaff.test.js](./server/tests/adminHospitalStaff.test.js), and [rbac.test.js](./server/tests/rbac.test.js) have patient assumptions. Decide whether existing patient/request history must be archived or migrated before dropping records; existing requests and audit/notification history refer to patient records.

### NGO-created drives, campaigns, and outreach

**Models to remove or reshape:** `NGO`, `NGOUser`, `Campaign`, `OutreachActivity`, and `CampaignRegistration`; remove or redesign `HospitalDonationNeed` if it exists only to solicit NGO campaigns. Update `Admin.campaigns`, `Admin.ngoUsers`, `Hospital.ngos/campaigns/donationNeeds`, `Donor.campaignRegistrations`, `Notification.campaign`, and campaign references in [schema.prisma](./prisma/schema.prisma). `Hospital` may remain the organization/site record if chosen as the donation site.

**Routes/API:** remove `/api/ngo/*` from [ngo.routes.js](./server/routes/ngo.routes.js); remove donor `/campaigns` and `/campaigns/:campaignId/register` from [donor.routes.js](./server/routes/donor.routes.js); decide whether `/api/hospital/donation-needs` remains as a hospital-to-KNBTS inventory need or is removed with campaign coordination. Generic notification reads should be retained, but remove campaign joins/fields if `Campaign` is deleted.

**Files/components with direct dependencies:** [client/src/App.jsx](./client/src/App.jsx), [client/src/routes/AppRoutes.jsx](./client/src/routes/AppRoutes.jsx), [client/src/services/api.js](./client/src/services/api.js), [client/src/pages/NgoPages.jsx](./client/src/pages/NgoPages.jsx), [client/src/pages/DonorPages.jsx](./client/src/pages/DonorPages.jsx), [client/src/pages/HospitalPages.jsx](./client/src/pages/HospitalPages.jsx), [client/src/pages/NotificationsPage.jsx](./client/src/pages/NotificationsPage.jsx), [client/src/pages/admin/Users.jsx](./client/src/pages/admin/Users.jsx), [server/routes/index.js](./server/routes/index.js), [server/routes/ngo.routes.js](./server/routes/ngo.routes.js), [server/routes/donor.routes.js](./server/routes/donor.routes.js), [server/routes/hospital.routes.js](./server/routes/hospital.routes.js), [server/controllers/ngoController.js](./server/controllers/ngoController.js), [server/controllers/donorController.js](./server/controllers/donorController.js), [server/controllers/hospitalController.js](./server/controllers/hospitalController.js), [server/controllers/adminController.js](./server/controllers/adminController.js), [server/controllers/notificationController.js](./server/controllers/notificationController.js), [server/services/email.js](./server/services/email.js), and [server/tests/ngoProfile.test.js](./server/tests/ngoProfile.test.js)/[donorProfile.test.js](./server/tests/donorProfile.test.js)/[hospitalProfile.test.js](./server/tests/hospitalProfile.test.js).

**Data retention:** campaign attendance and past registrations may be operational history, not disposable demo data; archive/export or migrate them before deleting relations. [prisma/seed.js](./prisma/seed.js) also creates NGO and campaign records.

### Rewards

**Models/fields:** remove `RewardTransaction` and `Donor.points` only after deciding how to retain historical donation points in [schema.prisma](./prisma/schema.prisma).

**Files/components:** [client/src/App.jsx](./client/src/App.jsx) displays Reward Points; [client/src/pages/DonorPages.jsx](./client/src/pages/DonorPages.jsx) shows donation reward details; [server/controllers/donorController.js](./server/controllers/donorController.js) computes reward metrics and per-donation points; [server/services/donorMatching.js](./server/services/donorMatching.js) uses points as a tie-breaker; [prisma/seed.js](./prisma/seed.js) seeds points/reward records; [server/tests/donorProfile.test.js](./server/tests/donorProfile.test.js) asserts reward metrics. There is no standalone rewards API route, but these embedded response fields and matching logic must be removed.

### Collection points as a primary target

**Current state:** no `CollectionPoint`/`DonationSite` model or collection-point API was found. Donor discovery and appointments currently use mapped `Hospital` records, and `AppointmentSlot` belongs to a hospital. This means the change is primarily a **site-model decision**, not deletion of an existing collection-point subsystem.

If a donation site may be a temporary/mobile centre or a KNBTS site rather than a hospital, add a dedicated site model and update [schema.prisma](./prisma/schema.prisma), [client/src/pages/admin/Hospitals.jsx](./client/src/pages/admin/Hospitals.jsx), [client/src/pages/DonorPages.jsx](./client/src/pages/DonorPages.jsx), [client/src/components/OpenStreetMapLocationPicker.jsx](./client/src/components/OpenStreetMapLocationPicker.jsx), [server/controllers/adminController.js](./server/controllers/adminController.js), [server/controllers/donorController.js](./server/controllers/donorController.js), and hospital appointment-slot associations. If every donation site is a hospital, document that assumption and preserve the current model.

## 6. Quality and risk

### Tests

Eleven test files were present under [server/tests](./server/tests), including suites for role access, donor profile/matching, date eligibility, hospital operations/inventory, NGO, patient support, notifications, and seed utilities. Important behavioral tests exist in [donorMatching.test.js](./server/tests/donorMatching.test.js), [donorProfile.test.js](./server/tests/donorProfile.test.js), [hospitalProfile.test.js](./server/tests/hospitalProfile.test.js), [hospitalInventoryMovements.test.js](./server/tests/hospitalInventoryMovements.test.js), and [rbac.test.js](./server/tests/rbac.test.js).

**Pass/fail: not verified.** Tests were not run because most API suites create/update records using Prisma and this audit is read-only. The root `npm test` command is not configured to run Jest.

### Error handling and validation

- `express-validator` is used on many API routes, and controller-level guards validate IDs, coordinates, dates, ownership, quantities, and state transitions.
- Express uses Helmet, CORS allowlisting, JSON body limits, and a global rate limiter in [server/app.js](./server/app.js). This is a baseline, not proof of production hardening.
- The global limit is not a dedicated login/password-reset abuse policy.
- [server/controllers/healthController.js](./server/controllers/healthController.js) is public and returns the raw database exception message in its 503 response. Keep health details generic in production.
- [server/middleware/errorHandler.js](./server/middleware/errorHandler.js) returns stack information only outside production; production configuration should be verified before deployment.
- The `JWT_SECRET` fallback and lack of per-request user-status revalidation are noted above.

### Hard-coded, mock, and stale data

- [client/src/App.jsx](./client/src/App.jsx) contains fallback dashboard sample values and lists; some are recognizable mock entries. Replace with explicit loading/empty/error states.
- [prisma/seed.js](./prisma/seed.js) contains seeded demo users, hospitals, appointments, NGOs, campaigns, patients, donations, and rewards.
- `NOTIFICATION_MODE` is documented in [.env.example](./.env.example) but not consumed by [server/config/env.js](./server/config/env.js).
- `HospitalStockSettings` remains in the schema although the adaptive insights feature was removed. No TODO/FIXME/XXX/HACK matches were found in the reviewed first-party client/server/Prisma source.
- `.env` was not tracked by Git at audit time. This check did not inspect or disclose its contents; no comprehensive secret-scanner was run.

### Security and privacy

- Password hashes, hashed reset tokens, route-level role checks, and user/hospital ownership scoping are present in the reviewed code.
- The default JWT-secret fallback, localStorage bearer-token storage, missing account-status revalidation for existing tokens, and raw health error detail are concrete hardening concerns (see [env.js](./server/config/env.js), [api.js](./client/src/services/api.js), [authenticate.js](./server/middleware/authenticate.js), and [healthController.js](./server/controllers/healthController.js)).
- Donor DOB/address/coordinates and screening measurements/notes, patient names/phone/medical notes, and request details are sensitive data. The schema provides access relations and route ownership checks in places, but a complete privacy/retention/consent review was not verified. Audit logs and email outbox payloads may also retain operational or personal details.
- Donor coordinates are central to matching; require clear user consent, purpose limitation, access controls, retention policy, and safeguards against exposing exact location in donor-facing notifications.

## 7. Gap analysis

| Module | Target requirement | Current status | Gap | Effort |
|---|---|---|---|---|
| Donor accounts | Registration/profile for donors | Implemented and working (runtime not independently verified) | Add consent/preferences and target-specific health pre-screen | S |
| Eligibility | Questionnaire with eligible/deferred/not eligible/refer outcomes | Not started | Clinical rules, questionnaire, versioning, deferral dates, staff review, audit trail | L |
| Donation history | Accurate history and next-eligible date | Partial | Existing four-month interval only; generalize to approved policy and deferral decisions | M |
| Donor/site matching | Geolocation-based donor-to-hospital/site matching | Partial | Haversine implemented; no spatial index/route distance; ranking prioritizes history/points over proximity | M |
| Donation sites | Simple locations for hospital/KNBTS/temporary sites | Not started as a distinct model | Decide whether `Hospital` can represent all sites or create a site model | M |
| Emergency requests | Lifecycle through donor response and fulfillment | Partial | Add expiry, cancellation/escalation states, KNBTS ownership/response, and SLA behavior | L |
| Roles | Donor, clinician, technician, KNBTS staff, admin | Partial | Only donor, patient, hospital staff, NGO, admin; no fine-grained clinician/technician or KNBTS roles | L |
| Notifications | In-app, email, SMS for critical actions | Partial | In-app works; SMTP outbox exists; SMS absent; emergency email templates are not wired into donor matching | M |
| Inventory | Group/component/lot stock, expiry, movement history | Partial | Aggregate blood group only; no components, expiry lots, transfer/discard handling | L |
| Adaptive thresholds | 90-day rolling average per relevant stock type | Not started | Current minimum is manually configured; no 90-day calculation or adaptive alert | M |
| Dashboards | Role-specific operational dashboards | Partial | Existing role pages, but static sample fallback values and no new actor dashboards | M |
| Admin/centre operations | Admin and KNBTS oversight | Partial | Admin manages users/hospitals/inventory; no KNBTS operations or centre escalation | L |
| Reports/audit | Operational and clinical traceability | Partial | Generic audit and basic movement report exist; target analytics/audit viewer absent | M |
| Scope reduction | Remove patients, NGO drives, rewards safely | Partial / not started | Cross-linked request, notification, donor dashboard, seed, and schema dependencies require migration | L |

## 8. Recommended implementation order

1. **Freeze policy and data-retention decisions first.** Approve the clinical eligibility authority/rules, definition of a donation site, component/expiry semantics, KNBTS responsibilities, and whether historical patient/NGO/reward data must be retained. This prevents building incompatible schemas or losing records.
2. **Refactor emergency requests away from patient accounts before deleting patient models.** Keep hospital-created official requests, but replace patient-required fields with the approved request identity/contact model. Update request notifications and audit history so emergency coordination remains functional without a `Patient` relation.
3. **Define the actor/permission matrix and add role scopes.** Introduce clinician and blood-bank-technician permissions and a KNBTS organization/staff concept. Enforce them in server middleware/controllers before exposing new client routes. Also address JWT secret validation and account deactivation/session revocation.
4. **Build the eligibility workflow with clinical approval.** Add questionnaire versions/responses, explainable outcomes, deferral dates, referral-to-staff, clinician review, and auditable overrides. Keep the final medical-clearance boundary explicit and test boundary dates and every rule branch.
5. **Choose and implement the donation-site model, then refine geolocation matching.** Support verified coordinates and site types, consent/update rules, matching eligibility filters, meaningful distance ranking, and location-missing behavior. Add indexes/appropriate geospatial strategy when scale requires it.
6. **Complete emergency escalation and reliable communications.** Add expiry/cancellation transitions, wave/timeout outcomes, KNBTS escalation and acknowledgement, idempotent jobs, and delivery/error tracking. Integrate SMS only after provider, consent, and failure-fallback decisions are approved.
7. **Build inventory lots/components/expiry and the 90-day threshold.** Define exactly which unit of stock is averaged and how donations become available stock. Then calculate thresholds from a clearly specified 90-day window, include transaction exclusions, and create actionable low-stock/expiry alerts.
8. **Remove parked features in staged migrations, not as a single destructive drop.** First hide/deprecate patient, NGO campaign/outreach, reward, and obsolete dashboard surfaces; remove their API calls and cross-feature logic; export/archive or migrate retained records; only then drop database relations/models in a reviewed migration.
9. **Replace placeholder dashboard fallbacks and add end-to-end acceptance tests.** Verify every role against real API data, inaccessible routes, location permissions, request escalation, eligibility, inventory expiry, and notification failure. Run the tests on an isolated test database and verify the build/start after the read-only audit period.

### Top five risks

1. **Clinical safety:** an inaccurate eligibility rule or deferral calculation could incorrectly encourage or prevent donation. KNBTS/clinical sign-off and versioned rules are essential.
2. **Data loss and broken request history:** patient, NGO, campaign, and reward records are linked to requests, notifications, appointments, and audits; destructive removal can orphan or erase history.
3. **Authorization mismatch:** current hospital staff is a single broad role. Clinician, technician, KNBTS, and admin permissions must be enforced by APIs, not only dashboard navigation.
4. **Inventory correctness:** donations are recorded in millilitres while stock is aggregate units; adding components and expiry without a reconciled units/movement model can lead to unsafe stock totals.
5. **Matching and alert reliability/privacy:** straight-line distance and current ranking may not select the best donors; missing locations and finite radius waves can leave requests unanswered, while precise donor location is sensitive.

## Questions to answer before implementation

1. Should a donation site always be a hospital, or must the system separately represent KNBTS centres and temporary/mobile collection sites?
2. Which clinical authority/standard supplies eligibility rules, deferral durations, and permanent deferrals, and should the application only pre-screen while leaving final clearance to a clinician?
3. What exactly may a clinician do versus a blood-bank technician, and what actions belong to KNBTS staff versus system admins?
4. Which blood components should be tracked, what defines one unit, and how should expiry, quarantine, discard, transfer, and accepted blood-drive collections affect stock?
5. At which point should a request escalate to KNBTS, who receives it, and what response time/timeout should apply after the final donor radius?
6. Do existing patient, NGO campaign/outreach, reward, and registration records need to be retained, exported, anonymized, or deleted?
7. Which notification channels are required, and what donor consent and fallback behavior should apply if SMS/email delivery fails?
